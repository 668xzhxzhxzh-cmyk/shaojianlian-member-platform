#!/usr/bin/env python3
"""Atomically cut production over to Hermes' native WeCom callback adapter.

Run this script only after the callback domain is filed, HTTPS is working, and
the ECS public IP has been added to WeCom's trusted-IP list. Secrets are read
from the terminal without echo and are written only to the two production env
files. Any failed validation restores every changed file.
"""

from __future__ import annotations

import base64
import getpass
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree

import yaml


SITE_ENV = Path("/opt/shao-coach/.env")
HERMES_HOME = Path("/var/lib/hermes/.hermes")
HERMES_ENV = HERMES_HOME / ".env"
HERMES_CONFIG = HERMES_HOME / "config.yaml"
HERMES_AGENT = HERMES_HOME / "hermes-agent"
NGINX_SITE = Path("/etc/nginx/sites-enabled/shao-coach")
BACKUP_ROOT = Path("/var/backups/shao-coach/wecom-native")
CALLBACK_PORT = 8645
CALLBACK_PATH = "/wecom/callback"
SITE_CALLBACK_PORT = 8788
SITE_CALLBACK_PATH = "/api/wecom/callback"

NGINX_BEGIN = "    # BEGIN SHAO HERMES WECOM CALLBACK"
NGINX_END = "    # END SHAO HERMES WECOM CALLBACK"
NGINX_BLOCK = f"""{NGINX_BEGIN}
    location = /api/wecom/callback {{
        proxy_pass http://127.0.0.1:{SITE_CALLBACK_PORT}{SITE_CALLBACK_PATH};
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 30s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_hide_header X-Powered-By;
    }}
    {NGINX_END}
"""

LEGACY_HERMES_KEYS = {
    "WECOM_BOT_ID",
    "WECOM_SECRET",
    "WECOM_HOME_CHANNEL",
    "WECOM_HOME_CHANNEL_NAME",
    "WECOM_HOME_CHANNEL_THREAD_ID",
    "WECOM_ALLOWED_USERS",
    "WECOM_DM_POLICY",
    "WECOM_GROUP_POLICY",
    "WECOM_GROUP_ALLOW_FROM",
}


def parse_env(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def update_env_text(text: str, updates: dict[str, str], remove: Iterable[str] = ()) -> str:
    remaining = dict(updates)
    removed = set(remove)
    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            key = line.split("=", 1)[0].strip()
            if key in removed:
                continue
            if key in remaining:
                lines.append(f"{key}={remaining.pop(key)}")
                continue
        lines.append(line)
    if lines and lines[-1] != "":
        lines.append("")
    lines.extend(f"{key}={value}" for key, value in remaining.items())
    return "\n".join(lines).rstrip() + "\n"


def build_nginx_config(text: str) -> str:
    if NGINX_BEGIN in text or NGINX_END in text:
        pattern = re.compile(
            rf"^[ \t]*{re.escape(NGINX_BEGIN.strip())}\n.*?^[ \t]*{re.escape(NGINX_END.strip())}\n?",
            re.MULTILINE | re.DOTALL,
        )
        replaced, count = pattern.subn(NGINX_BLOCK, text)
        if count != 1:
            raise RuntimeError("无法安全更新现有 Hermes 企业微信 Nginx 配置块")
        return replaced
    marker = "    location /api/ {"
    if text.count(marker) != 1:
        raise RuntimeError("Nginx 配置中没有唯一的 /api/ 入口，停止修改")
    return text.replace(marker, f"{NGINX_BLOCK}\n{marker}", 1)


def validate_inputs(corp_id: str, agent_id: str, secret: str, callback_url: str) -> None:
    if not re.fullmatch(r"ww[A-Za-z0-9_-]{6,126}", corp_id):
        raise ValueError("CorpID 格式无效")
    if not re.fullmatch(r"\d{1,20}", agent_id):
        raise ValueError("AgentID 格式无效")
    if len(secret) < 16 or not re.fullmatch(r"[A-Za-z0-9_-]+", secret):
        raise ValueError("Secret 格式或长度异常")
    parsed = urllib.parse.urlsplit(callback_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path != "/api/wecom/callback":
        raise ValueError("回调 URL 必须是 https://已备案域名/api/wecom/callback")
    try:
        socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("回调域名尚未完成公网 DNS 解析") from exc


def atomic_write(path: Path, text: str) -> None:
    stat = path.stat()
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp, stat.st_mode & 0o777)
        os.chown(temp, stat.st_uid, stat.st_gid)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def run(*args: str, timeout: int = 45) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=timeout)


