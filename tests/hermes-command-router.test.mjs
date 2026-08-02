import assert from "node:assert/strict";
import test from "node:test";
import {
  createHermesCommandRouter,
  isDeleteConfirmation,
  parseCourseIntent,
  resolveCourseTarget,
} from "../server/hermes-command-router.mjs";

function member(bookings = []) {
  return {
    memberId: "member-li",
    member: { id: "member-li", name: "🐻🐻君", state_json: { bookings } },
  };
}

test("Hermes fast path parses and executes a complete Chinese course command", async () => {
  const calls = [];
  const router = createHermesCommandRouter({
    wecomContact: {
      async executeCoachOperation(body) {
        calls.push(body);
        return {
          changed: true,
          booking: { id: "session-806", date: body.date, time: body.time, focus: body.focus },
        };
      },
    },
  });
  const result = await router.route({
    content: "增加8月6号下午4:00到5:00腿部训练",
    coachUserId: "coach-1",
    resolvedMember: member(),
    conversation: {},
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, "add_private_session");
  assert.equal(calls[0].member_id, "member-li");
  assert.equal(calls[0].date, "8/6");
  assert.equal(calls[0].time, "16:00–17:00");
  assert.equal(calls[0].focus, "腿部训练");
  assert.equal(result.sessionId, "session-806");
  assert.match(result.reply, /8月6日 16:00–17:00 腿部训练课已添加并同步网站/);
});

test("Hermes delete request confirms the exact contextual course without executing", async () => {
  let executed = false;
  const bookings = [
    { id: "session-803", date: "8/3", time: "09:00–10:00", focus: "核心训练" },
    { id: "session-806", date: "8/6", time: "16:00–17:00", focus: "腿部训练" },
  ];
  const router = createHermesCommandRouter({
    wecomContact: { async executeCoachOperation() { executed = true; } },
  });
  const result = await router.route({
    content: "删除掉这节课",
    coachUserId: "coach-1",
    resolvedMember: member(bookings),
    conversation: { sessionId: "session-806" },
  });

  assert.equal(executed, false);
  assert.equal(result.sessionId, "session-806");
  assert.equal(result.pendingAction.sessionId, "session-806");
  assert.match(result.reply, /8月6日 16:00–17:00 腿部训练课/);
});

test("Hermes confirmation with an explicit date overrides stale context and deletes the right course", async () => {
  const calls = [];
  const bookings = [
    { id: "session-803", date: "8/3", time: "09:00–10:00", focus: "核心训练" },
    { id: "session-806", date: "8/6", time: "16:00–17:00", focus: "腿部训练" },
  ];
  const router = createHermesCommandRouter({
    wecomContact: {
      async executeCoachOperation(body) {
        calls.push(body);
        return { deleted_session: bookings[1] };
      },
    },
  });
  const result = await router.route({
    content: "确认删除8月6号的课",
    coachUserId: "coach-1",
    resolvedMember: member(bookings),
    conversation: {
      sessionId: "session-803",
      pendingAction: { type: "delete_course", memberId: "member-li", sessionId: "session-803" },
    },
  });

  assert.equal(calls[0].session_id, "session-806");
  assert.equal(result.clearPending, true);
  assert.equal(result.clearSession, true);
  assert.match(result.reply, /已删除.*8月6日/);
});

test("Hermes course targeting never guesses the last array item", () => {
  const state = { bookings: [
    { id: "session-806", date: "8/6", time: "16:00–17:00" },
    { id: "session-803", date: "8/3", time: "09:00–10:00" },
  ] };
  assert.equal(resolveCourseTarget({ state, content: "确认删除8月6号的课" }).booking.id, "session-806");
  assert.equal(isDeleteConfirmation("确认删除8月6号的课"), true);
  assert.equal(parseCourseIntent("确认删除8月6号的课").type, "confirm_delete");
});
