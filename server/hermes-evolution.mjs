import { createHash, randomUUID } from "node:crypto";

const CHINA_TIME_ZONE = "Asia/Shanghai";
const MAX_RULES = 8;

export function createHermesEvolutionService({ pool, modelReview = null, log = () => {} }) {
  let running = false;

  async function runDailyReview({ force = false, now = new Date() } = {}) {
    if (running) return { skipped: "already_running" };
    running = true;
    try {
      const reviewDate = chinaDate(now);
      if (!force) {
        const existing = await pool.query(
          "SELECT review_date FROM hermes_daily_reviews WHERE review_date=$1 LIMIT 1",
          [reviewDate],
        );
        if (existing.rows[0]) return { skipped: "already_reviewed", review_date: reviewDate };
      }

      const metrics = await collectMetrics(pool);
      const learnedRules = deriveLearnedRules(metrics);
      const repairProposals = deriveRepairProposals(metrics);
      let summary = deterministicSummary(metrics, learnedRules, repairProposals);

      if (modelReview) {
        try {
          const modelSummary = await modelReview({ reviewDate, metrics, learnedRules, repairProposals });
          if (String(modelSummary || "").trim()) summary = String(modelSummary).trim().slice(0, 1800);
        } catch (error) {
          log("warn", "Hermes daily model review failed; deterministic review stored", error);
        }
      }

      await pool.query(
        `INSERT INTO hermes_daily_reviews
           (review_date,metrics_json,summary,learned_rules,repair_proposals,status,updated_at)
         VALUES ($1,$2,$3,$4,$5,'active',NOW())
         ON CONFLICT (review_date) DO UPDATE
         SET metrics_json=EXCLUDED.metrics_json,
             summary=EXCLUDED.summary,
             learned_rules=EXCLUDED.learned_rules,
             repair_proposals=EXCLUDED.repair_proposals,
             status='active',
             updated_at=NOW()`,
        [reviewDate, metrics, summary, learnedRules, repairProposals],
      );

      for (const proposal of repairProposals) {
        const fingerprint = createHash("sha256")
          .update(`${proposal.category}:${proposal.evidence}`)
          .digest("hex")
          .slice(0, 32);
        await pool.query(
          `INSERT INTO hermes_runtime_incidents
             (id,fingerprint,category,evidence,status)
           SELECT $1,$2,$3,$4,$5
           WHERE NOT EXISTS (
             SELECT 1 FROM hermes_runtime_incidents
             WHERE fingerprint=$2 AND updated_at >= NOW() - INTERVAL '7 days'
           )`,
          [randomUUID(), fingerprint, proposal.category, proposal, proposal.auto_action === "adaptive_rule" ? "self_healed" : "proposal_ready"],
        );
      }

      return {
        review_date: reviewDate,
        summary,
        learned_rules: learnedRules,
        repair_proposals: repairProposals,
      };
    } finally {
      running = false;
    }
  }

  async function getLatestReview() {
    const result = await pool.query(
      `SELECT review_date,summary,learned_rules,repair_proposals,status,updated_at
       FROM hermes_daily_reviews
       WHERE status='active'
       ORDER BY review_date DESC
       LIMIT 1`,
    );
    return result.rows[0] || null;
  }

  async function promptContext() {
    const review = await getLatestReview();
    const rules = Array.isArray(review?.learned_rules) ? review.learned_rules.slice(0, MAX_RULES) : [];
    if (!rules.length) return "";
    return `\n每日复盘形成的当前行为规则：\n${rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}`;
  }

  return { getLatestReview, promptContext, runDailyReview };
}

export function scheduleHermesEvolution(service, { intervalMs = 60 * 60 * 1000, initialDelayMs = 45_000 } = {}) {
  const run = () => service.runDailyReview().catch(() => undefined);
  const initial = setTimeout(run, initialDelayMs);
  const interval = setInterval(run, intervalMs);
  initial.unref?.();
  interval.unref?.();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}

