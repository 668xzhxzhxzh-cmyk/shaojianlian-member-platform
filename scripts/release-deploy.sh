#!/usr/bin/env bash
set -euo pipefail

base_dir="/opt/shao-coach"
artifact_url=""
artifact_sha256=""
release_sha=""
release_tar=""
token_stdin=0
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-dir) base_dir="$2"; shift 2 ;;
    --artifact-url) artifact_url="$2"; shift 2 ;;
    --artifact-sha256) artifact_sha256="$2"; shift 2 ;;
    --release-sha) release_sha="$2"; shift 2 ;;
    --release-tar) release_tar="$2"; shift 2 ;;
    --token-stdin) token_stdin=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "release SHA 必须是 40 位小写十六进制。" >&2
  exit 1
fi

verify_release_tree() {
  local root="$1"
  test "$(cat "$root/RELEASE_SHA")" = "$release_sha"
  test -f "$root/web/server.js"
  test -d "$root/web/.next/static"
  test -f "$root/server/index.mjs"
  test -d "$root/node_modules"
  test -f "$root/deployment/shao-web.service"
  test -f "$root/deployment/shao-api.service"
  if find "$root" -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name 'id_rsa' -o -name 'id_ed25519' \) -print -quit | grep -q .; then
    echo "运行包包含环境文件或私钥，拒绝继续。" >&2
    return 1
  fi
  (cd "$root" && sha256sum -c MANIFEST.sha256 >/dev/null)
}

if [[ "$dry_run" == 1 ]]; then
  if [[ ! -f "$release_tar" ]]; then
    echo "dry-run 需要 --release-tar 指向本地运行包。" >&2
    exit 1
  fi
  if tar -tzf "$release_tar" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    echo "运行包包含不安全路径。" >&2
    exit 1
  fi
  dry_work="$(mktemp -d)"
  trap 'rm -rf -- "$dry_work"' EXIT
  tar -xzf "$release_tar" -C "$dry_work"
  verify_release_tree "$dry_work/release"
  echo "DRY_RUN_OK sha=$release_sha"
  echo "计划步骤：下载 -> 双重 SHA-256 校验 -> 独立 release -> 候选端口健康检查 -> 原子切换 -> 失败回滚 -> 保留最近 3 版"
  echo "dry-run 未连接生产服务器、未调用 systemctl、未切换 current。"
  exit 0
fi

if [[ "$(id -u)" != 0 ]]; then
  echo "正式部署控制器必须由 root 运行。" >&2
  exit 1
fi
if [[ "$base_dir" != "/opt/shao-coach" ]]; then
  echo "拒绝操作非预期生产目录：$base_dir" >&2
  exit 1
