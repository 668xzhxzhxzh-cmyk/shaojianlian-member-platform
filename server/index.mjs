import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import pg from "pg";

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
    { id: "b1", day: "周一", date: "7/27", time: "10:00–11:00", title: "力量基础课", coach: "邵教练", status: "已完成" },
    { id: "b2", day: "周二", date: "7/28", time: "10:00–10:45", title: "HIIT 燃脂课", coach: "邵教练", status: "已完成" },
    { id: "b3", day: "周三", date: "7/29", time: "10:00–11:00", title: "下肢力量课", coach: "邵教练", status: "已预约" },
    { id: "b4", day: "周四", date: "7/30", time: "14:00–15:00", title: "功能训练", coach: "邵教练", status: "待确认" },
    { id: "b5", day: "周五", date: "7/31", time: "18:00–19:00", title: "核心强化课", coach: "邵教练", status: "可预约" },
    { id: "b6", day: "周六", date: "8/1", time: "18:00–19:00", title: "一对一私教", coach: "邵教练", status: "可预约" },
    { id: "b7", day: "周日", date: "8/2", time: "10:00–11:00", title: "伸展放松课", coach: "邵教练", status: "可预约" },
  ],
  suggestions: [
    { id: "s1", member: "李明", avatar: "李", title: "减脂专项调整", category: "训练调整", content: "近 7 天训练完成率下降，建议将上肢推举强度下调 10%，保持下肢训练强度，并安排一次肩部放松评估。", status: "待确认", priority: "重要" },
    { id: "s2", member: "王芳", avatar: "王", title: "体态改善跟进", category: "恢复提醒", content: "近期久坐时间增加，建议本周加入两次胸椎活动与髋屈肌拉伸，每次 12 分钟。", status: "待确认", priority: "普通" },
    { id: "s3", member: "张伟", avatar: "张", title: "增肌饮食优化", category: "饮食建议", content: "蛋白质日均缺口约 22g，建议训练后增加一份低脂奶与鸡蛋，晚餐主食增加 30g。", status: "草稿", priority: "普通" },
  ],
};

const hermesPrompt = `你是 Hermes，是邵教练专属会员平台中的智能健康助理。请用简洁中文，基于训练、饮食、睡眠和身体数据给出可执行建议。区分数据事实、合理推断和待教练确认事项；不做医疗诊断；持续疼痛、夜间痛、眩晕或胸闷应建议暂停训练并咨询合格医务人员；不要声称已经发送微信消息。`;

