import { createHash } from "node:crypto";

const ADD_COURSE_PATTERN = /(?:添加|增加|安排|加一节|排一节)/;
const DELETE_COURSE_PATTERN = /(?:删除|取消).*(?:课程|课|这节|这堂)/;
const CONFIRM_DELETE_PATTERN = /^\s*确认删除/;
const DATE_PATTERN = /(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/;
const TIME_RANGE_PATTERN = /(?:(上午|中午|下午|晚上|傍晚|早上|凌晨)\s*)?(\d{1,2})(?:\s*[:：时点]\s*(\d{1,2})?)?\s*(?:到|至|[-—–~～])\s*(?:(上午|中午|下午|晚上|傍晚|早上|凌晨)\s*)?(\d{1,2})(?:\s*[:：时点]\s*(\d{1,2})?)?/;

export function createHermesCommandRouter({ wecomContact }) {
  return {
    async route({ content, coachUserId, resolvedMember, conversation }) {
      const text = String(content || "").trim();
      const memberId = resolvedMember?.memberId || "";
      const memberName = String(resolvedMember?.member?.name || memberId);
      const state = resolvedMember?.member?.state_json || {};
      if (!memberId) return null;

      const courseIntent = parseCourseIntent(text);
      if (courseIntent.type === "add" && courseIntent.date && courseIntent.time) {
        const result = await wecomContact.executeCoachOperation({
          operation: "add_private_session",
          coach_userid: coachUserId,
          member_id: memberId,
          date: courseIntent.date,
          day: weekdayForCourse(courseIntent.date),
          time: courseIntent.time,
          focus: courseIntent.focus || "一对一私教",
          status: "已预约",
          request_id: stableCourseRequestId(memberId, courseIntent.date, courseIntent.time),
        });
        const booking = result.booking;
        const verb = result.changed ? "已添加" : "已存在，未重复添加";
        return {
          reply: `${memberName} ${displayCourse(booking)}${verb === "已添加" ? "已添加并同步网站。" : "已存在，未重复添加。"}`,
          memberId,
          sessionId: booking.id,
          clearPending: true,
          fastPath: "course_add",
        };
      }

      if (courseIntent.type === "confirm_delete") {
        const target = resolveCourseTarget({
          state,
          content: text,
          pendingAction: conversation?.pendingAction,
          sessionId: conversation?.sessionId,
        });
        if (target.error) return {
          reply: target.error,
          memberId,
          sessionId: conversation?.sessionId || "",
          fastPath: "course_delete_clarify",
        };
        const result = await wecomContact.executeCoachOperation({
          operation: "delete_private_session",
          coach_userid: coachUserId,
          member_id: memberId,
          session_id: target.booking.id,
        });
        return {
          reply: `已删除 ${memberName} ${displayCourse(result.deleted_session)}，网站已同步。`,
          memberId,
          sessionId: "",
          clearSession: true,
          clearPending: true,
          fastPath: "course_delete",
        };
      }

      if (courseIntent.type === "delete") {
        const target = resolveCourseTarget({
          state,
          content: text,
          pendingAction: conversation?.pendingAction,
          sessionId: conversation?.sessionId,
        });
        if (target.error) return {
          reply: target.error,
          memberId,
          sessionId: conversation?.sessionId || "",
          fastPath: "course_delete_clarify",
        };
        return {
          reply: `确认删除 ${memberName} ${displayCourse(target.booking)}？请回复“确认删除”。`,
          memberId,
          sessionId: target.booking.id,
          pendingAction: {
            type: "delete_course",
            memberId,
            sessionId: target.booking.id,
          },
          fastPath: "course_delete_confirm",
        };
      }

      return null;
    },
  };
}

export function parseCourseIntent(value) {
  const content = String(value || "").trim();
  const date = extractCourseDate(content);
  const timeResult = extractCourseTime(content);
  if (CONFIRM_DELETE_PATTERN.test(content)) {
    return { type: "confirm_delete", date, time: timeResult.time, focus: "" };
  }
  if (DELETE_COURSE_PATTERN.test(content)) {
    return { type: "delete", date, time: timeResult.time, focus: "" };
  }
  if (ADD_COURSE_PATTERN.test(content) && date && timeResult.time) {
    return {
      type: "add",
      date,
      time: timeResult.time,
      focus: extractCourseFocus(content, timeResult),
    };
  }
  return { type: "none", date, time: timeResult.time, focus: "" };
}

export function resolveCourseTarget({ state, content, pendingAction, sessionId }) {
  const bookings = Array.isArray(state?.bookings) ? state.bookings : [];
  const requestedDate = extractCourseDate(content);
  const requestedTime = extractCourseTime(content).time;
  let matches = bookings;
  if (requestedDate) matches = matches.filter((booking) => normalizeDate(booking.date) === requestedDate);
  if (requestedTime) matches = matches.filter((booking) => normalizeTime(booking.time) === requestedTime);
  if (requestedDate || requestedTime) {
    if (matches.length === 1) return { booking: matches[0] };
    if (matches.length > 1) return { error: `找到 ${matches.length} 节符合日期的课程，请补充具体时间。` };
    return { error: "没有找到符合该日期时间的课程，请核对后再试。" };
  }

  const pendingSessionId = pendingAction?.type === "delete_course" ? pendingAction.sessionId : "";
  const contextualId = pendingSessionId || sessionId || "";
  const contextual = bookings.find((booking) => booking.id === contextualId);
  if (contextual) return { booking: contextual };
  if (bookings.length === 1) return { booking: bookings[0] };
  return { error: "请补充要删除课程的日期和时间。" };
}

export function isDeleteConfirmation(value) {
  return CONFIRM_DELETE_PATTERN.test(String(value || ""));
}

function extractCourseDate(content) {
  const match = String(content || "").match(DATE_PATTERN);
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${month}/${day}`;
}

function extractCourseTime(content) {
  const match = TIME_RANGE_PATTERN.exec(String(content || ""));
  if (!match) return { time: "", index: -1, endIndex: -1 };
  const start = normalizeClock(match[1], match[2], match[3]);
  const end = normalizeClock(match[4] || match[1], match[5], match[6]);
  if (!start || !end || start >= end) return { time: "", index: match.index, endIndex: match.index + match[0].length };
  return { time: `${start}–${end}`, index: match.index, endIndex: match.index + match[0].length };
}

function normalizeClock(period, hourValue, minuteValue) {
  let hour = Number(hourValue);
  const minute = Number(minuteValue || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return "";
  if (["下午", "晚上", "傍晚"].includes(period) && hour < 12) hour += 12;
  if (["凌晨", "早上", "上午"].includes(period) && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractCourseFocus(content, timeResult) {
  if (timeResult.endIndex < 0) return "一对一私教";
  const tail = String(content).slice(timeResult.endIndex)
    .replace(/^[\s，,。的]+/, "")
    .replace(/[\s，,。]+$/, "")
    .replace(/(?:课程|私教课|课)$/, "")
    .trim();
  return tail.slice(0, 120) || "一对一私教";
}

function stableCourseRequestId(memberId, date, time) {
  return createHash("sha256").update(`${memberId}\u0000${date}\u0000${time}`).digest("hex").slice(0, 32);
}

function weekdayForCourse(date) {
  const [month, day] = date.split("/").map(Number);
  const now = new Date();
  let year = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Shanghai" }).format(now));
  let target = new Date(Date.UTC(year, month - 1, day, 4));
  if (target.getTime() < now.getTime() - 180 * 86400000) {
    year += 1;
    target = new Date(Date.UTC(year, month - 1, day, 4));
  }
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][target.getUTCDay()];
}

function displayCourse(booking) {
  const date = normalizeDate(booking?.date).replace("/", "月") + "日";
  const time = normalizeTime(booking?.time);
  const focus = String(booking?.focus || booking?.title || "私教课").replace(/课$/, "");
  return `${date} ${time} ${focus}课`;
}

function normalizeDate(value) {
  return String(value || "").split("/").map((part) => Number(part)).join("/");
}

function normalizeTime(value) {
  return String(value || "").replace(/[-—]/g, "–");
}
