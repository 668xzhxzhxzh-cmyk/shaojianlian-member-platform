import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native WeCom cutover is secret-safe, rollback-capable and routes only the exact callback", async () => {
  const script = await readFile(new URL("../scripts/configure-wecom-native.py", import.meta.url), "utf8");
  assert.match(script, /getpass\.getpass/);
  assert.match(script, /WECOM_CALLBACK_CORP_ID/);
  assert.match(script, /WECOM_CALLBACK_ENCODING_AES_KEY/);
  assert.match(script, /WECOM_CALLBACK_ALLOWED_USERS/);
  assert.match(script, /toolsets\["wecom_callback"\] = \["shao-coach"\]/);
  assert.match(script, /location = \/api\/wecom\/callback/);
  assert.match(script, /proxy_pass http:\/\/127\.0\.0\.1:\{CALLBACK_PORT\}\{CALLBACK_PATH\}/);
  assert.match(script, /externalcontact\/get_follow_user_list/);
  assert.match(script, /native_callback_roundtrip/);
  assert.match(script, /shutil\.copy2\(backup, path\)/);
  assert.doesNotMatch(script, /print\([^\n]*(secret|access_token|callback_aes|callback_token)/i);
});

test("native cutover keeps the old bot channel disabled", async () => {
  const [script, config, packager, verifier] = await Promise.all([
    readFile(new URL("../scripts/configure-wecom-native.py", import.meta.url), "utf8"),
    readFile(new URL("../deployment/hermes-wecom-mcp.example.yaml", import.meta.url), "utf8"),
    readFile(new URL("../scripts/package-production.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-release-archive.sh", import.meta.url), "utf8"),
  ]);
  assert.match(script, /platforms\.pop\("wecom", None\)/);
  assert.match(script, /toolsets\.pop\("wecom", None\)/);
  assert.doesNotMatch(config, /^\s{2}wecom:/m);
  assert.match(packager, /configure-wecom-native\.py/);
  assert.match(verifier, /configure-wecom-native\.py/);
});
