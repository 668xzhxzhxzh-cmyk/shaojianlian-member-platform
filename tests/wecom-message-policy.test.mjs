import assert from "node:assert/strict";
import test from "node:test";
import { createWecomContactService } from "../server/wecom-contact.mjs";

function messagePool(quotaUsed = 0) {
  const tasks = new Map();
  const updates = [];
  const database = {
    tasks,
    updates,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("SELECT b.member_id,b.external_userid,b.coach_userid,u.name")) {
        return { rows: [{ member_id: "member-1", external_userid: "wm-customer-1", coach_userid: "coach-1", name: "测试会员" }] };
      }
      if (text.includes("INSERT INTO wecom_send_tasks")) {
        tasks.set(params[0], {
          id: params[0], member_id: params[1], external_userid: params[2], coach_userid: params[3],
          title: params[4], content: params[5], status: "draft", message_kind: params[6], approval_mode: params[7],
        });
        return { rows: [{ id: params[0] }] };
      }
      if (text.includes("SELECT id,status") && text.includes("created_at")) return { rows: [] };
      if (text.includes("SELECT COUNT(*)::int AS used")) return { rows: [{ used: quotaUsed }] };
      if (text.includes("UPDATE wecom_send_tasks")) {
        updates.push({ text, params });
        const task = tasks.get(params[0]);
        if (task && text.includes("creating_task")) task.status = "creating_task";
        if (task && text.includes("awaiting_coach_confirmation")) task.status = "awaiting_coach_confirmation";
        return { rows: [] };
      }
      if (text.includes("INSERT INTO audit_log")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    async connect() {
      return {
        query: async (sql, params = []) => {
          const text = String(sql);
          if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
          if (text.includes("FROM wecom_send_tasks") && text.includes("FOR UPDATE")) {
            const task = tasks.get(params[0]);
            return { rows: task ? [{ ...task }] : [] };
          }
          return database.query(sql, params);
        },
        release() {},
      };
    },
  };
  return database;
}

test("routine messages auto-create a WeCom task while decision content stays draft", async () => {
  process.env.WECOM_CORP_ID = "ww-test";
  process.env.WECOM_CONTACT_SECRET = "contact-secret";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-1";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/cgi-bin/gettoken") {
      return { ok: true, status: 200, async json() { return { errcode: 0, access_token: "token", expires_in: 7200 }; } };
    }
    if (url.pathname === "/cgi-bin/externalcontact/add_msg_template") {
      return { ok: true, status: 200, async json() { return { errcode: 0, msgid: "msg-1", fail_list: [] }; } };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const pool = messagePool();
    const service = createWecomContactService({ pool });
    const routine = await service.createCustomerMessage({
      memberId: "member-1",
      coachUserId: "coach-1",
      kind: "course_reminder",
      title: "课程提醒",
      content: "今天 18:00 有一节私教课，请提前到达。",
    });
    assert.equal(routine.policy.approvalMode, "routine_auto");
    assert.equal(routine.task.status, "awaiting_coach_confirmation");
    assert.match(routine.instruction, /无需聊天内二次审批/);

    const decision = await service.createCustomerMessage({
      memberId: "member-1",
      coachUserId: "coach-1",
      kind: "course_reminder",
      title: "训练调整",
      content: "根据疼痛情况调整训练方案。",
    });
    assert.equal(decision.policy.approvalMode, "coach_required");
    assert.equal(decision.task.status, "draft");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WECOM_CORP_ID;
    delete process.env.WECOM_CONTACT_SECRET;
    delete process.env.WECOM_ALLOWED_COACH_USERIDS;
    delete process.env.WECOM_GROUP_SEND_RULE;
  }
});

test("monthly quota defers only after the calendar-month allowance is exhausted", async () => {
  process.env.WECOM_CORP_ID = "ww-test";
  process.env.WECOM_CONTACT_SECRET = "contact-secret";
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-1";
  process.env.WECOM_GROUP_SEND_RULE = "monthly";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("WeCom must not be called after the local monthly allowance is exhausted");
  };

  try {
    const pool = messagePool(31);
    const service = createWecomContactService({ pool });
    const result = await service.createCustomerMessage({
      memberId: "member-1",
      coachUserId: "coach-1",
      kind: "hydration_reminder",
      title: "饮水提醒",
      content: "请及时补充饮水。",
    });

    assert.equal(result.task.status, "frequency_deferred");
    assert.match(result.task.provider_message, /本月 31 条/);
    assert.match(result.instruction, /下一可发送窗口/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WECOM_CORP_ID;
    delete process.env.WECOM_CONTACT_SECRET;
    delete process.env.WECOM_ALLOWED_COACH_USERIDS;
    delete process.env.WECOM_GROUP_SEND_RULE;
  }
});
