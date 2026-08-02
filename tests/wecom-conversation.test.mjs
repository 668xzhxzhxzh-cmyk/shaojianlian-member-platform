import assert from "node:assert/strict";
import test from "node:test";
import {
  appendConversationTurns,
  isContextualFollowUp,
  isCourseReference,
  normalizeConversation,
  normalizePendingAction,
  selectLatestCourseSessionId,
} from "../server/wecom-conversation.mjs";

test("WeCom recognizes short contextual commands without treating unrelated names as context", () => {
  assert.equal(isContextualFollowUp("删除这节课"), true);
  assert.equal(isContextualFollowUp("确认删除"), true);
  assert.equal(isContextualFollowUp("确认删除8月6号的课"), true);
  assert.equal(isContextualFollowUp("增加8月6号下午4点到5点腿部训练"), true);
  assert.equal(isContextualFollowUp("添加一节8月6号下午4点到5点腿部训练"), true);
  assert.equal(isContextualFollowUp("删除掉这节课"), true);
  assert.equal(isContextualFollowUp("把这节课改到晚上七点"), true);
  assert.equal(isContextualFollowUp("给另一个昵称叫熊仔的会员加课"), false);
});

test("WeCom keeps a bounded normalized short-term history", () => {
  let turns = [];
  for (let index = 0; index < 8; index += 1) {
    turns = appendConversationTurns(turns, `指令${index}`, `回复${index}`);
  }
  assert.equal(turns.length, 6);
  assert.deepEqual(turns.at(-2), { role: "user", content: "指令7" });
  assert.deepEqual(turns.at(-1), { role: "assistant", content: "回复7" });
});

test("WeCom conversation state rejects unsafe ids and malformed turns", () => {
  const conversation = normalizeConversation({
    member_id: "member-li",
    session_id: "bad id with spaces",
    pending_json: { type: "delete_course", memberId: "member-li", sessionId: "session-806" },
    turns_json: [
      { role: "system", content: "不要保留" },
      { role: "user", content: "删除这节课" },
      { role: "assistant", content: "确认删除？" },
    ],
  });
  assert.equal(conversation.memberId, "member-li");
  assert.equal(conversation.sessionId, "");
  assert.equal(conversation.pendingAction.sessionId, "session-806");
  assert.equal(conversation.turns.length, 2);
  assert.equal(normalizePendingAction({ type: "other", memberId: "member-li", sessionId: "session-806" }), null);
});

test("WeCom selects the latest exact course session from website state", () => {
  assert.equal(isCourseReference("删除这节课"), true);
  assert.equal(selectLatestCourseSessionId({ bookings: [{ id: "session-1" }, { id: "session-2" }] }), "session-2");
  assert.equal(selectLatestCourseSessionId({ bookings: [{ id: "bad session" }] }), "");
});
