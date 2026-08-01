#!/usr/bin/env bash
set -euo pipefail

web_base="http://127.0.0.1:3000"
api_base="http://127.0.0.1:8788"
public_base=""
check_services=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web-base) web_base="$2"; shift 2 ;;
    --api-base) api_base="$2"; shift 2 ;;
    --public-base) public_base="$2"; shift 2 ;;
    --check-services) check_services=1; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

expect_status() {
  local expected="$1" method="$2" url="$3" data="${4:-}"
  local actual
  if [[ "$method" == "POST" ]]; then
    actual="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      -H 'content-type: application/json' -X POST --data "$data" "$url")"
  else
    actual="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url")"
  fi
  if [[ "$actual" != "$expected" ]]; then
    echo "健康检查失败：$method $url 期望 $expected，实际 $actual" >&2
    return 1
  fi
  echo "OK $actual $method $url"
}

health_json="$(curl -fsS --max-time 10 "$api_base/health")"
grep -q '"ok":true' <<<"$health_json" || {
  echo "健康接口没有返回 ok=true。" >&2
  exit 1
}
echo "OK 200 GET $api_base/health"

expect_status 200 GET "$web_base/"
expect_status 200 GET "$web_base/coach/login"
expect_status 200 GET "$web_base/admin/login"
expect_status 400 POST "$api_base/api/auth/login" '{}'
expect_status 401 GET "$api_base/api/auth/me"
expect_status 401 GET "$api_base/api/data"

if [[ -n "$public_base" ]]; then
  expect_status 200 GET "$public_base/health"
  expect_status 200 GET "$public_base/"
  expect_status 200 GET "$public_base/coach/login"
  expect_status 200 GET "$public_base/admin/login"
fi

if [[ "$check_services" == 1 ]]; then
  systemctl is-active --quiet shao-api.service
  systemctl is-active --quiet shao-web.service
  systemctl is-active --quiet nginx.service
  echo "OK systemd shao-api/shao-web/nginx active"
fi

echo "RELEASE_HEALTH_OK"
