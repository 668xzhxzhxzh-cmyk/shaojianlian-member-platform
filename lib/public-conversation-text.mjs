const INTERNAL_ID_PATTERN = /\b(?:task_id|member_id|session_id)\s*[=:：]\s*[A-Za-z0-9][A-Za-z0-9_-]{0,127}/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/**
 * @param {unknown} value
 * @param {{ memberIds?: string[] }} [options]
 */
export function redactConversationText(value, { memberIds = [] } = {}) {
  let text = String(value || "")
    .replace(INTERNAL_ID_PATTERN, "")
    .replace(UUID_PATTERN, "");

  for (const memberId of memberIds) {
    const id = String(memberId || "").trim();
    if (!id) continue;
    text = text.replace(new RegExp(escapeRegExp(id), "gi"), "当前会员");
  }

  return text
    .replace(/\(\s*\)|（\s*）/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([，。！？；：])/g, "$1")
    .replace(/([：:])\s*([，。；;])/g, "$1")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
