import assert from "node:assert/strict";
import test from "node:test";
import {
  compactWecomHermesReply,
  resolveWecomMemberContext,
  selectRelevantMemberState,
  WECOM_HERMES_REPLY_LIMIT,
} from "../server/wecom-agent.mjs";

function fakePool(rows) {
  return {
    async query(_sql, params) {
      assert.deepEqual(params, ["coach-1"]);
      return { rows };
    },
  };
}

test("WeCom resolves an exact bound member name to the verified member_id", async () => {
  const result = await resolveWecomMemberContext({
    pool: fakePool([
      { id: "member-li", name: "🐻🐻君", status: "active", state_json: { bookings: [] } },
      { id: "member-wang", name: "王教练", status: "active", state_json: {} },
    ]),
    coachUserId: "coach-1",
    content: "给🐻🐻君8月4日18:00到19:00添加一节训练放松课",
  });

  assert.equal(result.memberId, "member-li");
  assert.match(result.context, /member_id=member-li/);
  assert.match(result.context, /有效绑定关系/);
});

test("WeCom never uses a similar or unbound nickname as a member_id", async () => {
  const result = await resolveWecomMemberContext({
    pool: fakePool([{ id: "member-li", name: "🐻🐻君", status: "active", state_json: {} }]),
    coachUserId: "coach-1",
    content: "给熊君添加一节课",
  });

  assert.equal(result.memberId, undefined);
  assert.match(result.context, /询问一次精确 member_id/);
});

test("WeCom rejects an explicit member_id outside the coach binding", async () => {
  const result = await resolveWecomMemberContext({
    pool: fakePool([{ id: "member-li", name: "🐻🐻君", status: "active", state_json: {} }]),
    coachUserId: "coach-1",
    content: "给 member_id=member-other 添加课程",
  });

  assert.match(result.error, /找不到 member_id=member-other/);
});

test("WeCom resolves a contextual follow-up from a recently verified member_id", async () => {
  const result = await resolveWecomMemberContext({
    pool: fakePool([{ id: "member-li", name: "🐻🐻君", status: "active", state_json: { bookings: [] } }]),
    coachUserId: "coach-1",
    content: "删除这节课",
    trustedMemberId: "member-li",
  });

  assert.equal(result.memberId, "member-li");
  assert.equal(result.member.id, "member-li");
  assert.match(result.context, /最近 24 小时会话/);
});

test("WeCom safely resolves a contextual follow-up when the coach has one exact active binding", async () => {
  const result = await resolveWecomMemberContext({
    pool: fakePool([{ id: "member-li", name: "🐻🐻君", status: "active", state_json: { bookings: [] } }]),
    coachUserId: "coach-1",
    content: "删除这节课",
    allowSoleBoundMember: true,
  });

  assert.equal(result.memberId, "member-li");
  assert.match(result.context, /只有这一条有效会员绑定/);
});

test("WeCom Hermes replies are normalized and kept concise", () => {
  assert.equal(compactWecomHermesReply("收到。\n\n\n  已执行。  "), "收到。\n\n已执行。");
  const compact = compactWecomHermesReply("繁".repeat(WECOM_HERMES_REPLY_LIMIT + 50));
  assert.equal(Array.from(compact).length, WECOM_HERMES_REPLY_LIMIT);
  assert.ok(compact.endsWith("…"));
});

test("WeCom Hermes replies hide internal identifiers from the coach", () => {
  const compact = compactWecomHermesReply(
    "已为 member_id=member-li 创建 task_id=13e21b3d-54b8-46dc-8e65-05862cc084e8，session_id=course-77。member-li 已同步。",
    undefined,
    { memberIds: ["member-li"] },
  );
  assert.doesNotMatch(compact, /task_id|member_id|session_id|13e21b3d|member-li/i);
  assert.match(compact, /当前会员/);
});

test("WeCom sends only intent-relevant member data to reduce tokens", () => {
  const state = {
    profile: { name: "🐻🐻君" },
    bookings: [{ id: "course-1" }],
    trainingPlan: { goal: "增肌" },
    nutritionPlan: { calories: 1800 },
    bodyMetrics: [{ weight: 70 }],
    suggestions: ["很长的无关数据"],
  };
  const course = selectRelevantMemberState(state, "删除这节课");
  assert.deepEqual(course.bookings, [{ id: "course-1" }]);
  assert.equal(course.trainingPlan, undefined);
  assert.equal(course.nutritionPlan, undefined);
  assert.equal(course.suggestions, undefined);
});

test("Hermes WeCom prompt executes complete additive changes without confirmation", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../server/index.mjs", import.meta.url), "utf8"));
  assert.match(source, /参数齐全就调用最窄工具执行/);
  assert.match(source, /系统已给出时不得再次索要/);
  assert.match(source, /createHermesCommandRouter/);
  assert.match(source, /enqueueWecomCoachMessage/);
  assert.match(source, /temperature: 0\.1/);
  assert.match(source, /max_tokens: 480/);
  assert.match(source, /\.\.\.conversation\.turns/);
});
