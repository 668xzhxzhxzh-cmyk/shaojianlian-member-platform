import assert from "node:assert/strict";
import test from "node:test";
import { createWecomAppService } from "../server/wecom-app.mjs";

function configure() {
  process.env.WECOM_CORP_ID = "ww-test-corp";
  process.env.WECOM_APP_SECRET = "app-secret";
  process.env.WECOM_APP_AGENT_ID = "1000002";
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
  };
}

test("WeCom self-built app sends Hermes replies only to the exact coach userid", async () => {
  configure();
  const calls = [];
  const service = createWecomAppService({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/cgi-bin/gettoken")) {
        return jsonResponse({ errcode: 0, access_token: "test-access-token", expires_in: 7200 });
      }
      return jsonResponse({ errcode: 0, errmsg: "ok", msgid: "message-1" });
    },
  });

  const result = await service.sendText({ toUserId: "coach-1", content: "Hermes 已完成任务" });
  assert.equal(service.appConfigured, true);
  assert.equal(result.length, 1);
  assert.equal(calls.length, 2);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.touser, "coach-1");
  assert.equal(body.agentid, 1000002);
  assert.equal(body.text.content, "Hermes 已完成任务");
  assert.equal(body.enable_duplicate_check, 1);
});

test("WeCom self-built app rejects a mismatched AgentID and splits long UTF-8 replies", async () => {
  configure();
  const sent = [];
  const service = createWecomAppService({
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes("/cgi-bin/gettoken")) {
        return jsonResponse({ errcode: 0, access_token: "test-access-token", expires_in: 7200 });
      }
      sent.push(JSON.parse(options.body));
      return jsonResponse({ errcode: 0, errmsg: "ok" });
    },
  });

  await assert.rejects(
    service.sendText({ toUserId: "coach-1", content: "test", agentId: "1000003" }),
    /AgentID 不匹配/,
  );
  await service.sendText({ toUserId: "coach-1", content: "汉".repeat(1300) });
  assert.equal(sent.length, 3);
  assert.ok(sent.every((item) => Buffer.byteLength(item.text.content, "utf8") <= 1800));
});

test("WeCom self-built app never reports a provider rejection as sent", async () => {
  configure();
  const service = createWecomAppService({
    fetchImpl: async (url) => String(url).includes("/cgi-bin/gettoken")
      ? jsonResponse({ errcode: 0, access_token: "test-access-token", expires_in: 7200 })
      : jsonResponse({ errcode: 60020, errmsg: "not allow access from your ip" }),
  });
  await assert.rejects(
    service.sendText({ toUserId: "coach-1", content: "test" }),
    /errcode=60020/,
  );
});
