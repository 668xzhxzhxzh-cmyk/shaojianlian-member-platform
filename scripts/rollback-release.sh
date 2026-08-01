#!/usr/bin/env bash
set -euo pipefail

base_dir="/opt/shao-coach"
target=""
list_only=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-dir) base_dir="$2"; shift 2 ;;
    --target) target="$2"; shift 2 ;;
    --list) list_only=1; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

if [[ "$base_dir" != "/opt/shao-coach" ]]; then
  echo "拒绝操作非预期生产目录：$base_dir" >&2
  exit 1
fi

if [[ "$list_only" == 1 ]]; then
  printf 'current -> %s\n' "$(readlink -f "$base_dir/current" 2>/dev/null || echo '<未启用 release 模式>')"
  printf 'previous -> %s\n' "$(readlink -f "$base_dir/previous" 2>/dev/null || echo '<无>')"
  find "$base_dir/releases" -mindepth 1 -maxdepth 1 -type d -printf '%TY-%Tm-%Td %TH:%TM %f\n' 2>/dev/null | sort -r
  exit 0
fi

if [[ "$(id -u)" != 0 ]]; then
  echo "回滚必须由 root 执行。" >&2
  exit 1
fi

current="$(readlink -f "$base_dir/current")"
if [[ -z "$target" ]]; then
  target="$(readlink -f "$base_dir/previous")"
elif [[ "$target" != /* ]]; then
  target="$base_dir/releases/$target"
fi
target="$(readlink -f "$target")"

case "$target" in
  "$base_dir"/releases/*) ;;
  *) echo "回滚目标不在 releases 目录：$target" >&2; exit 1 ;;
esac
test -f "$target/web/server.js"
test -f "$target/server/index.mjs"
test -f "$target/scripts/release-health-check.sh"

atomic_link() {
  local destination="$1" link="$2"
  local temp_link="${link}.new.$$"
  ln -s "$destination" "$temp_link"
  mv -Tf "$temp_link" "$link"
}

rollback_failed=0
atomic_link "$target" "$base_dir/current"
systemctl restart shao-api.service shao-web.service
if ! bash "$target/scripts/release-health-check.sh" --public-base http://127.0.0.1 --check-services; then
  rollback_failed=1
fi

if [[ "$rollback_failed" == 1 ]]; then
  echo "目标版本健康检查失败，恢复回滚前版本。" >&2
  atomic_link "$current" "$base_dir/current"
  systemctl restart shao-api.service shao-web.service
  bash "$current/scripts/release-health-check.sh" --public-base http://127.0.0.1 --check-services
  exit 1
fi

atomic_link "$current" "$base_dir/previous"
echo "ROLLBACK_OK current=$target previous=$current"
