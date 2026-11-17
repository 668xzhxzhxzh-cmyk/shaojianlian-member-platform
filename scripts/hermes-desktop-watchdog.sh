#!/usr/bin/env bash
set -euo pipefail

mode="monitor"
if [[ "${1:-}" == "--repair" ]]; then
  mode="repair"
elif [[ $# -gt 0 ]]; then
  echo "不支持的参数：$1" >&2
  exit 2
fi

service="hermes-desktop-serve.service"
status_url="http://127.0.0.1:9119/api/health"
failure_file="/run/shao-hermes-desktop-watchdog.failures"
lock_file="/run/shao-hermes-desktop-watchdog.lock"
failure_limit=4

exec 9>"$lock_file"
flock -n 9 || exit 0

healthy() {
  local response
  systemctl is-active --quiet "$service" || return 1
  response="$(curl -fsS --max-time 15 "$status_url")" || return 1
  grep -Eq '"ok"[[:space:]]*:[[:space:]]*true|"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$response"
}

if healthy; then
  rm -f -- "$failure_file"
  exit 0
fi

failures=0
if [[ -f "$failure_file" ]]; then
  read -r failures < "$failure_file" || failures=0
fi
[[ "$failures" =~ ^[0-9]+$ ]] || failures=0
failures=$((failures + 1))
printf '%s\n' "$failures" > "$failure_file"

if [[ "$mode" != "repair" && "$failures" -lt "$failure_limit" ]]; then
  logger -t shao-hermes-watchdog "Hermes Desktop backend health check failed (${failures}/${failure_limit}); waiting for confirmation."
  exit 0
fi

logger -t shao-hermes-watchdog "Hermes Desktop backend unhealthy; restarting the existing service."
systemctl restart "$service"
for _attempt in $(seq 1 20); do
  if healthy; then
    rm -f -- "$failure_file"
    logger -t shao-hermes-watchdog "Hermes Desktop backend recovered."
    echo "HERMES_DESKTOP_RECOVERED"
    exit 0
  fi
  sleep 2
done

logger -t shao-hermes-watchdog "Hermes Desktop backend did not recover after restart."
echo "Hermes Desktop backend 未能在重启后恢复。" >&2
exit 1
