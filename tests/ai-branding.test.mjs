import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    return entry.isDirectory() ? collectFiles(url) : [url];
  }));
  return files.flat();
}

test("public website and health response hide model provider branding", async () => {
  const roots = [new URL("../app/", import.meta.url), new URL("../components/", import.meta.url)];
  const files = (await Promise.all(roots.map(collectFiles))).flat().filter((url) => /\.(?:tsx?|css)$/.test(url.pathname));
  const publicSource = (await Promise.all(files.map((url) => readFile(url, "utf8")))).join("\n");
  const server = await readFile(new URL("../server/index.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(publicSource, /deepseek/i);
  assert.doesNotMatch(server, /\bdeepseek\s*:/i);
  assert.match(server, /ai:\s*Boolean\(process\.env\.HERMES_API_URL/);
});
