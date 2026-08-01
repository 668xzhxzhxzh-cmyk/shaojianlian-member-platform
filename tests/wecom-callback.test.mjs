import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import test from "node:test";
import {
  calculateWecomSignature,
  createWecomCallbackService,
} from "../server/wecom-callback.mjs";

const token = "test-callback-token";
const encodingAesKey = randomBytes(32).toString("base64").replace(/=$/, "");
const corpId = "ww-test-corp-id";

function configure() {
  process.env.WECOM_CALLBACK_TOKEN = token;
  process.env.WECOM_CALLBACK_AES_KEY = encodingAesKey;
  process.env.WECOM_CORP_ID = corpId;
  process.env.WECOM_ALLOWED_COACH_USERIDS = "coach-1";
}

function response() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = String(body ?? "");
    },
  };
}

function request(method, body = "") {
  return {
    method,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
}

function encrypt(message, receiverId = corpId) {
  const key = Buffer.from(`${encodingAesKey}=`, "base64");
  const messageBytes = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBytes.length);
  let plain = Buffer.concat([randomBytes(16), length, messageBytes, Buffer.from(receiverId)]);
  const pad = 32 - (plain.length % 32 || 32);
  const padLength = pad || 32;
  plain = Buffer.concat([plain, Buffer.alloc(padLength, padLength)]);
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64");
}

function callbackUrl(encrypted, overrides = {}) {
  const timestamp = overrides.timestamp || "1785590400";
  const nonce = overrides.nonce || "callback-nonce";
  const signature = overrides.signature || calculateWecomSignature(token, timestamp, nonce, encrypted);
  return new URL(`http://localhost/api/wecom/callback?msg_signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypted)}`);
}

test("WeCom callback validates SHA-1 and decrypts the verification echostr", async () => {
  configure();
  const encrypted = encrypt("verification-ok");
  const res = response();
  await createWecomCallbackService().handle(request("GET"), res, callbackUrl(encrypted));
  assert.equal(res.status, 200);
  assert.equal(res.body, "verification-ok");
  assert.match(res.headers["content-type"], /^text\/plain/);
});

test("WeCom callback rejects invalid signatures and receiver ids", async () => {
  configure();
  const service = createWecomCallbackService();

  await assert.rejects(
    service.handle(request("GET"), response(), callbackUrl(encrypt("echo"), { signature: "0".repeat(40) })),
    /签名无效/,
  );
  await assert.rejects(
    service.handle(request("GET"), response(), callbackUrl(encrypt("echo", "other-corp"))),
    /接收方不匹配/,
  );
});

test("WeCom callback AES-decrypts POST messages before dispatch", async () => {
  configure();
  let received;
  const service = createWecomCallbackService({ onMessage: async (message) => { received = message; } });
  const innerXml = `<xml><ToUserName><![CDATA[${corpId}]]></ToUserName><FromUserName><![CDATA[coach-1]]></FromUserName><CreateTime>1785590400</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[查询会员 member-1]]></Content><AgentID>1000002</AgentID><MsgId>msg-1</MsgId></xml>`;
  const encrypted = encrypt(innerXml);
  const url = callbackUrl(encrypted);
  url.searchParams.delete("echostr");
  const outerXml = `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;
  const res = response();
  await service.handle(request("POST", outerXml), res, url);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.status, 200);
  assert.equal(res.body, "success");
  assert.deepEqual(received, {
    toUserName: corpId,
    fromUserName: "coach-1",
    createTime: "1785590400",
    msgType: "text",
    content: "查询会员 member-1",
    event: "",
    changeType: "",
    userId: "",
    externalUserId: "",
    state: "",
    welcomeCode: "",
    agentId: "1000002",
    msgId: "msg-1",
    receiverId: corpId,
  });
});

test("WeCom callback dispatches an authenticated add-customer event by coach UserID", async () => {
  configure();
  let received;
  let coachMessageDispatched = false;
  const service = createWecomCallbackService({
    onMessage: async () => { coachMessageDispatched = true; },
    onContactEvent: async (message) => { received = message; },
  });
  const innerXml = `<xml><ToUserName><![CDATA[${corpId}]]></ToUserName><FromUserName><![CDATA[sys]]></FromUserName><CreateTime>1785590401</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[change_external_contact]]></Event><ChangeType><![CDATA[add_external_contact]]></ChangeType><UserID><![CDATA[coach-1]]></UserID><ExternalUserID><![CDATA[wm-customer-1]]></ExternalUserID><State><![CDATA[sb_12345678901234567890]]></State><WelcomeCode><![CDATA[welcome-1]]></WelcomeCode></xml>`;
  const encrypted = encrypt(innerXml);
  const url = callbackUrl(encrypted);
  url.searchParams.delete("echostr");
  const res = response();
  await service.handle(request("POST", `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`), res, url);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.status, 200);
  assert.equal(res.body, "success");
  assert.equal(coachMessageDispatched, false);
  assert.equal(received.userId, "coach-1");
  assert.equal(received.externalUserId, "wm-customer-1");
  assert.equal(received.changeType, "add_external_contact");
  assert.equal(received.state, "sb_12345678901234567890");
});

test("WeCom callback acknowledges but never dispatches unauthorized users", async () => {
  configure();
  let dispatched = false;
  const service = createWecomCallbackService({ onMessage: async () => { dispatched = true; } });
  const innerXml = `<xml><FromUserName><![CDATA[member-or-other-user]]></FromUserName><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[查看其他会员]]></Content></xml>`;
  const encrypted = encrypt(innerXml);
  const url = callbackUrl(encrypted);
  url.searchParams.delete("echostr");
  const res = response();
  await service.handle(request("POST", `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`), res, url);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(res.status, 200);
  assert.equal(res.body, "success");
  assert.equal(dispatched, false);
});