def wait_json(url: str, predicate, attempts: int = 30) -> dict:
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if predicate(payload):
                return payload
        except Exception as exc:  # readiness retry, surfaced after final attempt
            last_error = exc
        time.sleep(1)
    raise RuntimeError(f"服务健康检查超时：{url}") from last_error


def wecom_api_get(path: str, params: dict[str, str]) -> dict:
    query = urllib.parse.urlencode(params)
    url = f"https://qyapi.weixin.qq.com{path}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("无法连接企业微信官方 API") from exc
    if int(data.get("errcode", -1)) != 0:
        raise RuntimeError(f"企业微信官方 API 验证失败（errcode={int(data.get('errcode', -1))}）")
    return data


def validate_wecom_credentials(corp_id: str, secret: str) -> None:
    token_data = wecom_api_get("/cgi-bin/gettoken", {"corpid": corp_id, "corpsecret": secret})
    access_token = str(token_data.get("access_token", ""))
    if not access_token:
        raise RuntimeError("企业微信未返回 access_token")
    wecom_api_get("/cgi-bin/externalcontact/get_follow_user_list", {"access_token": access_token})


def native_callback_roundtrip(callback_url: str, corp_id: str, token: str, aes_key: str) -> None:
    sys.path.insert(0, str(HERMES_AGENT))
    from plugins.platforms.wecom.wecom_crypto import WXBizMsgCrypt  # noqa: PLC0415

    crypt = WXBizMsgCrypt(token, aes_key, corp_id)
    timestamp = str(int(time.time()))
    nonce = "shao-native-validation"
    encrypted_xml = crypt.encrypt("native-hermes-callback-ok", nonce=nonce, timestamp=timestamp)
    root = ElementTree.fromstring(encrypted_xml)
    params = {
        "msg_signature": root.findtext("MsgSignature", ""),
        "timestamp": timestamp,
        "nonce": nonce,
        "echostr": root.findtext("Encrypt", ""),
    }
    url = f"{callback_url}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=15) as response:
        body = response.read().decode("utf-8")
    if response.status != 200 or body != "native-hermes-callback-ok":
        raise RuntimeError("Hermes 原生回调公网验签/AES 往返测试失败")


def update_hermes_config(text: str) -> str:
    config = yaml.safe_load(text) or {}
    platforms = config.setdefault("platforms", {})
    platforms.pop("wecom", None)
    toolsets = config.setdefault("platform_toolsets", {})
    toolsets.pop("wecom", None)
    toolsets["wecom_callback"] = ["shao-coach"]
    config.pop("WECOM_HOME_CHANNEL", None)
    return yaml.safe_dump(config, allow_unicode=True, sort_keys=False)


