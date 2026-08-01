#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_sha="${RELEASE_SHA:-$(git -C "$repo_root" rev-parse HEAD)}"

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "RELEASE_SHA 必须是 40 位小写 Git commit SHA。" >&2
  exit 1
fi

stage="$repo_root/.release-build"
artifacts="$repo_root/artifacts"
archive_name="shao-production-linux-${release_sha}.tar.gz"

case "$stage" in
  "$repo_root"/.release-build) ;;
  *) echo "拒绝清理不安全的临时目录：$stage" >&2; exit 1 ;;
esac

rm -rf -- "$stage"
mkdir -p "$stage/release/web" "$artifacts"
trap 'rm -rf -- "$stage"' EXIT

test -f "$repo_root/.next/standalone/server.js"
test -d "$repo_root/.next/static"
test -d "$repo_root/server"

cp -a "$repo_root/.next/standalone/." "$stage/release/web/"
mkdir -p "$stage/release/web/.next"
mkdir -p "$stage/release/web/.next/static"
cp -a "$repo_root/.next/static/." "$stage/release/web/.next/static/"
if [[ -d "$repo_root/public" ]]; then
  mkdir -p "$stage/release/web/public"
  cp -a "$repo_root/public/." "$stage/release/web/public/"
fi

cp -a "$repo_root/server" "$stage/release/server"
cp -a "$repo_root/deployment" "$stage/release/deployment"
mkdir -p "$stage/release/scripts"
cp "$repo_root/scripts/release-health-check.sh" "$stage/release/scripts/"
cp "$repo_root/scripts/rollback-release.sh" "$stage/release/scripts/"
for optional_dir in db drizzle; do
  if [[ -d "$repo_root/$optional_dir" ]]; then
    cp -a "$repo_root/$optional_dir" "$stage/release/$optional_dir"
  fi
done
cp "$repo_root/package.json" "$repo_root/package-lock.json" "$stage/release/"
printf '%s\n' "$release_sha" > "$stage/release/RELEASE_SHA"
date -u +'%Y-%m-%dT%H:%M:%SZ' > "$stage/release/RELEASE_BUILT_AT"

# The API runtime dependencies are installed on the GitHub Runner and packed.
# Production ECS must never run npm install/npm ci/npm run build.
npm ci --prefix "$stage/release" --omit=dev --no-audit --no-fund

if find "$stage/release" -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name 'id_rsa' -o -name 'id_ed25519' \) -print -quit | grep -q .; then
  echo "运行包包含被禁止的密钥或环境文件。" >&2
  exit 1
fi

if grep -RIlE --exclude-dir=node_modules --exclude='*.map' \
  '(BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{24,})' \
  "$stage/release" | grep -q .; then
  echo "运行包疑似包含真实密钥。" >&2
  exit 1
fi

manifest_tmp="$stage/MANIFEST.sha256"
(
  cd "$stage/release"
  find . -type f -print0 | sort -z | xargs -0 sha256sum > "$manifest_tmp"
)
mv "$manifest_tmp" "$stage/release/MANIFEST.sha256"

rm -f -- "$artifacts/$archive_name" "$artifacts/$archive_name.sha256"
tar -C "$stage" -czf "$artifacts/$archive_name" release
(
  cd "$artifacts"
  sha256sum "$archive_name" > "$archive_name.sha256"
)

echo "已生成：artifacts/$archive_name"
echo "已生成：artifacts/$archive_name.sha256"
