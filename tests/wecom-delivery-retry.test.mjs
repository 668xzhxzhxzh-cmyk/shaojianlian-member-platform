import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  chinaDayStart,
  getWecomQuotaWindow,
  nextChinaMorning,
  normalizeWecomGroupSendRule,
} from "../server/wecom-contact.mjs";

test("frequency limited messages retry at the next 09:00 China window", () => {
  const retryAt = nextChinaMorning(new Date("2026-08-02T07:10:00.000Z"));
  assert.equal(retryAt.toISOString(), "2026-08-03T01:00:00.000Z");
});

test("frequency preflight uses the current China calendar day", () => {
  assert.equal(chinaDayStart(new Date("2026-08-03T04:00:00.000Z")).toISOString(), "2026-08-02T16:00:00.000Z");
});

test("monthly group-send rule allows the number of days in the China calendar month", () => {
  const august = getWecomQuotaWindow("monthly", new Date("2026-08-03T04:00:00.000Z"));
  assert.equal(august.limit, 31);
  assert.equal(august.windowStart.toISOString(), "2026-07-31T16:00:00.000Z");
  assert.equal(august.windowEnd.toISOString(), "2026-08-31T16:00:00.000Z");
  assert.equal(august.nextRetryAt.toISOString(), "2026-09-01T01:00:00.000Z");

  assert.equal(getWecomQuotaWindow("monthly", new Date("2028-02-10T00:00:00.000Z")).limit, 29);
  assert.equal(getWecomQuotaWindow("monthly", new Date("2027-02-10T00:00:00.000Z")).limit, 28);
  assert.equal(getWecomQuotaWindow("monthly", new Date("2026-04-10T00:00:00.000Z")).limit, 30);
});

test("weekly group-send rule starts on Monday in China", () => {
  const weekly = getWecomQuotaWindow("weekly", new Date("2026-08-05T04:00:00.000Z"));
  assert.equal(weekly.limit, 7);
  assert.equal(weekly.windowStart.toISOString(), "2026-08-02T16:00:00.000Z");
  assert.equal(weekly.windowEnd.toISOString(), "2026-08-09T16:00:00.000Z");
  assert.equal(weekly.nextRetryAt.toISOString(), "2026-08-10T01:00:00.000Z");
});

test("invalid group-send rule stays on the conservative daily policy", () => {
  assert.equal(normalizeWecomGroupSendRule("monthly"), "monthly");
  assert.equal(normalizeWecomGroupSendRule("unknown"), "daily");
  assert.equal(getWecomQuotaWindow("unknown", new Date("2026-08-03T04:00:00.000Z")).limit, 1);
});

test("delivery reconciliation never equates task creation or sending with member read", async () => {
  const source = await readFile(new URL("../server/wecom-contact.mjs", import.meta.url), "utf8");
  assert.match(source, /member_received: providerStatus === 1/);
  assert.match(source, /member_read: false/);
  assert.match(source, /failed_frequency_limit/);
  assert.match(source, /next_retry_at/);
  assert.match(source, /WECOM_GROUP_SEND_RULE/);
  assert.match(source, /发送任务已创建，请在企业微信客户端确认发送/);
});
