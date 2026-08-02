import assert from "node:assert/strict";
import test from "node:test";
import { createWecomCustomerService } from "../server/wecom-kf.mjs";

function configure() {
  process.env.WECOM_CORP_ID = "ww-test-corp";
  process.env.WECOM_KF_SECRET = "kf-secret";
  process.env.WECOM_KF_OPEN_KFID = "wk-test-1";
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    async json() { return data; },
  };
}

function createPool() {
  const seen = new Set();
  const conversations = new Map();
  return {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("INSERT INTO wecom_customer_messages")) {
        if (seen.has(params[0])) return { rows: [] };
        seen.add(params[0]);
        return { rows: [{ msg_id: params[0] }] };
      }
      if (text.includes("FROM member_wecom_bindings")) {
        assert.equal(params[0], "wm-customer-1");
        return { rows: [{ id: "member-1", name: "测试会员", state_json: { bookings: [{ date: "8/18", time: "15:00-16:00" }] } }] };
      }
      if (text.includes("SELECT turns_json FROM wecom_customer_conversations")) {
        return { rows: conversations.has(params[0]) ? [{ turns_json: conversations.get(params[0]) }] : [] };
      }
      if (text.includes("INSERT INTO wecom_customer_conversations")) {
        conversations.set(params[0], params[2]);
        return { rows: [] };
      }
      if (text.includes("UPDATE wecom_customer_messages")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
}

test("WeChat customer-service text uses only the exact external_userid binding", async () => {
  configure();
  const sent = [];
  const pool = createPool();
  const service = createWecomCustomerService({
    pool,
    visionService: { configured: true, analyzeImage: async () => "" },
    replyService: {
      configured: true,
      async reply(input) {
        assert.equal("memberId" in input, false);
        assert.equal(input.externalUserId, "wm-customer-1");
        assert.equal(input.customerText, "看一下最近课表有没有更新");
        return "8 月 18 日 15:00 有一节课。";
      },
    },
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes("/cgi-bin/gettoken")) return jsonResponse({ errcode: 0, access_token: "token", expires_in: 7200 });
      sent.push(JSON.parse(options.body));
      return jsonResponse({ errcode: 0, errmsg: "ok" });
    },
  });

  const message = {
    msgid: "msg-text-1",
    open_kfid: "wk-test-1",
    external_userid: "wm-customer-1",
    origin: 3,
    msgtype: "text",
    text: { content: "看一下最近课表有没有更新" },
  };
  const result = await service.processCustomerMessage(message);
  const duplicate = await service.processCustomerMessage(message);

  assert.equal(service.configured, true);
  assert.equal(result.replied, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].touser, "wm-customer-1");
  assert.equal(sent[0].text.content, "8 月 18 日 15:00 有一节课。");
});

test("WeChat customer-service discovers the exact account and persists its sync cursor", async () => {
  process.env.WECOM_CORP_ID = "ww-test-corp";
  delete process.env.WECOM_KF_SECRET;
  delete process.env.WECOM_KF_OPEN_KFID;
  process.env.WECOM_APP_SECRET = "existing-app-secret";
  process.env.WECOM_KF_ACCOUNT_NAME = "AI健康管理服务";
  let savedCursor = "";
  const requests = [];
  const pool = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("SELECT cursor FROM wecom_customer_sync_state")) return { rows: savedCursor ? [{ cursor: savedCursor }] : [] };
      if (text.includes("INSERT INTO wecom_customer_sync_state")) { savedCursor = params[1]; return { rows: [] }; }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
  const service = createWecomCustomerService({
    pool,
    visionService: { configured: true },
    replyService: { configured: true },
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
      if (String(url).includes("/cgi-bin/gettoken")) return jsonResponse({ errcode: 0, access_token: "token", expires_in: 7200 });
      if (String(url).includes("/cgi-bin/kf/account/list")) return jsonResponse({ errcode: 0, account_list: [{ open_kfid: "wk-other", name: "其他客服" }, { open_kfid: "wk-health", name: "AI健康管理服务" }] });
      if (String(url).includes("/cgi-bin/kf/sync_msg")) return jsonResponse({ errcode: 0, msg_list: [], has_more: 0, next_cursor: "cursor-2" });
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const result = await service.handleEvent({ openKfId: "wk-health", kfToken: "sync-token" });
  assert.equal(service.configured, true);
  assert.equal(result.processed, 0);
  assert.equal(savedCursor, "cursor-2");
  assert.equal(requests.find((item) => item.url.includes("sync_msg")).body.open_kfid, "wk-health");
});

test("WeChat customer-service image is downloaded and passed through Hermes vision", async () => {
  configure();
  const pool = createPool();
  let analyzedMimeType = "";
  let receivedDescription = "";
  const service = createWecomCustomerService({
    pool,
    visionService: {
      configured: true,
      async analyzeImage(media) {
        analyzedMimeType = media.mimeType;
        assert.equal(media.bytes.toString(), "image-bytes");
        return "图片中是一份训练餐。";
      },
    },
    replyService: {
      configured: true,
      async reply(input) {
        receivedDescription = input.imageDescription;
        return "这份餐食蛋白质充足，主食量可按当天训练安排调整。";
      },
    },
    fetchImpl: async (url) => {
      if (String(url).includes("/cgi-bin/gettoken")) return jsonResponse({ errcode: 0, access_token: "token", expires_in: 7200 });
      if (String(url).includes("/cgi-bin/media/get")) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === "content-type" ? "image/jpeg" : "11" },
          async arrayBuffer() { return Buffer.from("image-bytes"); },
        };
      }
      return jsonResponse({ errcode: 0, errmsg: "ok" });
    },
  });

  const result = await service.processCustomerMessage({
    msgid: "msg-image-1",
    open_kfid: "wk-test-1",
    external_userid: "wm-customer-1",
    origin: 3,
    msgtype: "image",
    image: { media_id: "media-1" },
  });

  assert.equal(result.replied, true);
  assert.equal(analyzedMimeType, "image/jpeg");
  assert.match(receivedDescription, /训练餐/);
});
