import { randomUUID } from "node:crypto";

const REMINDER_WINDOW_MS = 3 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATUSES = new Set(["已预约", "已确认"]);

export function createCourseReminderService({ pool, queueRoutineMessage, notifyCoach = async () => {} }) {
  let running = false;

  async function run({ now = new Date() } = {}) {
    if (running) return { skipped: "already_running", checked: 0, queued: 0 };
    running = true;
    try {
      const result = await pool.query(
        `SELECT b.member_id,b.coach_userid,u.name,p.state_json
         FROM member_wecom_bindings b
         JOIN users u ON u.id=b.member_id AND u.role='member' AND u.status='active'
         JOIN portal_state p ON p.user_id=b.member_id
         WHERE b.status='active' AND b.external_userid IS NOT NULL`,
      );
      let checked = 0;
      let queued = 0;
      for (const row of result.rows) {
        const bookings = Array.isArray(row.state_json?.bookings) ? row.state_json.bookings : [];
        for (const booking of bookings) {
          if (!ACTIVE_BOOKING_STATUSES.has(String(booking?.status || ""))) continue;
          const courseStart = resolveBookingStart(booking, now);
          if (!courseStart) continue;
          const untilStart = courseStart.getTime() - now.getTime();
          if (untilStart <= 0 || untilStart > REMINDER_WINDOW_MS) continue;
          checked += 1;
          const reminderId = randomUUID();
          const inserted = await pool.query(
            `INSERT INTO wecom_course_reminders
               (id,member_id,booking_id,reminder_type,course_start,status)
             VALUES ($1,$2,$3,'before_course',$4,'creating')
             ON CONFLICT (member_id,booking_id,reminder_type,course_start) DO NOTHING
             RETURNING id`,
            [reminderId, row.member_id, String(booking.id), courseStart],
          );
          if (!inserted.rows[0]) continue;

          try {
            const startLabel = chinaCourseLabel(courseStart);
            const focus = String(booking.focus || booking.title || "私教课").trim().slice(0, 80);
            const delivery = await queueRoutineMessage({
              memberId: row.member_id,
              coachUserId: row.coach_userid,
              kind: "course_reminder",
              title: "课程提醒",
              content: `${row.name}，提醒您${startLabel}有${focus}。请提前 10 分钟到达；如行程有变化，请直接联系邵教练。`,
              sourceKey: `course-reminder:${row.member_id}:${booking.id}:${courseStart.toISOString()}`,
              scheduledFor: courseStart,
            });
            const status = delivery.task?.status || "unknown";
            await pool.query(
              `UPDATE wecom_course_reminders
               SET status=$2,send_task_id=$3,updated_at=NOW()
               WHERE id=$1`,
              [reminderId, status, delivery.task?.task_id || null],
            );
            queued += 1;
            if (status === "awaiting_coach_confirmation") {
              await notifyCoach(row.coach_userid, `“${row.name}”的课程提醒已自动创建，请在企业微信客户端确认发送。`);
            } else if (status === "frequency_deferred") {
              await notifyCoach(row.coach_userid, `“${row.name}”当前群发周期额度已用完，课程提醒已被频控保护。请从客户会话手动提醒。`);
            }
          } catch (error) {
            await pool.query(
              `UPDATE wecom_course_reminders
               SET status='failed',error_message=$2,updated_at=NOW()
               WHERE id=$1`,
              [reminderId, String(error?.message || error).slice(0, 300)],
            );
          }
        }
      }
      return { checked, queued };
    } finally {
      running = false;
    }
  }

  return { run };
}

export function resolveBookingStart(booking, now = new Date()) {
  const dateMatch = String(booking?.date || "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  const timeMatch = String(booking?.time || "").trim().match(/^(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  let candidate = bookingDate(year, month, day, hour, minute);
  if (candidate.getTime() < now.getTime() - 180 * 24 * 60 * 60 * 1000) {
    candidate = bookingDate(year + 1, month, day, hour, minute);
  }
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function bookingDate(year, month, day, hour, minute) {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
}

function chinaCourseLabel(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${Number(values.month)}月${Number(values.day)}日 ${values.hour}:${values.minute}`;
}
