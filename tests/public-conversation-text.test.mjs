import assert from "node:assert/strict";
import test from "node:test";
import { redactConversationText } from "../lib/public-conversation-text.mjs";

test("public conversation text removes task, member, session and UUID identifiers", () => {
  const output = redactConversationText(
    "任务 task_id=13e21b3d-54b8-46dc-8e65-05862cc084e8 已为 member_id=member-li 完成，session_id=course-88。member-li 可以查看。",
    { memberIds: ["member-li"] },
  );
  assert.doesNotMatch(output, /task_id|member_id|session_id|13e21b3d|member-li/i);
  assert.match(output, /当前会员/);
});

test("public conversation text keeps normal business content", () => {
  assert.equal(redactConversationText("课程已添加，网站已同步。"), "课程已添加，网站已同步。");
});
