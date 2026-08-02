import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Hermes watchdog tolerates slow healthy responses before restarting", async () => {
  const source = await readFile(new URL("../scripts/hermes-desktop-watchdog.sh", import.meta.url), "utf8");
  assert.match(source, /api\/health/);
  assert.doesNotMatch(source, /api\/status/);
  assert.match(source, /--max-time 15/);
  assert.match(source, /failure_limit=4/);
  assert.match(source, /failures" -lt "\$failure_limit/);
});
