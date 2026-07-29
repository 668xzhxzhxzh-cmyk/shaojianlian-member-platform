import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the member portal without starter artifacts", async () => {
  const [page, portal, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fitness-portal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  assert.match(page, /FitnessPortal/);
  assert.match(portal, /邵教练专属会员平台/);
  assert.match(portal, /训练计划/);
  assert.doesNotMatch(`${page}${portal}${packageJson}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("includes coach approval, DeepSeek and official WeCom routes", async () => {
  const [coach, assistant, deepseek, wecom] = await Promise.all([
    readFile(new URL("../components/management-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/assistant-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/notifications/wecom/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(coach, /教练工作台/);
  assert.match(assistant, /Hermes Agent/);
  assert.match(deepseek, /deepseek-v4-flash/);
  assert.match(wecom, /qyapi\.weixin\.qq\.com/);
  assert.match(wecom, /仅允许企业微信官方 Webhook 地址/);
});

test("keeps mainland deployment and secret configuration documented", async () => {
  const [envExample, compose, readme] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(envExample, /DEEPSEEK_API_KEY/);
  assert.match(envExample, /WECOM_WEBHOOK_URL/);
  assert.match(compose, /Asia\/Shanghai/);
  assert.match(readme, /ICP\s*备案/);
});
