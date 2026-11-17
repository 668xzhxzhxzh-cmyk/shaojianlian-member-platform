import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("coach customer archive is ownership-scoped and hides raw WeChat identifiers", async () => {
  const [server, workspace] = await Promise.all([
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../components/coach-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(server, /JOIN member_wecom_bindings b/);
  assert.match(server, /WHERE b\.coach_userid=\$1/);
  assert.match(server, /sanitizeConversationTurns/);
  assert.match(workspace, /AI 客服沟通记录/);
  assert.match(workspace, /\/api\/customer-conversations/);
  assert.doesNotMatch(workspace, /external_userid/);
});

test("coach schedule provides interactive list, week and month views on desktop and mobile", async () => {
  const [workspace, css] = await Promise.all([
    readFile(new URL("../components/coach-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /"list" \| "week" \| "month"/);
  assert.match(workspace, /coach-week-board/);
  assert.match(workspace, /coach-month-board/);
  assert.match(workspace, /openAdd\(date\)/);
  assert.match(workspace, /setSelectedSession\(booking\)/);
  assert.match(css, /\.coach-calendar-scroll/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns: repeat\(7,115px\)/);
});
