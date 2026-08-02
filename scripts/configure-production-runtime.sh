#!/usr/bin/env bash
set -euo pipefail

base_dir="${1:-/opt/shao-coach}"
env_file="${base_dir}/.env"

if [[ "${base_dir}" != "/opt/shao-coach" || ! -f "${env_file}" ]]; then
  echo "REFUSED_RUNTIME_CONFIG" >&2
  exit 1
fi

umask 077
payload_file="$(mktemp /tmp/shao-runtime-env.XXXXXX)"
backup_file="$(mktemp /tmp/shao-runtime-env-backup.XXXXXX)"
trap 'rm -f "${payload_file}" "${backup_file}"' EXIT
cat >"${payload_file}"
cp --preserve=mode,ownership,timestamps "${env_file}" "${backup_file}"

python3 - "${env_file}" "${payload_file}" <<'PY'
import os
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
payload_path = Path(sys.argv[2])
allowed = {
    "DASHSCOPE_API_KEY",
    "HERMES_VISION_API_URL",
    "HERMES_VISION_MODEL",
    "WECOM_KF_ACCOUNT_NAME",
}
updates = {}
for raw in payload_path.read_text(encoding="utf-8").splitlines():
    key, separator, value = raw.partition("=")
    if not separator or key not in allowed or not value.strip():
        raise SystemExit("INVALID_RUNTIME_CONFIG")
    updates[key] = value.strip()
if set(updates) != allowed:
    raise SystemExit("INCOMPLETE_RUNTIME_CONFIG")

existing = env_path.read_text(encoding="utf-8").splitlines()
output = []
seen = set()
for line in existing:
    key = line.split("=", 1)[0].strip() if "=" in line else ""
    if key in updates:
        if key not in seen:
            output.append(f"{key}={updates[key]}")
            seen.add(key)
    else:
        output.append(line)
for key in sorted(set(updates) - seen):
    output.append(f"{key}={updates[key]}")

temporary = env_path.with_name(f".{env_path.name}.runtime.tmp")
temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
os.chmod(temporary, 0o600)
os.replace(temporary, env_path)
PY

chmod 600 "${env_file}"
systemctl restart shao-api

if ! python3 - <<'PY'
import json
import time
import urllib.request

deadline = time.monotonic() + 30
required = ("hermes", "wecomCallback", "wecomCustomerService", "hermesVision")
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8788/health", timeout=3) as response:
            data = json.load(response)
        integrations = data.get("integrations") or {}
        if data.get("ok") and all(integrations.get(name) is True for name in required):
            raise SystemExit(0)
    except Exception:
        pass
    time.sleep(1)
raise SystemExit(1)
PY
then
  cp --preserve=mode,ownership,timestamps "${backup_file}" "${env_file}"
  systemctl restart shao-api
  echo "RUNTIME_CONFIG_ROLLED_BACK" >&2
  exit 1
fi

if ! node "${base_dir}/current/scripts/verify-vision-runtime.mjs" \
  "${env_file}" \
  "${base_dir}/current/server/hermes-vision.mjs"
then
  cp --preserve=mode,ownership,timestamps "${backup_file}" "${env_file}"
  systemctl restart shao-api
  echo "VISION_CONFIG_ROLLED_BACK" >&2
  exit 1
fi

echo "RUNTIME_CONFIG_OK"
