import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import pg from "pg";
import { createWecomContactService } from "./wecom-contact.mjs";
import { createWecomCallbackService } from "./wecom-callback.mjs";
import { createWecomAppService } from "./wecom-app.mjs";
import { createWecomCustomerService } from "./wecom-kf.mjs";
import { createHermesCustomerReplyService, createHermesVisionService } from "./hermes-vision.mjs";
import { createHermesCommandRouter } from "./hermes-command-router.mjs";
import { createHermesEvolutionService, scheduleHermesEvolution } from "./hermes-evolution.mjs";
import { createCourseReminderService } from "./course-reminders.mjs";
import { compactWecomHermesReply, resolveWecomMemberContext } from "./wecom-agent.mjs";
import { redactConversationText } from "../lib/public-conversation-text.mjs";
import {
  createWecomConversationStore,
  isContextualFollowUp,
  isCourseReference,
} from "./wecom-conversation.mjs";
import {
  clearSessionCookies,
  requestedSessionRole,
  sessionCookie,
  sessionTokenForRole,
} from "./session-cookies.mjs";

const { Pool } = pg;
const port = Number(process.env.API_PORT || 8788);
const host = process.env.API_HOST || "0.0.0.0";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sessionSecret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "replace-this-before-production",
);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "";
const cookieSecure = String(process.env.COOKIE_SECURE || "true").toLowerCase() !== "false";

const seedState = {
  profile: { id: "member-li", name: "李明", phone: "138****5206", plan: "尊享会员 · 年度计划", expiresAt: "2027/07/10", coach: "邵教练", level: "VIP" },
  bodyMetrics: [
    { id: "m1", date: "07/08", weight: 70.8, bodyFat: 16.1, muscle: 33.8, waist: 82.1 },
    { id: "m2", date: "07/11", weight: 70.3, bodyFat: 15.8, muscle: 34.0, waist: 81.7 },
    { id: "m3", date: "07/14", weight: 69.8, bodyFat: 15.5, muscle: 34.2, waist: 81.2 },
    { id: "m4", date: "07/17", weight: 69.2, bodyFat: 15.1, muscle: 34.6, waist: 80.6 },
    { id: "m5", date: "07/20", weight: 68.9, bodyFat: 14.9, muscle: 34.8, waist: 80.1 },
    { id: "m6", date: "07/23", weight: 68.5, bodyFat: 14.6, muscle: 35.0, waist: 79.8 },
    { id: "m7", date: "07/26", weight: 68.2, bodyFat: 14.4, muscle: 35.2, waist: 79.4 },
    { id: "m8", date: "07/29", weight: 67.9, bodyFat: 14.2, muscle: 35.4, waist: 79.0 },
  ],
  meals: [
    { id: "meal-1", type: "早餐", time: "07:30", food: "燕麦粥 + 鸡蛋 + 牛奶 + 蓝莓", calories: 450, protein: 28, completed: true },
    { id: "meal-2", type: "午餐", time: "12:30", food: "糙米饭 + 鸡胸肉 + 西兰花", calories: 550, protein: 46, completed: true },
    { id: "meal-3", type: "加餐", time: "16:00", food: "香蕉 + 无糖酸奶", calories: 200, protein: 12, completed: false },
    { id: "meal-4", type: "晚餐", time: "19:00", food: "三文鱼 + 藜麦 + 菠菜沙拉", calories: 400, protein: 38, completed: false },
  ],
  waterMl: 1800,
  checkinDates: ["07/23", "07/24", "07/25", "07/26", "07/27", "07/28"],
  streak: 18,
  bookings: [
    { id: "b1", day: "周一", date: "7/27", time: "09:00–10:00", title: "一对一私教", coach: "邵教练", status: "已完成" },
    { id: "b2", day: "周二", date: "7/28", time: "11:00–12:00", title: "一对一私教", coach: "邵教练", status: "已完成" },
    { id: "b3", day: "周三", date: "7/29", time: "10:00–11:00", title: "一对一私教", coach: "邵教练", status: "已预约" },
    { id: "b4", day: "周四", date: "7/30", time: "14:00–15:00", title: "一对一私教", coach: "邵教练", status: "待确认" },
    { id: "b5", day: "周五", date: "7/31", time: "18:00–19:00", title: "一对一私教", coach: "邵教练", status: "可预约" },
    { id: "b6", day: "周六", date: "8/1", time: "16:00–17:00", title: "一对一私教", coach: "邵教练", status: "可预约" },
    { id: "b7", day: "周日", date: "8/2", time: "10:00–11:00", title: "一对一私教", coach: "邵教练", status: "可预约" },
  ],
  suggestions: [
    { id: "s1", member: "李明", avatar: "李", title: "减脂专项调整", category: "训练调整", content: "近 7 天训练完成率下降，建议将上肢推举强度下调 10%，保持下肢训练强度，并安排一次肩部放松评估。", status: "待确认", priority: "重要" },
    { id: "s2", member: "王芳", avatar: "王", title: "体态改善跟进", category: "恢复提醒", content: "近期久坐时间增加，建议本周加入两次胸椎活动与髋屈肌拉伸，每次 12 分钟。", status: "待确认", priority: "普通" },
    { id: "s3", member: "张伟", avatar: "张", title: "增肌饮食优化", category: "饮食建议", content: "蛋白质日均缺口约 22g，建议训练后增加一份低脂奶与鸡蛋，晚餐主食增加 30g。", status: "草稿", priority: "普通" },
  ],
  trainingPlan: {
    phase: "第 3 周", goal: "体脂降至 15%", frequency: 3, focus: "下肢力量、核心稳定、动作质量",
    note: "动作质量优先，训练中保持 RPE 7–8。", updatedAt: "2026-07-29",
    days: [
      { id: "day-1", title: "下肢力量与髋稳定", duration: "70 分钟", exercises: ["高脚杯深蹲 · 4×10", "罗马尼亚硬拉 · 4×10", "死虫式 · 3×12"] },
      { id: "day-2", title: "上肢拉力与肩胛控制", duration: "65 分钟", exercises: ["高位下拉 · 4×10", "坐姿划船 · 4×12", "面拉 · 3×15"] },
    ],
  },
  nutritionPlan: {
    calories: 1800, protein: 120, carbs: 180, fat: 60,
    reminder: "训练日前后优先保证碳水；鄂州本地饮食可保留清淡汤类。",
    updatedAt: "2026-07-29",
    meals: [
      { type: "早餐", time: "07:30", food: "燕麦粥、鸡蛋、无糖牛奶、蓝莓", calories: 450 },
      { type: "午餐", time: "12:30", food: "糙米饭、清蒸鱼、西兰花、菌菇", calories: 550 },
      { type: "加餐", time: "16:00", food: "香蕉、无糖酸奶", calories: 200 },
      { type: "晚餐", time: "19:00", food: "鸡胸肉、红薯、菠菜、豆腐", calories: 500 },
    ],
  },
  bodyFeedbacks: [
    { id: "feedback-1", date: "2026-07-29", summary: "本周体重和体脂下降节奏稳定，肌肉量保持良好。", nextFocus: "睡眠时长、膝部疼痛评分、训练后恢复", risk: "良好" },
  ],
};

