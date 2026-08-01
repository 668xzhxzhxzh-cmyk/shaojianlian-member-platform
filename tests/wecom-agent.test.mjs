import assert from "node:assert/strict";
import test from "node:test";
import {
  compactWecomHermesReply,
  resolveWecomMemberContext,
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

test("WeCom Hermes replies are normalized and kept concise", () => {
  assert.equal(compactWecomHermesReply("收到。\n\n\n  已执行。  "), "收到。\n\n已执行。");
  const compact = compactWecomHermesReply("繁".repeat(WECOM_HERMES_REPLY_LIMIT + 50));
  assert.equal(Array.from(compact).length, WECOM_HERMES_REPLY_LIMIT);
  assert.ok(compact.endsWith("…"));
});

test("Hermes WeCom prompt executes complete additive changes without confirmation", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../server/index.mjs", import.meta.url), "utf8"));
  assert.match(source, /所需参数齐全时立即调用最窄的 MCP 工具执行/);
  assert.match(source, /不要先复述，不要再问“是否确认”/);
  assert.match(source, /不得误解为提醒会员、创建消息或待办/);
  assert.match(source, /当前完整指令本身就是执行授权/);
  assert.match(source, /绝不要再次要求教练确认会员或重发 member_id/);
  assert.match(source, /仅两类操作必须二次确认：删除课程，以及创建企业微信客户发送任务/);
});
