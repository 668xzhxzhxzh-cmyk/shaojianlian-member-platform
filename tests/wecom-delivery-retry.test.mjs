import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { nextChinaMorning } from "../server/wecom-contact.mjs";

test("frequency limited messages retry at the next 09:00 China window", () => {
  const retryAt = nextChinaMorning(new Date("2026-08-02T07:10:00.000Z"));
  assert.equal(retryAt.toISOString(), "2026-08-03T01:00:00.000Z");
});

test("delivery reconciliation never equates task creation or sending with member read", async () => {
  const source = await readFile(new URL("../server/wecom-contact.mjs", import.meta.url), "utf8");
  assert.match(source, /member_received: providerStatus === 1/);
  assert.match(source, /member_read: false/);
  assert.match(source, /failed_frequency_limit/);
  assert.match(source, /next_retry_at/);
  assert.match(source, /发送任务已创建，请在企业微信客户端确认发送/);
});
