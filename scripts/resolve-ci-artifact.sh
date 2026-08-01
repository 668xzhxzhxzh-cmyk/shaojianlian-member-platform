#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN 未设置}"
: "${GH_REPOSITORY:?GH_REPOSITORY 未设置}"
: "${EXPECTED_RUN_ID:?EXPECTED_RUN_ID 未设置}"
: "${EXPECTED_SHA:?EXPECTED_SHA 未设置}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT 未设置}"

if [[ ! "$EXPECTED_RUN_ID" =~ ^[0-9]+$ ]]; then
  echo "CI run ID 格式无效。" >&2
  exit 1
fi
if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "commit SHA 必须是 40 位小写十六进制。" >&2
  exit 1
fi

run_json="$(gh api "repos/$GH_REPOSITORY/actions/runs/$EXPECTED_RUN_ID")"

jq -e \
  --arg sha "$EXPECTED_SHA" \
  --arg repo "$GH_REPOSITORY" \
  '.status == "completed"
   and .conclusion == "success"
   and .head_sha == $sha
   and .head_repository.full_name == $repo
   and .path == ".github/workflows/ci.yml"' \
  <<<"$run_json" >/dev/null || {
    echo "拒绝部署：指定 run 不是该 commit 的成功 CI。" >&2
    exit 1
  }

artifact_name="shao-production-linux-${EXPECTED_SHA}"
artifacts_json="$(gh api "repos/$GH_REPOSITORY/actions/runs/$EXPECTED_RUN_ID/artifacts")"
artifact="$(jq -e --arg name "$artifact_name" \
  '[.artifacts[] | select(.name == $name and .expired == false)] | if length == 1 then .[0] else error("artifact count must be 1") end' \
  <<<"$artifacts_json")"

digest="$(jq -er '.digest' <<<"$artifact")"
download_url="$(jq -er '.archive_download_url' <<<"$artifact")"
if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "GitHub 未返回有效的 artifact SHA-256。" >&2
  exit 1
fi

{
  echo "download_url=$download_url"
  echo "artifact_sha256=${digest#sha256:}"
} >> "$GITHUB_OUTPUT"

echo "CI 与不可变运行包验证通过；commit=$EXPECTED_SHA"
