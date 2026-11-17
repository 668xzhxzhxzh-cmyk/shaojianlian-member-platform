import assert from "node:assert/strict";
import test from "node:test";
import { classifyCustomerMessage } from "../server/message-policy.mjs";

test("verified routine reminders skip chat approval", () => {
  assert.deepEqual(
    classifyCustomerMessage({ kind: "course_reminder", title: "课程提醒", content: "今天 18:00 有一节私教课，请提前到达。" }),
    { kind: "course_reminder", approvalMode: "routine_auto", reason: "verified_routine_notice" },
  );
});

test("server forces judgement and risk messages back to coach approval", () => {
  const decision = classifyCustomerMessage({ kind: "course_reminder", title: "课程调整", content: "根据疼痛情况调整训练方案。" });
  assert.equal(decision.kind, "coach_decision");
  assert.equal(decision.approvalMode, "coach_required");
});
