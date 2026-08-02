#!/usr/bin/env bash
set -euo pipefail

nginx_site="${1:-/etc/nginx/sites-enabled/shao-coach}"
backup_root="${2:-/var/backups/shao-coach/wecom-callback-route}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "必须以 root 运行微信客服回调路由迁移。" >&2
  exit 1
fi

nginx_target="$(readlink -f "$nginx_site")"
case "$nginx_target" in
  /etc/nginx/*) ;;
  *) echo "Nginx 站点配置不在 /etc/nginx 内，拒绝修改。" >&2; exit 1 ;;
esac
if [[ ! -f "$nginx_target" ]]; then
  echo "找不到 Nginx 站点配置。" >&2
  exit 1
fi

stamp="$(date -u +'%Y%m%d-%H%M%S')"
backup_dir="$backup_root/$stamp"
install -d -m 0700 "$backup_dir"
backup_file="$backup_dir/$(basename "$nginx_target")"
cp --preserve=mode,ownership,timestamps "$nginx_target" "$backup_file"

temporary="$(mktemp "${nginx_target}.wecom-route.XXXXXX")"
response_file="$(mktemp /tmp/shao-wecom-route-response.XXXXXX)"
cleanup() {
  rm -f "$temporary" "$response_file"
}
trap cleanup EXIT

python3 - "$nginx_target" "$temporary" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text(encoding="utf-8")
begin = "# BEGIN SHAO HERMES WECOM CALLBACK"
end = "# END SHAO HERMES WECOM CALLBACK"

if text.count(begin) != text.count(end) or text.count(begin) > 1:
    raise SystemExit("旧微信回调 Nginx 标记不完整，拒绝自动修改")
if begin in text:
    pattern = re.compile(
        rf"^[ \t]*{re.escape(begin)}\n.*?^[ \t]*{re.escape(end)}\n?",
        re.MULTILINE | re.DOTALL,
    )
    text, count = pattern.subn("", text)
    if count != 1:
        raise SystemExit("无法唯一移除旧微信回调路由")

if re.search(r"location\s*=\s*/api/wecom/callback\b", text):
    raise SystemExit("仍存在未受管理的微信回调精确路由，拒绝继续")
api = re.search(r"location\s+/api/\s*\{(?P<body>.*?)\n\s*\}", text, re.DOTALL)
if not api or not re.search(r"proxy_pass\s+http://127\.0\.0\.1:8788", api.group("body")):
    raise SystemExit("/api/ 未转发到网站 API 127.0.0.1:8788")
target.write_text(text, encoding="utf-8")
PY

chmod --reference="$nginx_target" "$temporary"
chown --reference="$nginx_target" "$temporary"
mv -f "$temporary" "$nginx_target"

restore_route() {
  local restore_tmp
  restore_tmp="$(mktemp "${nginx_target}.restore.XXXXXX")"
  cp --preserve=mode,ownership,timestamps "$backup_file" "$restore_tmp"
  mv -f "$restore_tmp" "$nginx_target"
  nginx -t >/dev/null 2>&1 || true
  systemctl reload nginx >/dev/null 2>&1 || true
}

if ! nginx -t >/dev/null 2>&1; then
  restore_route
  echo "Nginx 配置校验失败，已恢复旧配置。" >&2
  exit 1
fi
if ! systemctl reload nginx; then
  restore_route
  echo "Nginx 重载失败，已恢复旧配置。" >&2
  exit 1
fi
if ! curl -fsS http://127.0.0.1:8788/health | grep -q '"ok":true'; then
  restore_route
  echo "网站 API 健康检查失败，已恢复旧配置。" >&2
  exit 1
fi

callback_status="$(curl -sS -o "$response_file" -w '%{http_code}' -X POST http://127.0.0.1/api/wecom/callback || true)"
if [[ "$callback_status" != "400" ]]; then
  restore_route
  echo "微信回调没有进入网站 API，已恢复旧配置。" >&2
  exit 1
fi

echo "WECOM_CALLBACK_ROUTE_OK upstream=8788 legacy_exact_route=removed"
