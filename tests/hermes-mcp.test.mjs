import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../server/hermes_tools_mcp.py", import.meta.url),
  "utf8",
);

test("Hermes MCP tools bind the only authorized coach server-side", () => {
  assert.match(source, /def _verified_coach_userid\(\) -> str:/);
  assert.match(source, /if len\(ALLOWED_COACHES\) != 1:/);
  assert.doesNotMatch(
    source,
    /def (?:get_member_by_id|list_customer_ids|create_member_binding_qr|bind_member_external_userid|create_member_message_draft|confirm_customer_send_task|get_customer_send_task_status)\([^)]*coach_userid/s,
  );
  assert.match(source, /def create_member_binding_qr\(member_id: str\)/);
  assert.match(source, /禁止按昵称匹配/);
});
