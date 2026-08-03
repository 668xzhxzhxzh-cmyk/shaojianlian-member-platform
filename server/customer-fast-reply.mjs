const GREETING_RE = /^(?:你好|您好|在吗|嗨|hi|hello)[！!。.\s]*$/i;
const IDENTITY_RE = /你是谁|什么模型|哪个模型|介绍一下你自己/;
const COURSE_RE = /课表|课程安排|最近的课|最近课程|下一节课|什么时候上课|预约情况/;
const REMINDER_RE = /提醒.*(?:上课|课程)|(?:上课|课程).*提醒|可以提醒我/;
const BODY_RE = /体重|体脂|身体数据|最近进展|减脂进展/;

export function createCustomerFastReply({ customerText = "", memberName = "会员", memberState = {} } = {}) {
  const text = String(customerText || "").trim();
  if (!text) return "";
  if (GREETING_RE.test(text)) return `你好，${memberName}。可以直接问我课程、训练、饮食或身体数据。`;
  if (IDENTITY_RE.test(text)) return "我是邵教练平台的 AI 健康助理，由 Hermes 统一处理会员服务。";
  if (REMINDER_RE.test(text)) return "可以。已预约课程会按系统设置发送提醒；课程有变动时请及时联系邵教练。";
  if (COURSE_RE.test(text)) return formatSchedule(memberState?.bookings);
  if (BODY_RE.test(text)) return formatBodyProgress(memberState?.bodyMetrics);
  return "";
}

export function selectRelevantCustomerState(state, customerText = "", imageDescription = "") {
  const source = state && typeof state === "object" ? state : {};
  const text = `${customerText}\n${imageDescription}`;
  const profile = source.profile && typeof source.profile === "object" ? source.profile : {};
  const safeProfile = Object.fromEntries(
    Object.entries(profile).filter(([key]) => !["id", "phone"].includes(key)),
  );
  const result = { profile: safeProfile };

  if (/课|预约|排期|提醒/.test(text)) result.bookings = tail(source.bookings, 8);
  if (/训练|动作|力量|有氧|恢复|疼|痛|不适/.test(text)) {
    result.trainingPlan = source.trainingPlan || null;
    result.bodyMetrics = tail(source.bodyMetrics, 4);
    result.bodyFeedbacks = tail(source.bodyFeedbacks, 3);
  }
  if (/饮食|餐|吃|热量|蛋白|碳水|脂肪|图片/.test(text) || imageDescription) {
    result.nutritionPlan = source.nutritionPlan || null;
    result.bodyMetrics = tail(source.bodyMetrics, 4);
  }
  if (/体重|体脂|身体|腰围|进展/.test(text)) result.bodyMetrics = tail(source.bodyMetrics, 4);
  if (Object.keys(result).length === 1) result.bookings = tail(source.bookings, 3);
  return result;
}

export function recentImageDescription(history, customerText = "") {
  if (!/图片|照片|这个|这餐|这顿|根据图|分析一下/.test(String(customerText || ""))) return "";
  for (const turn of Array.isArray(history) ? history.slice().reverse() : []) {
    const match = String(turn?.content || "").match(/^\[图片\]\s*(.+)$/s);
    if (match?.[1]) return match[1].slice(0, 600);
  }
  return "";
}

export function avoidRepeatedCustomerReply(content, history = []) {
  const current = normalize(content);
  const previous = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .find((turn) => turn?.role === "assistant");
  if (!current || current !== normalize(previous?.content)) return content;
  return "刚才的结论仍适用。你想继续看课程、训练安排，还是饮食搭配？";
}

function formatSchedule(bookings) {
  const active = (Array.isArray(bookings) ? bookings : [])
    .filter((item) => item && !["已取消", "已完成", "可预约"].includes(String(item.status || "")))
    .slice(-5);
  if (!active.length) return "目前没有待上的已预约课程。如需排课，请联系邵教练。";
  return `最近课程：${active.map((item) => `${item.date || "待定"} ${item.time || "待定"} ${item.focus || item.title || "一对一私教"}（${item.status || "已预约"}）`).join("；")}`;
}

function formatBodyProgress(metrics) {
  const rows = Array.isArray(metrics) ? metrics.filter(Boolean) : [];
  const latest = rows.at(-1);
  if (!latest) return "暂时没有可用的身体数据，请先完成一次身体数据记录。";
  const previous = rows.at(-2);
  const change = previous && Number.isFinite(Number(latest.weight)) && Number.isFinite(Number(previous.weight))
    ? `，较上次${Number(latest.weight) <= Number(previous.weight) ? "下降" : "上升"}${Math.abs(Number(latest.weight) - Number(previous.weight)).toFixed(1)} kg`
    : "";
  return `最近记录：体重 ${latest.weight ?? "--"} kg${change}，体脂 ${latest.bodyFat ?? "--"}%，肌肉量 ${latest.muscle ?? "--"} kg。`;
}

function tail(value, count) {
  return Array.isArray(value) ? value.slice(-count) : [];
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").replace(/[，。！？!?；;]/g, "").trim();
}
