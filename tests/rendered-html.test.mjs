import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the member portal without starter artifacts", async () => {
  const [page, portal, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /FitnessPortal/);
  assert.match(portal, /邵教练专属会员平台/);
  assert.match(portal, /训练计划/);
  assert.doesNotMatch(`${page}${portal}${packageJson}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("includes coach approval, native Hermes and WeCom AI Bot tooling", async () => {
  const [coach, assistant, deepseek, tools, contact] = await Promise.all([
    readFile(new URL("../components/management-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/assistant-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/hermes_tools_mcp.py", import.meta.url), "utf8"),
    readFile(new URL("../server/wecom-contact.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(coach, /教练工作台/);
  assert.match(assistant, /Hermes Agent/);
  assert.match(deepseek, /deepseek-v4-flash/);
  assert.match(coach, /企业微信 AI Bot/);
  assert.match(tools, /get_member_by_id/);
  assert.match(contact, /externalcontact\/add_msg_template/);
  assert.match(contact, /发送任务已创建，请在企业微信客户端确认发送。/);
  assert.doesNotMatch(`${assistant}${contact}`, /notifications\/weixin|WECOM_WEBHOOK_URL/);
});

test("keeps mainland deployment and secret configuration documented", async () => {
  const [envExample, compose, readme] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(envExample, /DEEPSEEK_API_KEY/);
  assert.match(envExample, /HERMES_API_KEY/);
  assert.match(envExample, /WECOM_CONTACT_SECRET/);
  assert.match(envExample, /WECOM_ALLOWED_COACH_USERIDS/);
  assert.match(compose, /Asia\/Shanghai/);
  assert.match(readme, /ICP\s*备案/);
});

test("documents one Hermes instance and denies nickname-based member matching", async () => {
  const [readme, soul, tools] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../deployment/hermes-wecom-soul.md", import.meta.url), "utf8"),
    readFile(new URL("../server/hermes_tools_mcp.py", import.meta.url), "utf8"),
  ]);
  assert.match(readme, /唯一实例/);
  assert.match(readme, /不使用 OpenClaw、ClawBot、iLink/);
  assert.match(soul, /禁止用姓名、企业微信昵称、普通微信昵称/);
  assert.match(tools, /不得把任务创建或企业微信报告已发送表述为会员已收到/);
});

test("supports safe member self-registration and automatic sign-in", async () => {
  const [server, portal] = await Promise.all([
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(server, /\/api\/auth\/register/);
  assert.match(server, /role,password_hash,status\) VALUES \(\$1,\$2,\$3,'member'/);
  assert.match(server, /self_register/);
  assert.match(server, /issueSession\(response, \{ id, name, role: "member" \}, 201\)/);
  assert.match(portal, /还没有账号？立即注册/);
  assert.match(portal, /注册并进入平台/);
  assert.match(portal, /用户协议/);
});
