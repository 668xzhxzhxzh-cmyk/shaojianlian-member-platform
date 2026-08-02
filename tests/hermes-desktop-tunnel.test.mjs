import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Hermes Desktop launcher uses the restricted production tunnel and watchdog", async () => {
  const source = await readFile(new URL("../scripts/start-hermes-desktop-tunnel.ps1", import.meta.url), "utf8");
  assert.match(source, /\.ssh\\hermes-desktop-tunnel/);
  assert.match(source, /\$connectionUser = "hermes"/);
  assert.match(source, /ensure-tunnel\.ps1/);
  assert.match(source, /ServerAliveInterval=15/);
  assert.match(source, /ExitOnForwardFailure=yes/);
  assert.doesNotMatch(source, /hermesdesktop|shao-hermes-desktop-v2/);
});
