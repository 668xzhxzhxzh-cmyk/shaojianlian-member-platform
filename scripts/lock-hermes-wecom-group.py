#!/var/lib/hermes/.hermes/hermes-agent/venv/bin/python
"""Lock the native Hermes WeCom adapter to one group and one coach."""

from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

import yaml


DEFAULT_CONFIG = Path("/var/lib/hermes/.hermes/config.yaml")
DEFAULT_ENV = Path("/var/lib/hermes/.hermes/.env")
DEFAULT_BACKUP_DIR = Path("/var/backups/shao-coach")
CHAT_ID_PATTERN = re.compile(r"[A-Za-z0-9_.:@-]{3,256}")


def read_only_coach(env_path: Path) -> str:
    values: list[str] = []
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "WECOM_ALLOWED_USERS":
            values = [item.strip() for item in value.split(",") if item.strip()]
            break
    if len(values) != 1:
        raise RuntimeError("服务器必须配置且仅配置一个 WECOM_ALLOWED_USERS 教练 userid")
    return values[0]


def write_atomic(path: Path, content: str, *, uid: int, gid: int, mode: int) -> None:
    descriptor, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chown(temp_path, uid, gid)
        os.chmod(temp_path, mode)
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> int:
    if os.geteuid() != 0:
        raise RuntimeError("必须以 root 运行")
    if len(sys.argv) != 2 or not CHAT_ID_PATTERN.fullmatch(sys.argv[1]):
        raise RuntimeError("用法：lock-hermes-wecom-group.py <企业微信群 chatid>")

    chat_id = sys.argv[1]
    config_path = Path(os.environ.get("HERMES_CONFIG_PATH", str(DEFAULT_CONFIG)))
    env_path = Path(os.environ.get("HERMES_ENV_PATH", str(DEFAULT_ENV)))
    backup_dir = Path(os.environ.get("SHAO_BACKUP_DIR", str(DEFAULT_BACKUP_DIR)))
    skip_restart = os.environ.get("SHAO_WECOM_SKIP_RESTART") == "1"
    if skip_restart and config_path == DEFAULT_CONFIG:
        raise RuntimeError("生产配置禁止跳过 Hermes 重启验证")

    coach_userid = read_only_coach(env_path)
    original = config_path.read_text(encoding="utf-8")
    metadata = config_path.stat()
    config = yaml.safe_load(original) or {}
    platforms = config.setdefault("platforms", {})
    wecom = platforms.setdefault("wecom", {})
    wecom["enabled"] = True
    extra = wecom.setdefault("extra", {})
    extra.update(
        {
            "dm_policy": "allowlist",
            "allow_from": [coach_userid],
            "group_policy": "allowlist",
            "group_allow_from": [chat_id],
            "groups": {chat_id: {"allow_from": [coach_userid]}},
        }
    )
    updated = yaml.safe_dump(config, allow_unicode=True, sort_keys=False)
    parsed = yaml.safe_load(updated)
    effective = parsed["platforms"]["wecom"]["extra"]
    if effective["group_allow_from"] != [chat_id]:
        raise RuntimeError("群聊白名单生成失败")
    if effective["groups"][chat_id]["allow_from"] != [coach_userid]:
        raise RuntimeError("群内教练白名单生成失败")

    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(backup_dir, 0o700)
    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    backup_path = backup_dir / f"hermes-config-before-group-lock-{timestamp}.yaml"
    shutil.copyfile(config_path, backup_path)
    os.chown(backup_path, 0, 0)
    os.chmod(backup_path, 0o600)

    mode = stat.S_IMODE(metadata.st_mode)
    write_atomic(
        config_path,
        updated,
        uid=metadata.st_uid,
        gid=metadata.st_gid,
        mode=mode,
    )

    if skip_restart:
        print("测试配置已生成，未重启生产服务。")
        return 0

    try:
        subprocess.run(["systemctl", "restart", "hermes-gateway"], check=True)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            active = subprocess.run(
                ["systemctl", "is-active", "--quiet", "hermes-gateway"],
                check=False,
            )
            if active.returncode == 0:
                time.sleep(3)
                stable = subprocess.run(
                    ["systemctl", "is-active", "--quiet", "hermes-gateway"],
                    check=False,
                )
                if stable.returncode == 0:
                    print("Hermes 已锁定到指定企业微信群和唯一授权教练。")
                    return 0
            time.sleep(1)
        raise RuntimeError("Hermes 重启后未保持运行")
    except Exception:
        write_atomic(
            config_path,
            original,
            uid=metadata.st_uid,
            gid=metadata.st_gid,
            mode=mode,
        )
        subprocess.run(["systemctl", "restart", "hermes-gateway"], check=False)
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"锁定失败：{error}", file=sys.stderr)
        raise SystemExit(1)