def main() -> int:
    if os.geteuid() != 0:
        raise SystemExit("必须以 root 运行")
    required = [SITE_ENV, HERMES_ENV, HERMES_CONFIG, NGINX_SITE]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit(f"缺少生产配置文件：{', '.join(missing)}")

    site_text = SITE_ENV.read_text(encoding="utf-8")
    site_values = parse_env(site_text)
    coach_userid = site_values.get("WECOM_ALLOWED_COACH_USERIDS", "")
    if not coach_userid or "," in coach_userid:
        raise SystemExit("必须在网站环境中且仅配置一个授权教练 userid")
    callback_token = site_values.get("WECOM_CALLBACK_TOKEN", "")
    callback_aes = site_values.get("WECOM_CALLBACK_AES_KEY", "")
    if not callback_token:
        callback_token = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    if not re.fullmatch(r"[A-Za-z0-9+/]{43}", callback_aes):
        callback_aes = base64.b64encode(os.urandom(32)).decode().rstrip("=")

    corp_id = input("企业微信 CorpID：").strip()
    agent_id = input("企业微信自建应用 AgentID：").strip()
    secret = getpass.getpass("企业微信自建应用 Secret（输入不回显）：").strip()
    default_url = site_values.get("WECOM_CALLBACK_PUBLIC_URL", "")
    callback_url = input(f"接收消息 URL{f' [{default_url}]' if default_url else ''}：").strip() or default_url
    validate_inputs(corp_id, agent_id, secret, callback_url)

    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    backup_dir = BACKUP_ROOT / stamp
    backup_dir.mkdir(parents=True, mode=0o700)
    paths = [SITE_ENV, HERMES_ENV, HERMES_CONFIG, NGINX_SITE]
    backups: dict[Path, Path] = {}
    for index, path in enumerate(paths, start=1):
        destination = backup_dir / f"{index}-{path.parent.name}-{path.name}"
        shutil.copy2(path, destination)
        backups[path] = destination

    success = False
    try:
        atomic_write(SITE_ENV, update_env_text(site_text, {
            "WECOM_CORP_ID": corp_id,
            "WECOM_APP_AGENT_ID": agent_id,
            "WECOM_APP_SECRET": secret,
            "WECOM_CONTACT_SECRET": secret,
            "WECOM_CALLBACK_TOKEN": callback_token,
            "WECOM_CALLBACK_AES_KEY": callback_aes,
            "WECOM_CALLBACK_PUBLIC_URL": callback_url,
        }))
        hermes_text = HERMES_ENV.read_text(encoding="utf-8")
        atomic_write(HERMES_ENV, update_env_text(hermes_text, {
            "WECOM_CALLBACK_CORP_ID": corp_id,
            "WECOM_CALLBACK_CORP_SECRET": secret,
            "WECOM_CALLBACK_AGENT_ID": agent_id,
            "WECOM_CALLBACK_TOKEN": callback_token,
            "WECOM_CALLBACK_ENCODING_AES_KEY": callback_aes,
            "WECOM_CALLBACK_ALLOWED_USERS": coach_userid,
            "WECOM_CALLBACK_HOST": "127.0.0.1",
            "WECOM_CALLBACK_PORT": str(CALLBACK_PORT),
            "WECOM_ALLOWED_COACH_USERIDS": coach_userid,
        }, LEGACY_HERMES_KEYS))
        atomic_write(HERMES_CONFIG, update_hermes_config(HERMES_CONFIG.read_text(encoding="utf-8")))

        validate_wecom_credentials(corp_id, secret)
        run("systemctl", "restart", "hermes-gateway.service", timeout=60)
        wait_json(
            f"http://127.0.0.1:{CALLBACK_PORT}/health",
            lambda data: data.get("status") == "ok" and data.get("platform") == "wecom_callback",
        )

        atomic_write(NGINX_SITE, build_nginx_config(NGINX_SITE.read_text(encoding="utf-8")))
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        run("systemctl", "restart", "shao-api.service", timeout=60)
        wait_json(
            "http://127.0.0.1:8788/health",
            lambda data: data.get("ok") is True
            and data.get("integrations", {}).get("wecomContact") is True
            and data.get("integrations", {}).get("wecomCallback") is True
            and data.get("integrations", {}).get("wecomApp") is True,
        )
        native_callback_roundtrip(callback_url, corp_id, callback_token, callback_aes)
        success = True
    finally:
        secret = ""
        if not success:
            for path, backup in backups.items():
                shutil.copy2(backup, path)
            subprocess.run(["nginx", "-t"], check=False, capture_output=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=False, capture_output=True)
            subprocess.run(["systemctl", "restart", "hermes-gateway.service"], check=False, capture_output=True)
            subprocess.run(["systemctl", "restart", "shao-api.service"], check=False, capture_output=True)

    print("企业微信凭据、客户联系权限和 Hermes 原生回调均已验证。")
    print("下一步可在教练明确确认后执行一条真实应用消息和一条客户联系发送任务测试。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