await initializeDatabase();

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  if (request.method === "OPTIONS") return finish(response, 204);
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (url.pathname === "/health") return json(response, 200, {
      ok: true,
      region: "wuhan",
      time: new Date().toISOString(),
      integrations: {
        deepseek: Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_KEY),
        hermes: Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_KEY),
        weixin: Boolean(process.env.WEIXIN_TARGET_ID),
      },
    });
    if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, response);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      response.setHeader("set-cookie", `shao_session=; Path=/; HttpOnly; ${cookieSecure ? "Secure; " : ""}SameSite=Strict; Max-Age=0`);
      return json(response, 200, { ok: true });
    }
    const session = await readSession(request);
    if (url.pathname === "/api/auth/me") return session ? json(response, 200, { user: session }) : json(response, 401, { error: "未登录" });
    if (!session) return json(response, 401, { error: "请先登录" });
    if (request.method !== "GET" && !sameOrigin(request)) return json(response, 403, { error: "请求来源无效" });

    if (url.pathname === "/api/data" && request.method === "GET") {
      const state = await readPortalState(session);
      return json(response, 200, { state });
    }
    if (url.pathname === "/api/users" && request.method === "GET") return listUsers(response, session);
    if (url.pathname === "/api/users" && request.method === "POST") return createUser(request, response, session);
    if (url.pathname === "/api/actions" && request.method === "POST") return handleAction(request, response, session);
    if (url.pathname === "/api/agent/chat" && request.method === "POST") return handleHermes(request, response, session);
    if (url.pathname === "/api/notifications/weixin" && request.method === "POST") {
      if (!["coach", "admin"].includes(session.role)) return json(response, 403, { error: "仅教练可发送会员消息" });
      return handleWeixin(request, response, session);
    }
    if (url.pathname === "/api/notifications/wecom" && request.method === "POST") {
      if (!["coach", "admin"].includes(session.role)) return json(response, 403, { error: "仅教练可发送会员消息" });
      return handleWecom(request, response, session);
    }
    return json(response, 404, { error: "接口不存在" });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", path: url.pathname, message: error instanceof Error ? error.message : String(error) }));
    return json(response, 500, { error: "服务器暂时无法处理请求" });
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: "info", message: `API listening on ${host}:${port}` }));
});

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
    CREATE INDEX IF NOT EXISTS audit_log_actor_date_idx ON audit_log(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_status_date_idx ON notifications(status, created_at DESC);
  `);
  const accounts = [
    ["member-li", process.env.MEMBER_PHONE || "13800005206", "李明", "member", process.env.MEMBER_PASSWORD || "Member@2026"],
    ["coach-shao", process.env.COACH_PHONE || "13800006608", "邵教练", "coach", process.env.COACH_PASSWORD || "Coach@2026"],
    ["admin-shao", process.env.ADMIN_PHONE || "13800008808", "系统管理员", "admin", process.env.ADMIN_PASSWORD || "Admin@2026"],
  ];
  for (const [id, phone, name, role, password] of accounts) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO users (id, phone, name, role, password_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET phone=EXCLUDED.phone,name=EXCLUDED.name,role=EXCLUDED.role,password_hash=EXCLUDED.password_hash",
      [id, phone, name, role, hash],
    );
  }
  await pool.query("INSERT INTO portal_state (user_id, state_json) VALUES ('member-li',$1) ON CONFLICT (user_id) DO NOTHING", [seedState]);
}

async function login(request, response) {
  if (!sameOrigin(request)) return json(response, 403, { error: "请求来源无效" });
  const body = await readJson(request);
  const phone = String(body.phone || "").replace(/\s/g, "");
  const password = String(body.password || "");
  if (!/^1\d{10}$/.test(phone) || password.length < 8 || password.length > 128) return json(response, 400, { error: "手机号或密码格式不正确" });
  const result = await pool.query("SELECT id,name,role,password_hash,status FROM users WHERE phone=$1 LIMIT 1", [phone]);
  const user = result.rows[0];
  const valid = user && user.status === "active" && await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return json(response, 401, { error: "手机号或密码错误" });
  }
  const token = await new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("12h").sign(sessionSecret);
  response.setHeader("set-cookie", `shao_session=${token}; Path=/; HttpOnly; ${cookieSecure ? "Secure; " : ""}SameSite=Strict; Max-Age=43200`);
  return json(response, 200, { user: { id: user.id, name: user.name, role: user.role } });
}

async function readSession(request) {
  const cookies = Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim().split(/=(.*)/s).slice(0, 2)));
  const token = cookies.shao_session;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret, { algorithms: ["HS256"] });
    return { id: payload.sub, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

async function readPortalState(session) {
  const userId = session.role === "member" ? session.id : "member-li";
  const result = await pool.query("SELECT state_json FROM portal_state WHERE user_id=$1", [userId]);
  return result.rows[0]?.state_json || seedState;
}

async function writePortalState(userId, state) {
  await pool.query("INSERT INTO portal_state (user_id,state_json,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO UPDATE SET state_json=EXCLUDED.state_json,updated_at=NOW()", [userId, state]);
}

async function listUsers(response, session) {
  if (!["coach", "admin"].includes(session.role)) return json(response, 403, { error: "没有用户管理权限" });
  const result = await pool.query("SELECT id,name,phone,role,status,created_at FROM users ORDER BY created_at ASC LIMIT 500");
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
      const memberState = structuredClone(seedState);
      memberState.profile = { ...memberState.profile, id, name, phone: phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") };
      await pool.query("INSERT INTO portal_state (user_id,state_json) VALUES ($1,$2)", [id, memberState]);
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
  const userId = session.role === "member" ? session.id : "member-li";
  const state = await readPortalState({ ...session, id: userId, role: "member" });
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
    const booking = state.bookings.find((item) => item.id === String(payload.id || ""));
    if (!booking) return json(response, 404, { error: "找不到预约" });
    booking.status = booking.status === "可预约" ? "已预约" : "已取消";
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

async function handleHermes(request, response, session) {
  const body = await readJson(request);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-20).filter((item) => ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.length <= 4000) : [];
  if (!messages.length) return json(response, 400, { error: "请输入问题" });
  if (!process.env.HERMES_API_URL || !process.env.HERMES_API_KEY) return json(response, 503, { error: "原生 Hermes API 尚未配置" });

  let hermesApi;
  try {
    hermesApi = new URL(process.env.HERMES_API_URL);
  } catch {
    return json(response, 500, { error: "Hermes API 地址无效" });
  }
  const allowedHosts = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
  if (!["http:", "https:"].includes(hermesApi.protocol) || !allowedHosts.has(hermesApi.hostname)) {
    return json(response, 500, { error: "Hermes API 必须使用服务器私有回环地址" });
  }

  const upstream = await fetch(new URL("/v1/chat/completions", hermesApi), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.HERMES_API_KEY}`,
      "content-type": "application/json",
      "x-hermes-session-key": `shao-platform:${session.id}`,
    },
    body: JSON.stringify({
      model: "hermes-agent",
      stream: true,
      messages: [{ role: "system", content: hermesPrompt }, { role: "system", content: `以下是只读会员数据：${JSON.stringify({ member: body.member, bodyMetrics: body.bodyMetrics, meals: body.meals }).slice(0, 12000)}` }, ...messages],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!upstream.ok || !upstream.body) {
    console.error(JSON.stringify({ level: "error", integration: "hermes", status: upstream.status }));
    return json(response, 502, { error: "Hermes 智能体暂时不可用" });
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
        if (content) response.write(content);
      } catch {}
    }
  }
  response.end();
  await audit(session.id, "hermes_chat", { messageCount: messages.length });
}

