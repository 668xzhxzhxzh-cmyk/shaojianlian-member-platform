export const ROUTINE_MESSAGE_KINDS = new Set([
  "course_reminder",
  "booking_confirmation",
  "checkin_reminder",
  "hydration_reminder",
  "meal_log_reminder",
  "membership_expiry_reminder",
]);

const DECISION_TEXT = /诊断|治疗|用药|疼痛|受伤|风险|训练方案|饮食方案|调整计划|改变计划|取消课程|改期|退款|收费|续费价格|处罚|投诉/;

export function classifyCustomerMessage({ kind, title, content }) {
  const normalizedKind = String(kind || "coach_decision").trim();
  const text = `${String(title || "")}\n${String(content || "")}`;
  if (!ROUTINE_MESSAGE_KINDS.has(normalizedKind) || DECISION_TEXT.test(text)) {
    return {
      kind: "coach_decision",
      approvalMode: "coach_required",
      reason: DECISION_TEXT.test(text) ? "content_requires_coach_judgement" : "message_kind_requires_coach_judgement",
    };
  }
  return {
    kind: normalizedKind,
    approvalMode: "routine_auto",
    reason: "verified_routine_notice",
  };
}

export function isRoutineMessageKind(kind) {
  return ROUTINE_MESSAGE_KINDS.has(String(kind || ""));
}