export function deriveLearnedRules(metrics) {
  const rules = [
    "对教练只呈现会员姓名、业务动作和结果；内部任务编号、会员编号、课程编号只保留在工具参数与审计日志中。",
    "参数齐全的低风险增改操作直接执行并核验网站；删除课程仅在指代不明确时追问一次。",
    "客户消息只有企业微信返回发送成功后才能显示已发送；永远不要把创建任务或教练确认写成会员已收到。",
    "回复优先使用一到三个短句，延续最近对话中已验证的会员与课程上下文。",
  ];
  if (countStatus(metrics.sendTasks, "failed_frequency_limit") > 0) {
    rules.push("遇到企业微信接收频率限制时，明确说明会员未收到，并使用下一发送窗口重试队列，禁止立即重复轰炸。 ");
  }
  if (Number(metrics.callbackFailures || 0) > 0) {
    rules.push("企业微信回调失败时先依据回调去重键和最近会话恢复上下文，再给教练一个简短可执行结果。 ");
  }
  if (Number(metrics.hermesFailures || 0) > 0) {
    rules.push("工具或网关错误必须记录可复现证据；已知运行时故障允许自动恢复，代码变更只能生成补丁并通过测试与发布门禁。 ");
  }
  return rules.slice(0, MAX_RULES).map((rule) => rule.trim());
}

export function deriveRepairProposals(metrics) {
  const proposals = [];
  if (countStatus(metrics.sendTasks, "failed_frequency_limit") > 0) {
    proposals.push({
      category: "wecom_frequency_limit",
      evidence: "过去 24 小时存在 failed_frequency_limit",
      proposed_remedy: "自动同步真实发送状态，并在下一可发送窗口创建新的待确认任务。",
      auto_action: "adaptive_rule",
    });
  }
  if (Number(metrics.callbackFailures || 0) > 0) {
    proposals.push({
      category: "wecom_callback_failure",
      evidence: `过去 24 小时回调失败 ${Number(metrics.callbackFailures)} 次`,
      proposed_remedy: "保留去重键和错误分类，生成回归测试后再发布修复。",
      auto_action: "requires_ci",
    });
  }
  if (Number(metrics.hermesFailures || 0) > 0) {
    proposals.push({
      category: "hermes_runtime_failure",
      evidence: `过去 24 小时 Hermes 相关失败 ${Number(metrics.hermesFailures)} 次`,
      proposed_remedy: "先运行健康探测与受控重启；若仍复现则生成代码修复提案和测试。",
      auto_action: "runtime_recovery_then_ci",
    });
  }
  return proposals;
}

async function collectMetrics(pool) {
  const [sendTasks, callbacks, audits] = await Promise.all([
    pool.query(
      `SELECT status,COUNT(*)::int AS count
       FROM wecom_send_tasks
       WHERE created_at >= NOW() - INTERVAL '24 hours'
          OR provider_updated_at >= NOW() - INTERVAL '24 hours'
       GROUP BY status`,
    ),
    pool.query(
      `SELECT status,COUNT(*)::int AS count
       FROM wecom_callback_messages
       WHERE updated_at >= NOW() - INTERVAL '24 hours'
       GROUP BY status`,
    ),
    pool.query(
      `SELECT action,COUNT(*)::int AS count
       FROM audit_log
       WHERE created_at >= NOW() - INTERVAL '24 hours'
         AND (action ILIKE '%failed%' OR action ILIKE '%error%' OR action ILIKE 'hermes_%')
       GROUP BY action`,
    ),
  ]);
  const callbackFailures = callbacks.rows
    .filter((row) => row.status === "failed")
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  const hermesFailures = audits.rows
    .filter((row) => /failed|error/i.test(row.action))
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  return {
    sendTasks: sendTasks.rows,
    callbacks: callbacks.rows,
    auditFailures: audits.rows,
    callbackFailures,
    hermesFailures,
    windowHours: 24,
  };
}

function deterministicSummary(metrics, rules, proposals) {
  const sent = countStatus(metrics.sendTasks, "wecom_reported_sent");
  const limited = countStatus(metrics.sendTasks, "failed_frequency_limit");
  return `每日复盘完成：企业微信报告发送成功 ${sent} 条，受接收频率限制 ${limited} 条，回调失败 ${Number(metrics.callbackFailures || 0)} 次，Hermes 相关失败 ${Number(metrics.hermesFailures || 0)} 次。已更新 ${rules.length} 条行为规则，形成 ${proposals.length} 条修复提案；运行时问题可自动恢复，代码修改必须经过测试、CI 和候选发布。`;
}

function countStatus(rows, status) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.status === status)
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
}

function chinaDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