async function handleWecom(request, response, session) {
  const body = await readJson(request);
  const member = String(body.member || "").slice(0, 40);
  const title = String(body.title || "").slice(0, 80);
  const content = String(body.content || "").slice(0, 1800);
  if (!member || !title || !content) return json(response, 400, { error: "消息内容不完整" });
  const id = randomUUID();
  const webhookValue = process.env.WECOM_WEBHOOK_URL;
  if (!webhookValue) {
    await pool.query("INSERT INTO notifications (id,actor_id,member_name,channel,title,content,status) VALUES ($1,$2,$3,'wecom',$4,$5,'queued')", [id, session.id, member, title, content]);
    return json(response, 202, { sent: false, configured: false, queued: true });
  }
  const webhook = new URL(webhookValue);
  if (webhook.protocol !== "https:" || webhook.hostname !== "qyapi.weixin.qq.com" || webhook.pathname !== "/cgi-bin/webhook/send") return json(response, 500, { error: "企业微信 Webhook 配置无效" });
  const upstream = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ msgtype: "markdown", markdown: { content: `### ${escapeMarkdown(title)}\n> 会员：${escapeMarkdown(member)}\n${escapeMarkdown(content)}\n\n<font color=\"comment\">由 Hermes 整理，已由邵教练确认</font>` } }) });
  const result = await upstream.json().catch(() => ({}));
  const sent = upstream.ok && result.errcode === 0;
  await pool.query("INSERT INTO notifications (id,actor_id,member_name,channel,title,content,status,provider_message) VALUES ($1,$2,$3,'wecom',$4,$5,$6,$7)", [id, session.id, member, title, content, sent ? "sent" : "failed", result.errmsg || null]);
  return sent ? json(response, 200, { sent: true, channel: "wecom" }) : json(response, 502, { sent: false, error: result.errmsg || "企业微信发送失败" });
}

async function handleWeixin(request, response, session) {
  const body = await readJson(request);
  const member = String(body.member || "").slice(0, 40);
  const title = String(body.title || "").slice(0, 80);
  const content = String(body.content || "").slice(0, 1800);
  if (!member || !title || !content) return json(response, 400, { error: "消息内容不完整" });

  const id = randomUUID();
  const target = process.env.WEIXIN_TARGET_ID;
  if (!target) {
    await pool.query(
      "INSERT INTO notifications (id,actor_id,member_name,channel,title,content,status,provider_message) VALUES ($1,$2,$3,'hermes-weixin',$4,$5,'queued',$6)",
      [id, session.id, member, title, content, "等待会员向原生 Hermes 微信机器人发送首条消息"],
    );
    return json(response, 202, { sent: false, configured: false, queued: true, channel: "hermes-weixin" });
  }

  const message = `【${title}】\n会员：${member}\n${content}\n\n— Hermes 整理，邵教练确认`;
  try {
    const result = await sendNativeHermesWeixin(target, message);
    const sent = result.ok;
    await pool.query(
      "INSERT INTO notifications (id,actor_id,member_name,channel,title,content,status,provider_message) VALUES ($1,$2,$3,'hermes-weixin',$4,$5,$6,$7)",
      [id, session.id, member, title, content, sent ? "sent" : "failed", sent ? "原生 Hermes 微信通道已接收" : result.message],
    );
    await audit(session.id, "weixin_send", { member, title, sent });
    return sent
      ? json(response, 200, { sent: true, channel: "hermes-weixin" })
      : json(response, 502, { sent: false, error: result.message || "微信发送失败" });
  } catch (error) {
    await pool.query(
      "INSERT INTO notifications (id,actor_id,member_name,channel,title,content,status,provider_message) VALUES ($1,$2,$3,'hermes-weixin',$4,$5,'failed',$6)",
      [id, session.id, member, title, content, error instanceof Error ? error.message.slice(0, 300) : "Hermes 微信通道不可用"],
    );
    return json(response, 502, { sent: false, error: "Hermes 微信通道暂时不可用" });
  }
}

function sendNativeHermesWeixin(target, message) {
  const wrapper = process.env.HERMES_SEND_WRAPPER || "/usr/local/bin/shao-hermes-send";
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/sudo", ["-n", "-H", "-u", "hermes", wrapper, target], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 30000);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString("utf8")).slice(-4000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: error.message.slice(0, 300) });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const detail = (stderr || stdout || `Hermes 发送进程退出码 ${code}`).trim().slice(0, 300);
      resolve({ ok: code === 0, message: detail });
    });
    child.stdin.end(message, "utf8");
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
function escapeMarkdown(value) { return value.replace(/[<>]/g, "").replace(/[`]/g, "ˋ"); }

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