fi
if [[ ! "$artifact_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "artifact SHA-256 格式无效。" >&2
  exit 1
fi
if [[ "$token_stdin" != 1 || -z "$artifact_url" ]]; then
  echo "正式部署必须使用 --token-stdin 和 GitHub artifact URL。" >&2
  exit 1
fi

for command_name in curl unzip sha256sum tar node systemctl systemd-run; do
  command -v "$command_name" >/dev/null || {
    echo "服务器缺少命令：$command_name" >&2
    exit 1
  }
done
test -f "$base_dir/.env"
getent passwd shaoapp >/dev/null

IFS= read -r github_token
if [[ -z "$github_token" ]]; then
  echo "没有从标准输入收到临时 GitHub Token。" >&2
  exit 1
fi

mkdir -p "$base_dir/releases"
work="$(mktemp -d "$base_dir/.release-work.XXXXXX")"
zip_file="$work/github-artifact.zip"
download_dir="$work/download"
incoming="$base_dir/releases/.incoming-${release_sha}-$$"
short_sha="${release_sha:0:12}"
api_unit="shao-candidate-api-$short_sha"
web_unit="shao-candidate-web-$short_sha"
previous_release=""
switched=0

stop_candidates() {
  systemctl stop "$api_unit.service" "$web_unit.service" >/dev/null 2>&1 || true
  systemctl reset-failed "$api_unit.service" "$web_unit.service" >/dev/null 2>&1 || true
}

atomic_link() {
  local target="$1" link="$2"
  local temp_link="${link}.new.$$"
  ln -s "$target" "$temp_link"
  mv -Tf "$temp_link" "$link"
}

on_exit() {
  local status=$?
  trap - EXIT
  stop_candidates
  rm -rf -- "$incoming" "$work"
  if [[ "$status" -ne 0 && "$switched" == 1 && -n "$previous_release" ]]; then
    echo "新版本验证失败，正在自动恢复旧版本：$previous_release" >&2
    atomic_link "$previous_release" "$base_dir/current"
    systemctl daemon-reload
    systemctl restart shao-api.service shao-web.service
    bash "$previous_release/scripts/release-health-check.sh" \
      --public-base http://127.0.0.1 --check-services || true
  fi
  unset github_token
  exit "$status"
}
trap on_exit EXIT

echo "从 GitHub 直接下载不可变构建产物。"
curl --fail --silent --show-error --location --retry 3 \
  -H "Authorization: Bearer $github_token" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$artifact_url" -o "$zip_file"
unset github_token

printf '%s  %s\n' "$artifact_sha256" "$zip_file" | sha256sum -c -
mkdir -p "$download_dir"
unzip -q "$zip_file" -d "$download_dir"

inner_archive="$download_dir/shao-production-linux-${release_sha}.tar.gz"
inner_checksum="$inner_archive.sha256"
test -f "$inner_archive"
test -f "$inner_checksum"
(
  cd "$download_dir"
  sha256sum -c "$(basename "$inner_checksum")"
)

if tar -tzf "$inner_archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "运行包包含不安全路径。" >&2
  exit 1
fi

mkdir "$incoming"
tar -xzf "$inner_archive" -C "$incoming"
verify_release_tree "$incoming/release"

release_dir="$base_dir/releases/$release_sha"
if [[ -e "$release_dir" ]]; then
  echo "该 release 已存在，拒绝覆盖：$release_dir" >&2
  exit 1
fi
mv "$incoming/release" "$release_dir"
rmdir "$incoming"
chown -R shaoapp:shaoapp "$release_dir"

echo "在候选端口 3300/8988 启动新版本，不影响 Nginx 的 3000/8788 现网端口。"
candidate_env="$work/candidate-api.env"
awk '!/^API_HOST=/ && !/^API_PORT=/' "$base_dir/.env" > "$candidate_env"
printf 'API_HOST=127.0.0.1\nAPI_PORT=8988\n' >> "$candidate_env"
chmod 600 "$candidate_env"
stop_candidates
systemd-run --quiet --collect --service-type=exec --unit "$api_unit" \
  --property=User=shaoapp --property=Group=shaoapp \
  --property="WorkingDirectory=$release_dir" \
  --property="EnvironmentFile=$candidate_env" \
  --setenv=NODE_ENV=production \
  /usr/bin/node "$release_dir/server/index.mjs"
systemd-run --quiet --collect --service-type=exec --unit "$web_unit" \
  --property=User=shaoapp --property=Group=shaoapp \
  --property="WorkingDirectory=$release_dir/web" \
  --setenv=NODE_ENV=production --setenv=HOSTNAME=127.0.0.1 --setenv=PORT=3300 \
  /usr/bin/node "$release_dir/web/server.js"

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8988/health >/dev/null \
    && curl -fsS --max-time 2 http://127.0.0.1:3300/ >/dev/null; then
    break
  fi
  sleep 2
done
bash "$release_dir/scripts/release-health-check.sh" \
  --web-base http://127.0.0.1:3300 \
  --api-base http://127.0.0.1:8988
stop_candidates

if [[ -L "$base_dir/current" ]]; then
  previous_release="$(readlink -f "$base_dir/current")"
elif [[ -e "$base_dir/current" ]]; then
  echo "current 存在但不是符号链接，拒绝切换。" >&2
  exit 1
else
  legacy_sha="$(git -C "$base_dir" rev-parse HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)"
  legacy_dir="$base_dir/releases/legacy-$legacy_sha"
  legacy_temp="$base_dir/releases/.legacy-${legacy_sha}-$$"
  if [[ ! -d "$legacy_dir" ]]; then
    mkdir -p "$legacy_temp/web" "$legacy_temp/scripts"
    cp -al "$base_dir/.next/standalone/." "$legacy_temp/web/"
    cp -al "$base_dir/server" "$legacy_temp/server"
    cp -al "$base_dir/node_modules" "$legacy_temp/node_modules"
    cp -a "$release_dir/deployment" "$legacy_temp/deployment"
    cp "$release_dir/scripts/release-health-check.sh" "$legacy_temp/scripts/"
    printf '%s\n' "$legacy_sha" > "$legacy_temp/RELEASE_SHA"
    mv "$legacy_temp" "$legacy_dir"
  fi
  previous_release="$legacy_dir"
  atomic_link "$previous_release" "$base_dir/current"
fi

case "$previous_release" in
  "$base_dir"/releases/*) ;;
  *) echo "旧版本不在 releases 目录内，拒绝切换。" >&2; exit 1 ;;
esac

install -m 0644 "$release_dir/deployment/shao-web.service" /etc/systemd/system/shao-web.service
install -m 0644 "$release_dir/deployment/shao-api.service" /etc/systemd/system/shao-api.service
systemctl daemon-reload

atomic_link "$previous_release" "$base_dir/previous"
atomic_link "$release_dir" "$base_dir/current"
switched=1

systemctl restart shao-api.service
systemctl restart shao-web.service
bash "$release_dir/scripts/release-health-check.sh" \
  --public-base http://127.0.0.1 --check-services

switched=0

current_real="$(readlink -f "$base_dir/current")"
previous_real="$(readlink -f "$base_dir/previous")"
mapfile -t release_dirs < <(find "$base_dir/releases" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
if (( ${#release_dirs[@]} > 3 )); then
  kept=0
  for dir in "${release_dirs[@]}"; do
    if [[ "$dir" == "$current_real" || "$dir" == "$previous_real" || "$kept" -lt 3 ]]; then
      kept=$((kept + 1))
      continue
    fi
    case "$dir" in
      "$base_dir"/releases/*) rm -rf -- "$dir" ;;
      *) echo "跳过不安全清理目标：$dir" >&2 ;;
    esac
  done
fi

rm -rf -- "$work"
trap - EXIT
echo "DEPLOYMENT_OK sha=$release_sha previous=$previous_release"