const hermesPrompt = `你是邵教练的 Hermes 会员管理管家，具备 shao-coach MCP 工具。只使用系统已验证的精确 member_id；系统已给出时不得再次索要。参数齐全就调用最窄工具执行，参数不足只追问缺失项。

企业微信回复只写结果或一个必要问题，不寒暄、不解释规则、不列能力，最多 3 个短句、120 个汉字。训练、饮食、身体反馈等修改执行后核验网站状态。删除课程和涉及训练、饮食、伤痛、费用等教练决策的客户消息必须确认；课程提醒、预约确认、打卡、饮水、饮食记录和会员到期等已确定事实提醒可直接调用 create_member_message，不要求聊天内二次审批。企业微信客户联系任务仍需在客户端确认；未取得真实发送状态不得说会员已收到。不要向教练展示 task_id、member_id、session_id、UUID 或其他内部编号。不要声称没有工具，先检查 MCP。不做医疗诊断。`;

await initializeDatabase();
const wecomConversation = createWecomConversationStore({ pool });
const wecomContact = createWecomContactService({ pool });
const wecomApp = createWecomAppService();
const hermesVision = createHermesVisionService();
const hermesCustomerReply = createHermesCustomerReplyService();
const wecomCustomerService = createWecomCustomerService({
  pool,
  visionService: hermesVision,
  replyService: hermesCustomerReply,
  audit,
});
const courseReminders = createCourseReminderService({
  pool,
  queueRoutineMessage: (message) => wecomContact.createCustomerMessage(message),
  notifyCoach: (coachUserId, content) => wecomApp.sendText({ toUserId: coachUserId, content }),
});
const hermesEvolution = createHermesEvolutionService({
  pool,
  modelReview: requestHermesDailyModelReview,
  log: (level, message, error) => console[level === "warn" ? "warn" : "log"](JSON.stringify({
    level,
    message,
    detail: error ? String(error?.message || error).slice(0, 240) : undefined,
  })),
});
const hermesCommandRouter = createHermesCommandRouter({ wecomContact });
const wecomCoachQueues = new Map();
const wecomCallback = createWecomCallbackService({
  onMessage: async (message) => {
    await enqueueWecomCoachMessage(message);
  },
  onContactEvent: async (message) => {
    await wecomContact.handleContactEvent(message);
  },
  onCustomerServiceEvent: async (message) => {
    await wecomCustomerService.handleEvent(message);
  },
});

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  if (request.method === "OPTIONS") return finish(response, 204);
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (url.pathname === "/health") return json(response, 200, {
      ok: true,
      region: "ezhou",
      time: new Date().toISOString(),
      integrations: {
        ai: Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_KEY),
        hermes: Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_KEY),
        wecomContact: wecomContact.contactConfigured,
        wecomCallback: wecomCallback.callbackConfigured,
        wecomApp: wecomApp.appConfigured,
        wecomCustomerService: wecomCustomerService.configured && wecomCallback.callbackConfigured,
        hermesVision: hermesVision.configured,
        hermesMemberTools: wecomContact.toolsConfigured,
      },
    });
    if (url.pathname === "/api/wecom/callback") {
      return wecomCallback.handle(request, response, url).catch((error) => {
        const status = Number(error?.statusCode || 500);
        return json(response, status, {
          error: status < 500 ? error.message : "企业微信回调暂时不可用",
        });
      });
    }
    if (url.pathname === "/api/internal/hermes/tools" && request.method === "POST") {
      return wecomContact.handleInternalTool(request, response).catch((error) => {
        const status = Number(error?.statusCode || 500);
        return json(response, status, {
          error: status < 500 ? error.message : "AI 会员工具暂时不可用",
        });
      });
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, response);
    if (url.pathname === "/api/auth/register" && request.method === "POST") return register(request, response);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const role = requestedSessionRole(request);
      if (!role) return json(response, 400, { error: "退出入口无效" });
      response.setHeader("set-cookie", clearSessionCookies(role, { secure: cookieSecure }));
      return json(response, 200, { ok: true });
    }
    const session = await readSession(request);
    if (url.pathname === "/api/auth/me") return session ? json(response, 200, { user: session }) : json(response, 401, { error: "未登录" });
    if (!session) return json(response, 401, { error: "请先登录" });
    if (request.method !== "GET" && !sameOrigin(request)) return json(response, 403, { error: "请求来源无效" });

    if (url.pathname === "/api/data" && request.method === "GET") {
      const requestedMemberId = url.searchParams.get("member_id");
      const state = await readPortalState(session, requestedMemberId);
      if (!state) return json(response, 404, { error: "找不到该会员" });
      return json(response, 200, { state });
    }
    if (url.pathname === "/api/users" && request.method === "GET") return listUsers(response, session);
    if (url.pathname === "/api/users" && request.method === "POST") return createUser(request, response, session);
    if (url.pathname === "/api/users" && request.method === "PATCH") return updateUser(request, response, session);
    if (url.pathname === "/api/hermes/evolution" && request.method === "GET") {
      if (!["coach", "admin"].includes(session.role)) return json(response, 403, { error: "无权查看 Hermes 复盘" });
      return json(response, 200, { review: await hermesEvolution.getLatestReview() });
    }
    if (url.pathname === "/api/customer-conversations" && request.method === "GET") return listCustomerConversations(response, session, url);
    if (url.pathname === "/api/agent/conversations" && request.method === "GET") return listHermesWebConversations(response, session, url);
    if (url.pathname === "/api/actions" && request.method === "POST") return handleAction(request, response, session);
    if (url.pathname === "/api/agent/chat" && request.method === "POST") return handleHermes(request, response, session);
    return json(response, 404, { error: "接口不存在" });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", path: url.pathname, message: error instanceof Error ? error.message : String(error) }));
    return json(response, 500, { error: "服务器暂时无法处理请求" });
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: "info", message: `API listening on ${host}:${port}` }));
});

