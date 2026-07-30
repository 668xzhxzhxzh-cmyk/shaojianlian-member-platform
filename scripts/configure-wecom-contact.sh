#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-/opt/shao-coach/.env}"
SERVICE_NAME="${2:-shao-api}"
TEMP_FILE=""
ECHO_DISABLED=0

cleanup() {
  if [ "${ECHO_DISABLED}" -eq 1 ]; then
    stty echo 2>/dev/null || true
    printf "\n" >&2
  fi
  if [ -n "${TEMP_FILE}" ] && [ -f "${TEMP_FILE}" ]; then
    rm -f -- "${TEMP_FILE}"
  fi
}
trap cleanup EXIT HUP INT TERM

if [ "$(id -u)" -ne 0 ]; then
  echo "必须以 root 运行" >&2
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "找不到生产环境文件：${ENV_FILE}" >&2
  exit 1
fi

printf "企业微信 CorpID："
IFS= read -r CORP_ID
printf "客户联系可调用自建应用 Secret（输入不回显）："
if [ -t 0 ]; then
  stty -echo
  ECHO_DISABLED=1
fi
IFS= read -r CONTACT_SECRET
if [ "${ECHO_DISABLED}" -eq 1 ]; then
  stty echo
  ECHO_DISABLED=0
  printf "\n"
fi

case "${CORP_ID}" in
  ""|*[!A-Za-z0-9_-]*)
    echo "CorpID 格式无效" >&2
    exit 1
    ;;
esac
case "${CONTACT_SECRET}" in
  ""|*[!A-Za-z0-9_-]*)
    echo "Secret 格式无效" >&2
    exit 1
    ;;
esac
if [ "${#CONTACT_SECRET}" -lt 16 ]; then
  echo "Secret 长度异常" >&2
  exit 1
fi

ENV_OWNER="$(stat -c '%u:%g' "${ENV_FILE}")"
ENV_MODE="$(stat -c '%a' "${ENV_FILE}")"
BACKUP_DIR="/var/backups/shao-coach"
BACKUP_FILE="${BACKUP_DIR}/production-env-before-wecom-$(date -u +%Y%m%d-%H%M%S)"
install -d -o root -g root -m 0700 "${BACKUP_DIR}"
install -o root -g root -m 0600 "${ENV_FILE}" "${BACKUP_FILE}"
TEMP_FILE="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
CORP_WRITTEN=0
SECRET_WRITTEN=0

while IFS= read -r LINE || [ -n "${LINE}" ]; do
  case "${LINE}" in
    WECOM_CORP_ID=*)
      printf 'WECOM_CORP_ID=%s\n' "${CORP_ID}" >> "${TEMP_FILE}"
      CORP_WRITTEN=1
      ;;
    WECOM_CONTACT_SECRET=*)
      printf 'WECOM_CONTACT_SECRET=%s\n' "${CONTACT_SECRET}" >> "${TEMP_FILE}"
      SECRET_WRITTEN=1
      ;;
    *)
      printf '%s\n' "${LINE}" >> "${TEMP_FILE}"
      ;;
  esac
done < "${ENV_FILE}"

if [ "${CORP_WRITTEN}" -eq 0 ]; then
  printf 'WECOM_CORP_ID=%s\n' "${CORP_ID}" >> "${TEMP_FILE}"
fi
if [ "${SECRET_WRITTEN}" -eq 0 ]; then
  printf 'WECOM_CONTACT_SECRET=%s\n' "${CONTACT_SECRET}" >> "${TEMP_FILE}"
fi

chown "${ENV_OWNER}" "${TEMP_FILE}"
chmod "${ENV_MODE}" "${TEMP_FILE}"
mv -f -- "${TEMP_FILE}" "${ENV_FILE}"
TEMP_FILE=""
unset CONTACT_SECRET

systemctl restart "${SERVICE_NAME}"
if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
  echo "${SERVICE_NAME} 重启失败，请联系部署人员检查日志" >&2
  exit 1
fi

HEALTH="$(curl -fsS http://127.0.0.1:8788/health)"
case "${HEALTH}" in
  *'"wecomContact":true'*)
    echo "客户联系凭据已安全写入，API 服务已重启。"
    ;;
  *)
    echo "服务已重启，但客户联系配置未生效，请联系部署人员检查。" >&2
    exit 1
    ;;
esac
