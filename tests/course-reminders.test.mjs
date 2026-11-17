import assert from "node:assert/strict";
import test from "node:test";
import { createCourseReminderService, resolveBookingStart } from "../server/course-reminders.mjs";

test("course dates are resolved in China time", () => {
  const start = resolveBookingStart(
    { date: "8/3", time: "10:00–11:00" },
    new Date("2026-08-02T23:30:00.000Z"),
  );
  assert.equal(start?.toISOString(), "2026-08-03T02:00:00.000Z");
  const newYear = resolveBookingStart(
    { date: "1/1", time: "10:00–11:00" },
    new Date("2026-12-31T23:30:00.000+08:00"),
  );
  assert.equal(newYear?.toISOString(), "2027-01-01T02:00:00.000Z");
});

test("an upcoming booked course creates one idempotent routine reminder", async () => {
  let inserted = false;
  const updates = [];
  const pool = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("FROM member_wecom_bindings")) {
        return { rows: [{
          member_id: "member-1",
          coach_userid: "coach-1",
          name: "测试会员",
          state_json: { bookings: [{ id: "booking-1", date: "8/3", time: "10:00–11:00", focus: "核心训练", status: "已预约" }] },
        }] };
      }
      if (text.includes("INSERT INTO wecom_course_reminders")) {
        if (inserted) return { rows: [] };
        inserted = true;
        return { rows: [{ id: params[0] }] };
      }
      if (text.includes("UPDATE wecom_course_reminders")) {
        updates.push(params);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const queued = [];
  const notices = [];
  const service = createCourseReminderService({
    pool,
    queueRoutineMessage: async (message) => {
      queued.push(message);
      return { task: { task_id: "task-1", status: "awaiting_coach_confirmation" } };
    },
    notifyCoach: async (_coach, message) => notices.push(message),
  });
  const now = new Date("2026-08-02T23:30:00.000Z");
  assert.deepEqual(await service.run({ now }), { checked: 1, queued: 1 });
  assert.deepEqual(await service.run({ now }), { checked: 1, queued: 0 });
  assert.equal(queued[0].kind, "course_reminder");
  assert.match(queued[0].content, /8月3日 10:00/);
  assert.equal(updates[0][1], "awaiting_coach_confirmation");
  assert.match(notices[0], /课程提醒已自动创建/);
});