if (port === 8788) {
  scheduleHermesEvolution(hermesEvolution);
  let reconcilingWecomTasks = false;
  const reconcileWecomTasks = async () => {
    if (reconcilingWecomTasks) return;
    reconcilingWecomTasks = true;
    try {
      const result = await wecomContact.reconcileSendTasks({
        notifyCoach: (coachUserId, content) => wecomApp.sendText({ toUserId: coachUserId, content }),
      });
      if (result.checked || result.retries) {
        console.log(JSON.stringify({ level: "info", message: "WeCom send tasks reconciled", ...result }));
      }
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "WeCom send task reconciliation failed", detail: String(error?.message || error).slice(0, 240) }));
    } finally {
      reconcilingWecomTasks = false;
    }
  };
  const initialReconcile = setTimeout(() => void reconcileWecomTasks(), 20_000);
  const reconcileTimer = setInterval(() => void reconcileWecomTasks(), 120_000);
  const runCourseReminders = () => courseReminders.run().catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "Course reminder scan failed", detail: String(error?.message || error).slice(0, 240) }));
  });
  const initialCourseReminder = setTimeout(() => void runCourseReminders(), 30_000);
  const courseReminderTimer = setInterval(() => void runCourseReminders(), 120_000);
  const retryCustomerMessages = () => wecomCustomerService.retryFailedMessages().catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "WeCom customer message retry failed", detail: String(error?.message || error).slice(0, 240) }));
  });
  const initialCustomerRetry = setTimeout(() => void retryCustomerMessages(), 45_000);
  const customerRetryTimer = setInterval(() => void retryCustomerMessages(), 120_000);
  initialReconcile.unref();
  reconcileTimer.unref();
  initialCourseReminder.unref();
  courseReminderTimer.unref();
  initialCustomerRetry.unref();
  customerRetryTimer.unref();
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS portal_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY, actor_id TEXT NOT NULL, member_name TEXT NOT NULL, channel TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, provider_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS member_wecom_bindings (
      member_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      external_userid TEXT UNIQUE,
      coach_userid TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wecom_send_tasks (
      id UUID PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      external_userid TEXT NOT NULL,
      coach_userid TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      wecom_msgid TEXT,
      provider_message TEXT,
      retry_of UUID UNIQUE REFERENCES wecom_send_tasks(id) ON DELETE SET NULL,
      next_retry_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      message_kind TEXT NOT NULL DEFAULT 'coach_decision',
      approval_mode TEXT NOT NULL DEFAULT 'coach_required',
      source_key TEXT UNIQUE,
      scheduled_for TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      provider_updated_at TIMESTAMPTZ
    );
    ALTER TABLE wecom_send_tasks ADD COLUMN IF NOT EXISTS retry_of UUID REFERENCES wecom_send_tasks(id) ON DELETE SET NULL;
    ALTER TABLE wecom_send_tasks ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
    ALTER TABLE wecom_send_tasks ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE wecom_send_tasks ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'coach_decision';
    ALTER TABLE wecom_send_tasks ADD COLUMN IF NOT EXISTS approval_mode TEXT NOT NULL DEFAULT 'coach_required';
    ALTER TABLE wecom_send_tasks ADD COLUMN IF NOT EXISTS source_key TEXT;
    ALTER TABLE wecom_send_tasks ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS wecom_course_reminders (
      id UUID PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id TEXT NOT NULL,
      reminder_type TEXT NOT NULL,
      course_start TIMESTAMPTZ NOT NULL,
      send_task_id UUID REFERENCES wecom_send_tasks(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(member_id,booking_id,reminder_type,course_start)
    );
    CREATE TABLE IF NOT EXISTS wecom_binding_links (
      state_token TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_userid TEXT NOT NULL,
      config_id TEXT NOT NULL,
      qr_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      external_userid TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS wecom_callback_messages (
      dedupe_key TEXT PRIMARY KEY,
      msg_id TEXT,
      coach_userid TEXT NOT NULL,
      msg_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wecom_customer_messages (
      msg_id TEXT PRIMARY KEY,
      external_userid TEXT NOT NULL,
      open_kfid TEXT NOT NULL,
      msg_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      payload_json JSONB NOT NULL DEFAULT '{}',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error_message TEXT,
      next_retry_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wecom_customer_sync_state (
      open_kfid TEXT PRIMARY KEY,
      cursor TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wecom_customer_conversations (
      external_userid TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      turns_json JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wecom_coach_conversations (
      coach_userid TEXT PRIMARY KEY,
      member_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      session_id TEXT,
      pending_json JSONB,
      turns_json JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hermes_web_conversations (
      id UUID PRIMARY KEY,
      coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      turns_json JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hermes_daily_reviews (
      review_date DATE PRIMARY KEY,
      metrics_json JSONB NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL,
      learned_rules JSONB NOT NULL DEFAULT '[]',
      repair_proposals JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hermes_runtime_incidents (
      id UUID PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      category TEXT NOT NULL,
      evidence JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'observed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE wecom_coach_conversations ADD COLUMN IF NOT EXISTS pending_json JSONB;
    ALTER TABLE wecom_customer_messages ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE wecom_customer_messages ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE wecom_customer_messages ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
    ALTER TABLE wecom_customer_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
    UPDATE wecom_customer_messages
    SET status='replied',result='replied_before_context_failure',sent_at=COALESCE(sent_at,updated_at),
        error_message=NULL,next_retry_at=NULL,updated_at=NOW()
    WHERE status='failed' AND sent_at IS NULL
      AND error_message ~* '(invalid input syntax.*json|malformed array literal)';
    CREATE INDEX IF NOT EXISTS audit_log_actor_date_idx ON audit_log(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_status_date_idx ON notifications(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS member_wecom_bindings_coach_idx ON member_wecom_bindings(coach_userid, status);
    CREATE INDEX IF NOT EXISTS wecom_send_tasks_coach_status_idx ON wecom_send_tasks(coach_userid, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS wecom_send_tasks_retry_of_unique_idx ON wecom_send_tasks(retry_of) WHERE retry_of IS NOT NULL;
    CREATE INDEX IF NOT EXISTS wecom_send_tasks_retry_due_idx ON wecom_send_tasks(status, next_retry_at) WHERE next_retry_at IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS wecom_send_tasks_source_key_unique_idx ON wecom_send_tasks(source_key) WHERE source_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS wecom_course_reminders_status_start_idx ON wecom_course_reminders(status, course_start);
    CREATE INDEX IF NOT EXISTS wecom_binding_links_member_status_idx ON wecom_binding_links(member_id, coach_userid, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS wecom_callback_messages_coach_date_idx ON wecom_callback_messages(coach_userid, created_at DESC);
    CREATE INDEX IF NOT EXISTS wecom_customer_messages_external_date_idx ON wecom_customer_messages(external_userid, created_at DESC);
    CREATE INDEX IF NOT EXISTS wecom_customer_messages_retry_idx ON wecom_customer_messages(status, next_retry_at) WHERE next_retry_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS wecom_customer_conversations_member_idx ON wecom_customer_conversations(member_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS wecom_coach_conversations_updated_idx ON wecom_coach_conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS hermes_web_conversations_coach_member_idx ON hermes_web_conversations(coach_id,member_id,updated_at DESC);
    CREATE INDEX IF NOT EXISTS hermes_runtime_incidents_fingerprint_idx ON hermes_runtime_incidents(fingerprint, updated_at DESC);
  `);
  const accounts = [
    ["member-li", process.env.MEMBER_PHONE || "13800005206", "李明", "member", process.env.MEMBER_PASSWORD || "Member@2026"],
    ["coach-shao", process.env.COACH_PHONE || "13800006608", "邵教练", "coach", process.env.COACH_PASSWORD || "Coach@2026"],
    ["admin-shao", process.env.ADMIN_PHONE || "13800008808", "系统管理员", "admin", process.env.ADMIN_PASSWORD || "Admin@2026"],
  ];
  for (const [id, phone, name, role, password] of accounts) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (id, phone, name, role, password_hash)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE
       SET phone=EXCLUDED.phone,
           name=CASE WHEN EXCLUDED.role='member' THEN users.name ELSE EXCLUDED.name END,
           role=EXCLUDED.role,
           password_hash=EXCLUDED.password_hash`,
      [id, phone, name, role, hash],
    );
  }
  const defaultCoachUserId = soleAllowedCoachUserId();
  if (defaultCoachUserId) {
    await pool.query(
      `INSERT INTO member_wecom_bindings (member_id,external_userid,coach_userid,status,updated_at)
       SELECT id,NULL,$1,'active',NOW()
       FROM users
       WHERE role='member'
       ON CONFLICT (member_id) DO NOTHING`,
      [defaultCoachUserId],
    );
  }
  await pool.query("INSERT INTO portal_state (user_id, state_json) VALUES ('member-li',$1) ON CONFLICT (user_id) DO NOTHING", [seedState]);
}

function soleAllowedCoachUserId() {
  const coachUserIds = String(process.env.WECOM_ALLOWED_COACH_USERIDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return coachUserIds.length === 1 ? coachUserIds[0] : "";
}

async function login(request, response) {
  if (!sameOrigin(request)) return json(response, 403, { error: "请求来源无效" });
  const body = await readJson(request);
  const phone = String(body.phone || "").replace(/\s/g, "");
  const password = String(body.password || "");
  const expectedRole = String(body.expected_role || "");
  if (!["member", "coach", "admin"].includes(expectedRole)) return json(response, 400, { error: "登录入口无效，请从对应角色入口重新登录" });
  if (!/^1\d{10}$/.test(phone) || password.length < 8 || password.length > 128) return json(response, 400, { error: "手机号或密码格式不正确" });
  const result = await pool.query("SELECT id,name,role,password_hash,status FROM users WHERE phone=$1 LIMIT 1", [phone]);
  const user = result.rows[0];
  const valid = user && user.status === "active" && await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return json(response, 401, { error: "手机号或密码错误" });
  }
  if (user.role !== expectedRole) {
    await audit(user.id, "login_role_mismatch", { expectedRole, actualRole: user.role });
    const roleNames = { member: "会员端", coach: "教练端", admin: "管理端" };
    return json(response, 403, { error: `该账号属于${roleNames[user.role]}，请从正确入口登录` });
  }
  return issueSession(response, user);
}

async function register(request, response) {
  if (!sameOrigin(request)) return json(response, 403, { error: "请求来源无效" });
  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").replace(/\s/g, "");
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const acceptedTerms = body.acceptedTerms === true;

  if (name.length < 2 || name.length > 30) return json(response, 400, { error: "姓名需为 2–30 个字符" });
  if (!/^1[3-9]\d{9}$/.test(phone)) return json(response, 400, { error: "请输入正确的中国内地手机号" });
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return json(response, 400, { error: "密码需为 8–128 位，并同时包含字母和数字" });
  }
  if (password !== confirmPassword) return json(response, 400, { error: "两次输入的密码不一致" });
  if (!acceptedTerms) return json(response, 400, { error: "请先阅读并同意用户协议与隐私政策" });

  const id = `member-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(password, 12);
  const memberState = createMemberState({ id, name, phone });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO users (id,phone,name,role,password_hash,status) VALUES ($1,$2,$3,'member',$4,'active')",
      [id, phone, name, passwordHash],
    );
    await client.query("INSERT INTO portal_state (user_id,state_json) VALUES ($1,$2)", [id, memberState]);
    const defaultCoachUserId = soleAllowedCoachUserId();
    if (defaultCoachUserId) {
      await client.query(
        `INSERT INTO member_wecom_bindings
           (member_id,external_userid,coach_userid,status,updated_at)
         VALUES ($1,NULL,$2,'active',NOW())`,
        [id, defaultCoachUserId],
      );
    }
    await client.query(
      "INSERT INTO audit_log (id,actor_id,action,detail) VALUES ($1,$2,'self_register',$3)",
      [randomUUID(), id, { channel: "website", role: "member" }],
    );
    await client.query("COMMIT");
    return issueSession(response, { id, name, role: "member" }, 201);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return json(response, 409, { error: "该手机号已注册，请直接登录" });
    throw error;
  } finally {
    client.release();
  }
}

function createMemberState({ id, name, phone }) {
  const state = structuredClone(seedState);
  state.profile = {
    id,
    name,
    phone: phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
    plan: "新会员 · 待教练建档",
    expiresAt: "待开通",
    coach: "邵教练",
    level: "会员",
  };
  state.bodyMetrics = [];
  state.meals = state.meals.map((meal) => ({ ...meal, completed: false }));
  state.waterMl = 0;
  state.checkinDates = [];
  state.streak = 0;
  state.bookings = state.bookings.map((booking) => ({
    ...booking,
    status: booking.status === "可预约" ? "可预约" : "待确认",
  }));
  state.suggestions = [{
    id: `onboarding-${randomUUID()}`,
    member: name,
    avatar: name.slice(0, 1),
    title: "完成首次会员建档",
    category: "训练调整",
    content: "欢迎加入邵教练专属会员平台。请先记录身体数据、训练目标与可训练时间，邵教练确认后会为你制定个性化计划。",
    status: "待确认",
    priority: "普通",
  }];
  return state;
}

async function issueSession(response, user, status = 200) {
  const token = await new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("12h").sign(sessionSecret);
  response.setHeader("set-cookie", sessionCookie(user.role, token, { secure: cookieSecure }));
  return json(response, status, { user: { id: user.id, name: user.name, role: user.role } });
}

async function readSession(request) {
  const requestedRole = requestedSessionRole(request);
  if (!requestedRole) return null;
  const token = sessionTokenForRole(request.headers.cookie, requestedRole);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret, { algorithms: ["HS256"] });
    if (payload.role !== requestedRole) return null;
    return { id: payload.sub, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

async function readPortalState(session, requestedMemberId = null) {
  const userId = session.role === "member" ? session.id : String(requestedMemberId || "member-li");
  if (session.role !== "member") {
    const member = await pool.query("SELECT id FROM users WHERE id=$1 AND role='member' AND status='active'", [userId]);
    if (!member.rows[0]) return null;
  }
  const result = await pool.query("SELECT state_json FROM portal_state WHERE user_id=$1", [userId]);
  return result.rows[0]?.state_json || (userId === "member-li" ? seedState : null);
}

async function writePortalState(userId, state) {
  await pool.query("INSERT INTO portal_state (user_id,state_json,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO UPDATE SET state_json=EXCLUDED.state_json,updated_at=NOW()", [userId, state]);
}

async function listUsers(response, session) {
  if (!["coach", "admin"].includes(session.role)) return json(response, 403, { error: "没有用户管理权限" });
  const result = session.role === "admin"
    ? await pool.query("SELECT id,name,phone,role,status,created_at FROM users ORDER BY created_at ASC LIMIT 500")
    : await pool.query("SELECT id,name,phone,role,status,created_at FROM users WHERE role='member' ORDER BY created_at ASC LIMIT 500");
  return json(response, 200, {
    users: result.rows.map((user) => ({
      ...user,
      phone: String(user.phone).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
    })),
  });
}

async function createUser(request, response, session) {
  if (!["coach", "admin"].includes(session.role)) return json(response, 403, { error: "没有用户管理权限" });
  const body = await readJson(request);
  const name = String(body.name || "").trim().slice(0, 30);
  const phone = String(body.phone || "").replace(/\s/g, "");
  const requestedRole = String(body.role || "member");
  const role = session.role === "admin" && ["member", "coach", "admin"].includes(requestedRole) ? requestedRole : "member";
  if (name.length < 2 || !/^1\d{10}$/.test(phone)) return json(response, 400, { error: "姓名或手机号格式不正确" });
  const temporaryPassword = `Shao@${randomBytes(5).toString("hex")}`;
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const id = `${role}-${randomUUID()}`;
  try {
    await pool.query(
      "INSERT INTO users (id,phone,name,role,password_hash,status) VALUES ($1,$2,$3,$4,$5,'active')",
      [id, phone, name, role, passwordHash],
    );
    if (role === "member") {
      const memberState = createMemberState({ id, name, phone });
      await pool.query("INSERT INTO portal_state (user_id,state_json) VALUES ($1,$2)", [id, memberState]);
      const defaultCoachUserId = soleAllowedCoachUserId();
      if (defaultCoachUserId) {
        await pool.query(
          `INSERT INTO member_wecom_bindings
             (member_id,external_userid,coach_userid,status,updated_at)
           VALUES ($1,NULL,$2,'active',NOW())`,
          [id, defaultCoachUserId],
        );
      }
    }
    await audit(session.id, "user_create", { id, role });
    return json(response, 201, { user: { id, name, role }, temporaryPassword });
  } catch (error) {
    if (error?.code === "23505") return json(response, 409, { error: "该手机号已存在" });
    throw error;
  }
}

async function handleAction(request, response, session) {
  const { action, payload = {} } = await readJson(request);
  const managementAction = String(action || "").startsWith("coach_");
  if (managementAction && session.role !== "coach") {
    return json(response, 403, { error: "仅教练可修改会员服务内容" });
  }
  const requestedMemberId = String(payload.member_id || "").trim();
  if (managementAction && !requestedMemberId) {
    return json(response, 400, { error: "必须提供精确 member_id" });
  }
  const userId = session.role === "member" ? session.id : (requestedMemberId || "member-li");
  const state = await readPortalState({ ...session, id: userId, role: "member" });
  if (!state) return json(response, 404, { error: "找不到该 member_id 对应的会员" });
  if (action === "water") state.waterMl = Math.min(3500, state.waterMl + Math.min(1000, Math.max(0, Number(payload.amount) || 0)));
  else if (action === "meal") {
    const meal = state.meals.find((item) => item.id === String(payload.id || ""));
    if (!meal) return json(response, 404, { error: "找不到用餐记录" });
    meal.completed = !meal.completed;
  } else if (action === "checkin") {
    const date = String(payload.date || "").slice(0, 10);
    if (date && !state.checkinDates.includes(date)) { state.checkinDates.push(date); state.streak += 1; }
  } else if (action === "body") {
    const metric = { id: String(payload.id || `metric-${Date.now()}`), date: String(payload.date || "").slice(0, 10), weight: Number(payload.weight), bodyFat: Number(payload.bodyFat), muscle: Number(payload.muscle), waist: Number(payload.waist) };
    if ([metric.weight, metric.bodyFat, metric.muscle, metric.waist].some((value) => !Number.isFinite(value))) return json(response, 400, { error: "身体数据不完整" });
    state.bodyMetrics.push(metric);
    state.bodyMetrics = state.bodyMetrics.slice(-90);
  } else if (action === "booking") {
    return json(response, 403, { error: "会员端不提供自行排课，课程由教练统一安排" });
  } else if (action === "coach_booking_add") {
    const booking = payload.booking && typeof payload.booking === "object" ? payload.booking : {};
    const normalized = {
      id: String(booking.id || `booking-${Date.now()}`).slice(0, 100),
      day: String(booking.day || "").slice(0, 10),
      date: String(booking.date || "").slice(0, 20),
      time: String(booking.time || "").slice(0, 30),
      title: "一对一私教",
      coach: "邵教练",
      focus: String(booking.focus || "一对一私教").slice(0, 120),
      status: ["已完成", "已预约", "待确认"].includes(String(booking.status)) ? String(booking.status) : "已预约",
    };
    if (!normalized.day || !normalized.date || !/^\d{2}:\d{2}[–-]\d{2}:\d{2}$/.test(normalized.time)) return json(response, 400, { error: "课程日期或时间无效" });
    state.bookings = [...(Array.isArray(state.bookings) ? state.bookings : []), normalized];
  } else if (action === "coach_booking_delete") {
    const id = String(payload.id || "");
    if (!state.bookings?.some((item) => item.id === id)) return json(response, 404, { error: "找不到该课程" });
    state.bookings = state.bookings.filter((item) => item.id !== id);
  } else if (action === "coach_training_plan") {
    if (!payload.plan || typeof payload.plan !== "object" || !Array.isArray(payload.plan.days)) return json(response, 400, { error: "训练方案格式无效" });
    state.trainingPlan = payload.plan;
  } else if (action === "coach_nutrition_plan") {
    if (!payload.plan || typeof payload.plan !== "object" || !Array.isArray(payload.plan.meals)) return json(response, 400, { error: "饮食方案格式无效" });
    state.nutritionPlan = payload.plan;
  } else if (action === "coach_body_feedback") {
    if (!payload.feedback || typeof payload.feedback !== "object") return json(response, 400, { error: "身体反馈格式无效" });
    state.bodyFeedbacks = [...(Array.isArray(state.bodyFeedbacks) ? state.bodyFeedbacks : []), payload.feedback].slice(-100);
  } else if (action === "coach_member_profile") {
    const next = payload.profile && typeof payload.profile === "object" ? payload.profile : {};
    const allowed = {};
    for (const key of ["plan", "expiresAt", "level"]) {
      if (typeof next[key] === "string" && next[key].trim()) allowed[key] = next[key].trim().slice(0, 120);
    }
    state.profile = { ...state.profile, ...allowed };
  } else if (action === "suggestion") {
    if (!["coach", "admin"].includes(session.role)) return json(response, 403, { error: "仅教练可确认建议" });
    const suggestion = state.suggestions.find((item) => item.id === String(payload.id || ""));
    if (!suggestion || !["已发送", "待确认", "草稿"].includes(String(payload.status))) return json(response, 400, { error: "建议状态无效" });
    suggestion.status = String(payload.status);
  } else return json(response, 400, { error: "不支持的操作" });
  await writePortalState(userId, state);
  await audit(session.id, action, payload);
  return json(response, 200, { ok: true, state });
}

async function listCustomerConversations(response, session, url) {
  if (session.role !== "coach") return json(response, 403, { error: "仅教练可查看会员客服记录" });
  const coachUserId = soleAllowedCoachUserId();
  if (!coachUserId) return json(response, 503, { error: "教练企业微信账号尚未完成唯一配置" });
  const memberId = String(url.searchParams.get("member_id") || "").trim();
  const params = [coachUserId];
  const memberFilter = memberId ? "AND c.member_id=$2" : "";
  if (memberId) params.push(memberId);
  const result = await pool.query(
    `SELECT c.member_id,u.name,c.turns_json,c.updated_at
     FROM wecom_customer_conversations c
     JOIN users u ON u.id=c.member_id AND u.role='member'
     JOIN member_wecom_bindings b ON b.member_id=c.member_id
       AND b.external_userid=c.external_userid AND b.status='active'
     WHERE b.coach_userid=$1 ${memberFilter}
     ORDER BY c.updated_at DESC LIMIT 50`,
    params,
  );
  return json(response, 200, {
    conversations: result.rows.map((row) => ({
      memberId: row.member_id,
      memberName: row.name,
      updatedAt: row.updated_at,
      turns: sanitizeConversationTurns(row.turns_json, row.member_id),
    })),
  });
}

async function listHermesWebConversations(response, session, url) {
  if (session.role !== "coach") return json(response, 403, { error: "仅教练可查看 Hermes 历史" });
  const memberId = String(url.searchParams.get("member_id") || "").trim();
  const params = [session.id];
  const memberFilter = memberId ? "AND h.member_id=$2" : "";
  if (memberId) params.push(memberId);
  const result = await pool.query(
    `SELECT h.id,h.member_id,u.name AS member_name,h.title,h.turns_json,h.updated_at
     FROM hermes_web_conversations h
     JOIN users u ON u.id=h.member_id AND u.role='member' AND u.status='active'
     WHERE h.coach_id=$1 ${memberFilter}
     ORDER BY h.updated_at DESC LIMIT 20`,
    params,
  );
  return json(response, 200, {
    conversations: result.rows.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      memberName: row.member_name,
      title: row.title,
      updatedAt: row.updated_at,
      turns: sanitizeConversationTurns(row.turns_json, row.member_id),
    })),
  });
}

async function handleHermes(request, response, session) {
  if (session.role !== "coach") {
    await audit(session.id, "hermes_chat_denied", { role: session.role });
    return json(response, 403, { error: "Hermes AI 助理仅供教练账号使用" });
  }
  const body = await readJson(request);
  const memberId = String(body.member_id || "").trim();
  if (!memberId) return json(response, 400, { error: "必须提供 member_id，禁止根据昵称猜测会员" });
  const memberState = await readPortalState(session, memberId);
  if (!memberState) return json(response, 404, { error: "找不到该 member_id 对应的会员" });
  const messages = Array.isArray(body.messages) ? body.messages.slice(-10).filter((item) => ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.length <= 1600) : [];
  if (!messages.length) return json(response, 400, { error: "请输入问题" });
  if (!process.env.HERMES_API_URL || !process.env.HERMES_API_KEY) return json(response, 503, { error: "AI 服务尚未配置" });

  let hermesApi;
  try {
    hermesApi = new URL(process.env.HERMES_API_URL);
  } catch {
    return json(response, 500, { error: "AI 服务地址无效" });
  }
  const allowedHosts = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
  if (!["http:", "https:"].includes(hermesApi.protocol) || !allowedHosts.has(hermesApi.hostname)) {
    return json(response, 500, { error: "AI 服务必须使用服务器私有回环地址" });
  }
  const evolutionContext = await hermesEvolution.promptContext();
  const requestedConversationId = String(body.conversation_id || "").trim();
  let conversationId = requestedConversationId;
  if (conversationId) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(conversationId)) return json(response, 400, { error: "对话标识无效" });
    const owned = await pool.query(
      "SELECT id FROM hermes_web_conversations WHERE id=$1 AND coach_id=$2 AND member_id=$3",
      [conversationId, session.id, memberId],
    );
    if (!owned.rows[0]) return json(response, 404, { error: "找不到该历史对话" });
  } else {
    conversationId = randomUUID();
  }
  const currentQuestion = [...messages].reverse().find((item) => item.role === "user")?.content || "";
  const relevantState = selectCoachHermesState(memberState, currentQuestion);

  const upstream = await fetch(new URL("/v1/chat/completions", hermesApi), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.HERMES_API_KEY}`,
      "content-type": "application/json",
      "x-hermes-session-key": `shao-platform:${session.id}:${conversationId}`,
    },
    body: JSON.stringify({
      model: "hermes-agent",
      stream: true,
      messages: [{ role: "system", content: `${hermesPrompt}${evolutionContext}` }, { role: "system", content: `当前操作对象是精确 member_id=${memberId}。以下只提供与当前问题相关的网站最新数据；需要其他数据时调用 MCP 查询，修改后核验网站：${JSON.stringify(relevantState).slice(0, 8000)}` }, ...messages],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!upstream.ok || !upstream.body) {
    console.error(JSON.stringify({ level: "error", integration: "hermes", status: upstream.status }));
    return json(response, 502, { error: "AI 智能体暂时不可用" });
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no", "x-conversation-id": conversationId });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantReply = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const content = JSON.parse(data).choices?.[0]?.delta?.content;
        if (content) {
          assistantReply += content;
          response.write(content);
        }
      } catch {}
    }
  }
  const storedTurns = [...messages, { role: "assistant", content: assistantReply }]
    .slice(-12)
    .map((turn) => ({ role: turn.role, content: String(turn.content || "").slice(0, 1600) }));
  const firstQuestion = storedTurns.find((turn) => turn.role === "user")?.content || "Hermes 对话";
  await pool.query(
    `INSERT INTO hermes_web_conversations (id,coach_id,member_id,title,turns_json,updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,turns_json=EXCLUDED.turns_json,updated_at=NOW()`,
    [conversationId, session.id, memberId, Array.from(firstQuestion).slice(0, 32).join(""), JSON.stringify(storedTurns)],
  ).catch((error) => console.error(JSON.stringify({ level: "error", integration: "hermes-history", message: String(error?.message || error).slice(0, 160) })));
  response.end();
  await audit(session.id, "hermes_chat", { memberId, messageCount: messages.length });
}

function sanitizeConversationTurns(value, memberId) {
  return (Array.isArray(value) ? value : []).slice(-12).flatMap((turn) => {
    const role = turn?.role === "assistant" ? "assistant" : turn?.role === "user" ? "user" : "";
    const content = redactConversationText(String(turn?.content || "").slice(0, 1800), { memberIds: [memberId] });
    return role && content ? [{ role, content }] : [];
  });
}

function selectCoachHermesState(state, question) {
  const text = String(question || "");
  const result = { member: state.profile };
  if (/课|排期|预约|删除|时间/.test(text)) result.bookings = state.bookings?.slice(-10) || [];
  if (/训练|动作|方案|恢复|疼|痛/.test(text)) {
    result.trainingPlan = state.trainingPlan;
    result.bodyMetrics = state.bodyMetrics?.slice(-4) || [];
    result.bodyFeedbacks = state.bodyFeedbacks?.slice(-3) || [];
  }
  if (/饮食|餐|热量|蛋白|碳水/.test(text)) {
    result.nutritionPlan = state.nutritionPlan;
    result.meals = state.meals?.slice(-4) || [];
    result.bodyMetrics = state.bodyMetrics?.slice(-3) || [];
  }
  if (/完整|档案|全部/.test(text)) {
    result.bookings = state.bookings?.slice(-8) || [];
    result.trainingPlan = state.trainingPlan;
    result.nutritionPlan = state.nutritionPlan;
    result.bodyMetrics = state.bodyMetrics?.slice(-4) || [];
    result.bodyFeedbacks = state.bodyFeedbacks?.slice(-3) || [];
  }
  return result;
}

async function handleWecomCoachMessage(message) {
  const startedAt = Date.now();
  const coachUserId = String(message.fromUserName || "").trim();
  const dedupeKey = String(message.msgId || "").trim() || createHash("sha256")
    .update([coachUserId, message.createTime, message.msgType, message.event, message.content].join("\u0000"), "utf8")
    .digest("hex");
  const claimed = await pool.query(
    `INSERT INTO wecom_callback_messages (dedupe_key,msg_id,coach_userid,msg_type,status)
     VALUES ($1,$2,$3,$4,'processing')
     ON CONFLICT (dedupe_key) DO UPDATE SET status='processing',error_message=NULL,updated_at=NOW()
     WHERE wecom_callback_messages.status='failed'
     RETURNING dedupe_key`,
    [dedupeKey, String(message.msgId || "") || null, coachUserId, String(message.msgType || "unknown")],
  );
  if (!claimed.rows[0]) return;

  await audit(coachUserId, "wecom_callback_received", {
    msgType: message.msgType,
    event: message.event,
    agentId: message.agentId,
    msgId: message.msgId,
    contentLength: message.content.length,
  });

  try {
    const result = message.msgType === "text" && message.content
      ? await requestHermesWecomReply(message)
      : { reply: "目前仅支持文字指令。请发送文字任务。" };
    const compactReply = compactWecomHermesReply(result.reply, undefined, {
      memberIds: result.memberId ? [result.memberId] : [],
    });
    await wecomApp.sendText({ toUserId: coachUserId, content: compactReply });
    if (result.content) {
      const sessionId = await resolveConversationSessionId({
        memberId: result.memberId,
        previousSessionId: result.sessionId || result.previousSessionId,
        content: result.content,
        reply: compactReply,
      });
      await wecomConversation.saveTurn({
        coachUserId,
        memberId: result.memberId,
        sessionId,
        pendingAction: result.pendingAction,
        clearPending: result.clearPending,
        clearSession: result.clearSession,
        userContent: result.content,
        assistantContent: compactReply,
      });
    }
    await pool.query(
      "UPDATE wecom_callback_messages SET status='replied',updated_at=NOW() WHERE dedupe_key=$1",
      [dedupeKey],
    );
    await audit(coachUserId, "wecom_callback_replied", {
      msgId: message.msgId,
      replyLength: compactReply.length,
      route: result.fastPath || "hermes_model",
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 400) : "企业微信消息处理失败";
    await pool.query(
      "UPDATE wecom_callback_messages SET status='failed',error_message=$2,updated_at=NOW() WHERE dedupe_key=$1",
      [dedupeKey, safeMessage],
    );
    await audit(coachUserId, "wecom_callback_failed", { msgId: message.msgId, error: safeMessage });
    await wecomApp.sendText({
      toUserId: coachUserId,
      content: "这条指令处理失败了，请稍后重试；系统没有把失败操作当作已完成。",
    }).catch(() => {});
    throw error;
  }
}

function enqueueWecomCoachMessage(message) {
  const coachUserId = String(message.fromUserName || "").trim();
  const previous = wecomCoachQueues.get(coachUserId) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => handleWecomCoachMessage(message));
  wecomCoachQueues.set(coachUserId, current);
  return current.finally(() => {
    if (wecomCoachQueues.get(coachUserId) === current) wecomCoachQueues.delete(coachUserId);
  });
}

async function requestHermesWecomReply(message) {
  const content = String(message.content || "").trim().slice(0, 4000);
  const conversation = await wecomConversation.load(message.fromUserName);
  const useConversationMember = isContextualFollowUp(content);
  const resolvedMember = await resolveWecomMemberContext({
    pool,
    coachUserId: message.fromUserName,
    content,
    trustedMemberId: useConversationMember ? conversation.memberId : "",
    allowSoleBoundMember: useConversationMember,
  });
  if (resolvedMember.error) return {
    reply: resolvedMember.error,
    content,
    previousSessionId: conversation.sessionId,
  };
  const fastPath = await hermesCommandRouter.route({
    content,
    coachUserId: message.fromUserName,
    resolvedMember,
    conversation,
  });
  if (fastPath) return {
    ...fastPath,
    content,
    previousSessionId: conversation.sessionId,
  };

  if (!process.env.HERMES_API_URL || !process.env.HERMES_API_KEY) {
    throw new Error("Hermes API 尚未配置");
  }
  const hermesApi = new URL(process.env.HERMES_API_URL);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
  if (!["http:", "https:"].includes(hermesApi.protocol) || !allowedHosts.has(hermesApi.hostname)) {
    throw new Error("Hermes API 必须使用服务器私有回环地址");
  }
  const memberContext = resolvedMember.context;
  const recentSessionId = conversation.sessionId;
  const recentCourseContext = (isCourseReference(content) || /^确认删除/.test(content)) && recentSessionId
    ? `最近对话或当前唯一有效绑定中已验证的课程 session_id=${recentSessionId}。遇到“这节课/确认删除”等指代时先用 get_member_by_id 核验该课程；存在时直接使用，不要再次索要 member_id 或 session_id。`
    : "本条没有可引用的最近课程 session_id。";
  const evolutionContext = await hermesEvolution.promptContext();

  const upstream = await fetch(new URL("/v1/chat/completions", hermesApi), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.HERMES_API_KEY}`,
      "content-type": "application/json",
      "x-hermes-session-key": `shao-wecom-app:${message.fromUserName}`,
    },
    body: JSON.stringify({
      model: "hermes-agent",
      stream: true,
      temperature: 0.1,
      max_tokens: 480,
      messages: [
        { role: "system", content: `${hermesPrompt}${evolutionContext}` },
        { role: "system", content: `当前请求来自已通过企业微信签名、AES 解密和 userid 白名单验证的自建应用教练 userid=${message.fromUserName}。${memberContext}${recentCourseContext}` },
        ...conversation.turns,
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!upstream.ok || !upstream.body) throw new Error(`Hermes API 暂时不可用（status=${upstream.status}）`);

  const reply = await collectHermesReply(upstream.body);
  if (!reply.trim()) throw new Error("Hermes 未返回文字结果");
  return {
    reply: reply.trim(),
    content,
    memberId: resolvedMember.memberId,
    previousSessionId: recentSessionId,
  };
}

async function resolveConversationSessionId({ memberId, previousSessionId, content, reply }) {
  if (!memberId || (!isCourseReference(content) && !isCourseReference(reply))) {
    return previousSessionId || "";
  }
  const explicitSessionId = `${content}\n${reply}`.match(/\bsession_id\s*[=:：]\s*([A-Za-z0-9][A-Za-z0-9_-]{0,127})/i)?.[1];
  if (explicitSessionId) return explicitSessionId;
  return previousSessionId || "";
}

async function collectHermesReply(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) reply += delta;
      } catch {}
    }
  }
  return reply;
}

async function requestHermesDailyModelReview({ reviewDate, metrics, learnedRules, repairProposals }) {
  if (!process.env.HERMES_API_URL || !process.env.HERMES_API_KEY) return "";
  const hermesApi = new URL(process.env.HERMES_API_URL);
  if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(hermesApi.hostname)) return "";
  const upstream = await fetch(new URL("/v1/chat/completions", hermesApi), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.HERMES_API_KEY}`,
      "content-type": "application/json",
      "x-hermes-session-key": `shao-daily-review:${reviewDate}`,
    },
    body: JSON.stringify({
      model: "hermes-agent",
      stream: false,
      temperature: 0.1,
      max_tokens: 600,
      messages: [
        { role: "system", content: "你是只读的 Hermes 每日复盘器。根据结构化运行指标总结问题、已学习规则和受控修复建议。禁止调用工具、禁止修改数据库或代码、禁止编造发送成功；只输出 220 字以内中文摘要。" },
        { role: "user", content: JSON.stringify({ reviewDate, metrics, learnedRules, repairProposals }).slice(0, 12000) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!upstream.ok) throw new Error(`Hermes daily review failed (status=${upstream.status})`);
  const payload = await upstream.json();
  return String(payload?.choices?.[0]?.message?.content || "").trim();
}

async function updateUser(request, response, session) {
  if (session.role !== "admin") return json(response, 403, { error: "仅管理员可修改账户权限" });
  const body = await readJson(request);
  const id = String(body.id || "").trim();
  const role = String(body.role || "");
  const status = String(body.status || "");
  if (!id || !["member", "coach", "admin"].includes(role) || !["active", "disabled"].includes(status)) {
    return json(response, 400, { error: "账户参数无效" });
  }
  const result = await pool.query(
    "UPDATE users SET role=$2,status=$3 WHERE id=$1 RETURNING id,name,phone,role,status",
    [id, role, status],
  );
  if (!result.rows[0]) return json(response, 404, { error: "找不到该账户" });
  await audit(session.id, "user_update", { id, role, status });
  return json(response, 200, {
    user: {
      ...result.rows[0],
      phone: String(result.rows[0].phone).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
    },
  });
}

async function audit(actorId, action, detail) {
  await pool.query("INSERT INTO audit_log (id,actor_id,action,detail) VALUES ($1,$2,$3,$4)", [randomUUID(), actorId, action, detail]);
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (allowedOrigin) return origin === allowedOrigin;
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function setSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function json(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(data));
}
function finish(response, status) { response.writeHead(status); response.end(); }

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
