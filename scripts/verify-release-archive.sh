#!/usr/bin/env bash
set -euo pipefail

archive="${1:-}"
expected_sha="${2:-}"

if [[ ! -f "$archive" ]]; then
  echo "找不到运行包：$archive" >&2
  exit 1
fi
if [[ ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "第二个参数必须是 40 位 commit SHA。" >&2
  exit 1
fi

if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "运行包包含不安全路径。" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
tar -xzf "$archive" -C "$work"

test "$(cat "$work/release/RELEASE_SHA")" = "$expected_sha"
test -f "$work/release/web/server.js"
test -d "$work/release/web/.next/static"
test -f "$work/release/server/index.mjs"
test -d "$work/release/node_modules"
test -f "$work/release/deployment/shao-web.service"
test -f "$work/release/deployment/shao-api.service"
test -f "$work/release/scripts/configure-wecom-native.py"
test -f "$work/release/scripts/configure-wecom-callback-route.sh"
test -f "$work/release/scripts/verify-vision-runtime.mjs"

if find "$work/release" -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name 'id_rsa' -o -name 'id_ed25519' \) -print -quit | grep -q .; then
  echo "运行包包含被禁止的环境文件或私钥。" >&2
  exit 1
fi

(
  cd "$work/release"
  sha256sum -c MANIFEST.sha256 >/dev/null
)

echo "RELEASE_ARCHIVE_OK sha=$expected_sha"
