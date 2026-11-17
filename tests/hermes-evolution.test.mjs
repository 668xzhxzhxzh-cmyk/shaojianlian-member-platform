import assert from "node:assert/strict";
import test from "node:test";
import { createHermesEvolutionService, deriveLearnedRules, deriveRepairProposals } from "../server/hermes-evolution.mjs";

test("daily evolution learns delivery truthfulness and privacy rules", () => {
  const metrics = {
    sendTasks: [{ status: "failed_frequency_limit", count: 2 }],
    callbackFailures: 1,
    hermesFailures: 1,
  };
  const rules = deriveLearnedRules(metrics);
  const proposals = deriveRepairProposals(metrics);
  assert.ok(rules.some((rule) => /内部任务编号/.test(rule)));
  assert.ok(rules.some((rule) => /频率限制/.test(rule)));
  assert.ok(rules.some((rule) => /代码变更/.test(rule)));
  assert.ok(proposals.some((proposal) => proposal.category === "wecom_frequency_limit" && proposal.auto_action === "adaptive_rule"));
  assert.ok(proposals.some((proposal) => proposal.auto_action === "requires_ci"));
});

test("daily evolution persists one review and reuses learned rules in prompts", async () => {
  let storedReview = null;
  const pool = {
    async query(sql, params = []) {
      if (/SELECT review_date FROM hermes_daily_reviews/.test(sql)) return { rows: storedReview ? [{ review_date: storedReview.review_date }] : [] };
      if (/FROM wecom_send_tasks/.test(sql)) return { rows: [{ status: "failed_frequency_limit", count: 1 }] };
      if (/FROM wecom_callback_messages/.test(sql)) return { rows: [] };
      if (/FROM audit_log/.test(sql)) return { rows: [] };
      if (/INSERT INTO hermes_daily_reviews/.test(sql)) {
        storedReview = { review_date: params[0], summary: params[2], learned_rules: params[3], repair_proposals: params[4], status: "active" };
        return { rows: [] };
      }
      if (/INSERT INTO hermes_runtime_incidents/.test(sql)) return { rows: [] };
      if (/SELECT review_date,summary,learned_rules/.test(sql)) return { rows: storedReview ? [storedReview] : [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = createHermesEvolutionService({ pool });
  const review = await service.runDailyReview({ now: new Date("2026-08-02T12:00:00.000Z") });
  assert.equal(review.review_date, "2026-08-02");
  assert.match(await service.promptContext(), /当前行为规则/);
  assert.deepEqual(await service.runDailyReview({ now: new Date("2026-08-02T13:00:00.000Z") }), {
    skipped: "already_reviewed",
    review_date: "2026-08-02",
  });
});
