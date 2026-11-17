import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Hermes chat follows streaming replies without hijacking history review", async () => {
  const assistant = await readFile(new URL("../components/assistant-view.tsx", import.meta.url), "utf8");

  assert.match(assistant, /chatMessagesRef/);
  assert.match(assistant, /element\.scrollTo\(\{ top: element\.scrollHeight, behavior \}\)/);
  assert.match(assistant, /scrollHeight - element\.scrollTop - element\.clientHeight <= 64/);
  assert.match(assistant, /followLatestRef\.current = true/);
  assert.match(assistant, /busy \? "auto" : "smooth"/);
  assert.match(assistant, /aria-live="polite"/);
  assert.doesNotMatch(assistant, /scrollIntoView/);
  assert.match(assistant, /\/api\/agent\/conversations\?member_id=/);
  assert.match(assistant, /openHistoryItem/);
  assert.doesNotMatch(assistant, /今天 10:32 · 李明恢复分析/);
});

test("Hermes chat remains stable when the mobile keyboard opens", async () => {
  const [css, layout] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(css, /\.assistant-grid > \*, \.chat-panel, \.suggestion-column, \.evidence-column \{ min-width: 0; \}/);
  assert.match(css, /@media \(max-width: 1600px\) and \(min-width: 1101px\)[\s\S]*\.assistant-grid/);
  assert.match(css, /\.chat-messages \{[^}]*overflow-x: hidden;[^}]*overscroll-behavior: contain;/s);
  assert.match(css, /\.chat-panel \{ min-height: 0; height: clamp\(540px,72svh,660px\); overflow: hidden; \}/);
  assert.match(css, /\.chat-input textarea \{ min-height: 72px; font-size: 16px;/);
  assert.match(css, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(layout, /interactiveWidget: "resizes-content"/);
});
