import assert from "node:assert/strict";
import test from "node:test";
import {
  compactCustomerReply,
  createHermesCustomerReplyService,
  createHermesVisionService,
} from "../server/hermes-vision.mjs";

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
  };
}

test("Hermes vision sends image bytes only to the configured Aliyun vision model", async () => {
  process.env.DASHSCOPE_API_KEY = "vision-key";
  process.env.HERMES_VISION_MODEL = "qwen3.7-plus";
  process.env.HERMES_VISION_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  let requestBody;
  const service = createHermesVisionService({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return jsonResponse({ choices: [{ message: { content: "图片中是一份鸡胸肉和蔬菜餐。" } }] });
    },
  });
  const result = await service.analyzeImage({
    bytes: Buffer.from("test-image"),
    mimeType: "image/jpeg",
    prompt: "这顿饭适合我吗",
  });

  assert.equal(service.configured, true);
  assert.match(requestBody.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.match(requestBody.messages[0].content[0].text, /不得识别人脸身份/);
  assert.match(result, /鸡胸肉/);
});

test("Hermes customer reply is read-only, concise and hides internal identifiers", async () => {
  process.env.HERMES_API_KEY = "hermes-key";
  process.env.HERMES_API_URL = "http://127.0.0.1:9119";
  let requestBody;
  let requestHeaders;
  const service = createHermesCustomerReplyService({
    fetchImpl: async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:9119/v1/chat/completions");
      requestBody = JSON.parse(options.body);
      requestHeaders = options.headers;
      return jsonResponse({ choices: [{ message: { content: "你最近的课程有更新。member_id=member-1 task_id=13e21b3d-54b8-46dc-8e65-05862cc084e8" } }] });
    },
  });
  const reply = await service.reply({
    externalUserId: "wm-customer-1",
    memberName: "测试会员",
    customerText: "看一下最近课表",
    memberState: { profile: { name: "测试会员" }, bookings: [{ date: "8/18", time: "15:00-16:00" }] },
    history: [{ role: "user", content: "上一条问题" }, { role: "assistant", content: "上一条回答" }],
  });

  assert.match(requestBody.messages[0].content, /不能调用管理工具/);
  assert.deepEqual(requestBody.tools, []);
  assert.equal(requestBody.tool_choice, "none");
  assert.match(requestHeaders["x-hermes-session-key"], /^wecom-kf:[0-9a-f]{32}$/);
  assert.equal(requestBody.messages[1].content, "上一条问题");
  assert.doesNotMatch(reply, /member_id|task_id|member-1|13e21b3d/);
  assert.equal(compactCustomerReply("正常回复"), "正常回复");
});
