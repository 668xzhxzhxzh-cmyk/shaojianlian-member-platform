#!/usr/bin/env sh
set -eu

SOURCE_ROOT="${1:-/opt/shao-coach}"
HERMES_HOME_DIR="/var/lib/hermes/.hermes"
TOOLS_DIR="${HERMES_HOME_DIR}/tools"
WORKSPACE_DIR="${HERMES_HOME_DIR}/workspace"

if [ "$(id -u)" -ne 0 ]; then
  echo "必须以 root 运行" >&2
  exit 1
fi

if [ ! -f "${SOURCE_ROOT}/server/hermes_tools_mcp.py" ]; then
  echo "找不到 Hermes MCP 工具源文件" >&2
  exit 1
fi

install -d -o hermes -g hermes -m 0750 "${TOOLS_DIR}" "${WORKSPACE_DIR}"
install -o hermes -g hermes -m 0750 \
  "${SOURCE_ROOT}/server/hermes_tools_mcp.py" \
  "${TOOLS_DIR}/shao_coach_mcp.py"
install -o hermes -g hermes -m 0640 \
  "${SOURCE_ROOT}/deployment/hermes-wecom-soul.md" \
  "${WORKSPACE_DIR}/SOUL.md"

echo "Hermes 企业微信会员工具与 SOUL.md 已安装"
echo "下一步：安全写入 .env、合并 MCP 配置，并运行 hermes mcp test shao-coach"
