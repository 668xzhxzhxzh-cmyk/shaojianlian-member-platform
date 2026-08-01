import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const TOKEN_ERROR_CODES = new Set([40014, 42001]);

export function createWecomContactService({ pool }) {
  const corpId = String(process.env.WECOM_CORP_ID || "").trim();
  const contactSecret = String(process.env.WECOM_CONTACT_SECRET || process.env.WECOM_APP_SECRET || "").trim();
  const toolToken = String(process.env.HERMES_TOOL_TOKEN || "").trim();
  const allowedCoachUserIds = new Set(
    String(process.env.WECOM_ALLOWED_COACH_USERIDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  let accessToken = "";
  let accessTokenExpiresAt = 0;

  const contactConfigured = Boolean(corpId && contactSecret);
  const toolsConfigured = Boolean(toolToken && allowedCoachUserIds.size);

  async function handleInternalTool(request, response) {
    if (!LOOPBACK_ADDRESSES.has(String(request.socket.remoteAddress || ""))) {
      return sendJson(response, 403, { error: "AI 管理工具仅允许服务器回环调用" });
    }
    if (!toolsConfigured || !hasValidBearer(request, toolToken)) {
      return sendJson(response, 401, { error: "AI 管理工具凭证无效" });
    }

    const body = await readJson(request);
    const operation = String(body.operation || "");
    const coachUserId = requireCoachUserId(body.coach_userid);

    if (operation === "get_member_by_id") {
      const member = await getMemberById(body.member_id, coachUserId);
      return sendJson(response, 200, { member });
    }
    if (operation === "list_members") {
      const members = await listMembers(coachUserId);
      return sendJson(response, 200, { members });
    }
    if (operation === "add_private_session") {
      const result = await addPrivateSession(body, coachUserId);
      return sendJson(response, 201, result);
    }
    if (operation === "update_private_session") {
      const result = await updatePrivateSession(body, coachUserId);
      return sendJson(response, 200, result);
    }
    if (operation === "delete_private_session") {
      const result = await deletePrivateSession(body, coachUserId);
      return sendJson(response, 200, result);
    }
    if (operation === "update_training_plan") {
      const result = await updateTrainingPlan(body, coachUserId);
      return sendJson(response, 200, result);
    }
    if (operation === "update_nutrition_plan") {
      const result = await updateNutritionPlan(body, coachUserId);
      return sendJson(response, 200, result);
    }
    if (operation === "add_body_feedback") {
      const result = await addBodyFeedback(body, coachUserId);
      return sendJson(response, 201, result);
    }
    if (operation === "update_member_profile") {
      const result = await updateMemberProfile(body, coachUserId);
      return sendJson(response, 200, result);
    }
    if (operation === "get_member_change_history") {
      const history = await getMemberChangeHistory(body.member_id, body.limit, coachUserId);
      return sendJson(response, 200, { history });
    }
    if (operation === "list_customer_ids") {
      const customers = await listCustomerIds(coachUserId);
      return sendJson(response, 200, { customers });
    }
    if (operation === "create_member_binding_qr") {
      const bindingQr = await createMemberBindingQr(body.member_id, coachUserId);
      return sendJson(response, 201, { binding_qr: bindingQr });
    }
    if (operation === "bind_member_external_userid") {
      const binding = await bindMemberExternalUserId(
        body.member_id,
        body.external_userid,
        coachUserId,
      );
      return sendJson(response, 200, { binding });
    }
    if (operation === "create_message_draft") {
      const task = await createMessageDraft({
        memberId: body.member_id,
        coachUserId,
        title: body.title,
        content: body.content,
      });
      return sendJson(response, 201, {
        task,
        instruction: `草稿已创建。若确认内容无误，请回复：确认发送 task_id=${task.task_id}`,
      });
    }
    if (operation === "confirm_customer_send_task") {
      if (String(body.confirmation || "").trim() !== "确认发送") {
        return sendJson(response, 400, { error: "必须由教练明确输入“确认发送”" });
      }
      const task = await confirmCustomerSendTask(body.task_id, coachUserId);
      return sendJson(response, 200, {
        task,
        message: "发送任务已创建，请在企业微信客户端确认发送。",
      });
    }
    if (operation === "get_send_task_status") {
      const task = await syncSendTaskStatus(body.task_id, coachUserId);
      return sendJson(response, 200, { task });
    }
    return sendJson(response, 400, { error: "不支持的 AI 管理工具操作" });
  }

  async function getMemberById(rawMemberId, coachUserId) {
    const memberId = normalizeId(rawMemberId, "member_id");
    const result = await pool.query(
      `SELECT u.id, u.name, u.status, b.external_userid, b.coach_userid, p.state_json
       FROM users u
       JOIN member_wecom_bindings b ON b.member_id = u.id AND b.status = 'active'
       LEFT JOIN portal_state p ON p.user_id = u.id
       WHERE u.id = $1 AND u.role = 'member' AND b.coach_userid = $2
       LIMIT 1`,
      [memberId, coachUserId],
    );
    const row = result.rows[0];
    if (!row) throw publicError(404, "未找到该 member_id，或该会员未绑定给当前教练");
    await auditOperation(coachUserId, "wecom_member_viewed", {
      member_id: memberId,
    });
    const state = row.state_json || {};
    return {
      member_id: row.id,
      name: row.name,
      status: row.status,
      coach_userid: row.coach_userid,
      external_userid_bound: Boolean(row.external_userid),
      profile: state.profile || null,
      body_metrics: Array.isArray(state.bodyMetrics) ? state.bodyMetrics.slice(-14) : [],
      meals: Array.isArray(state.meals) ? state.meals : [],
      bookings: Array.isArray(state.bookings) ? state.bookings.slice(-14) : [],
      checkin_dates: Array.isArray(state.checkinDates) ? state.checkinDates.slice(-30) : [],
      streak: Number(state.streak || 0),
      suggestions: Array.isArray(state.suggestions) ? state.suggestions.slice(-10) : [],
      training_plan: state.trainingPlan || null,
      nutrition_plan: state.nutritionPlan || null,
      body_feedbacks: Array.isArray(state.bodyFeedbacks) ? state.bodyFeedbacks.slice(-10) : [],
    };
  }

  async function listMembers(coachUserId) {
    const result = await pool.query(
      `SELECT u.id,u.name,u.status,b.external_userid,p.updated_at
       FROM users u
       JOIN member_wecom_bindings b ON b.member_id=u.id AND b.status='active'
       LEFT JOIN portal_state p ON p.user_id=u.id
       WHERE u.role='member' AND b.coach_userid=$1
       ORDER BY u.name ASC
       LIMIT 500`,
      [coachUserId],
    );
    await auditOperation(coachUserId, "hermes_member_list_viewed", { count: result.rows.length });
    return result.rows.map((row) => ({
      member_id: row.id,
      name: row.name,
      status: row.status,
      external_userid_bound: Boolean(row.external_userid),
      updated_at: row.updated_at,
    }));
  }

  async function loadBoundMemberState(rawMemberId, coachUserId) {
    const memberId = normalizeId(rawMemberId, "member_id");
    const result = await pool.query(
      `SELECT u.id,u.name,p.state_json
       FROM users u
       JOIN member_wecom_bindings b ON b.member_id=u.id AND b.status='active'
       LEFT JOIN portal_state p ON p.user_id=u.id
       WHERE u.id=$1 AND u.role='member' AND u.status='active' AND b.coach_userid=$2
       LIMIT 1`,
      [memberId, coachUserId],
    );
    const row = result.rows[0];
    if (!row) throw publicError(404, "未找到该 member_id，或该会员未绑定给当前教练");
    return { memberId, name: row.name, state: row.state_json || {} };
  }

  async function saveMemberState(memberId, state, coachUserId, action, detail) {
    await pool.query(
      "INSERT INTO portal_state (user_id,state_json,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO UPDATE SET state_json=EXCLUDED.state_json,updated_at=NOW()",
      [memberId, state],
    );
    await auditOperation(coachUserId, action, { member_id: memberId, ...detail });
  }

  async function addPrivateSession(body, coachUserId) {
    const { memberId, state } = await loadBoundMemberState(body.member_id, coachUserId);
    const rawDate = normalizeText(body.date, "上课日期", 20);
    const day = normalizeText(body.day, "星期", 10);
    const time = normalizeText(body.time, "上课时间", 30);
    const focus = normalizeText(body.focus || "一对一私教", "训练重点", 120);
    if (!/^\d{1,2}\/\d{1,2}$/.test(rawDate) || !/^\d{2}:\d{2}[–-]\d{2}:\d{2}$/.test(time)) {
      throw publicError(400, "课程日期或时间格式无效");
    }
    const date = rawDate.split("/").map((part) => Number(part)).join("/");
    const normalizedTime = time.replace("-", "–");
    const requestId = String(body.request_id || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    const bookingId = requestId ? `hermes-booking-${requestId}` : `hermes-booking-${randomUUID()}`;
    const bookings = Array.isArray(state.bookings) ? state.bookings : [];
    const existing = bookings.find((item) => item.id === bookingId || (
      item.date === date
      && String(item.time || "").replace("-", "–") === normalizedTime
      && item.focus === focus
    ));
    if (existing) return { changed: false, member_id: memberId, booking: existing, idempotent_replay: true, sync: "课程已存在，未重复创建" };
    const booking = {
      id: bookingId,
      day,
      date,
      time: normalizedTime,
      title: "一对一私教",
      coach: "邵教练",
      focus,
      status: ["已预约", "待确认", "已完成"].includes(String(body.status)) ? String(body.status) : "已预约",
    };
    state.bookings = [...bookings, booking];
    await saveMemberState(memberId, state, coachUserId, "hermes_private_session_added", { booking });
    return { changed: true, member_id: memberId, booking, sync: "网站页面已自动同步" };
  }

  async function updatePrivateSession(body, coachUserId) {
    const { memberId, state } = await loadBoundMemberState(body.member_id, coachUserId);
    const sessionId = normalizeId(body.session_id, "session_id", 120);
    const bookings = Array.isArray(state.bookings) ? state.bookings : [];
    const booking = bookings.find((item) => item.id === sessionId);
    if (!booking) throw publicError(404, "找不到该 session_id 对应的课程");
    const next = { ...booking };
    if (String(body.day || "").trim()) next.day = normalizeText(body.day, "星期", 10);
    if (String(body.date || "").trim()) {
      const date = normalizeText(body.date, "上课日期", 20);
      if (!/^\d{1,2}\/\d{1,2}$/.test(date)) throw publicError(400, "课程日期格式无效");
      next.date = date;
    }
    if (String(body.time || "").trim()) {
      const time = normalizeText(body.time, "上课时间", 30);
      if (!/^\d{2}:\d{2}[–-]\d{2}:\d{2}$/.test(time)) throw publicError(400, "课程时间格式无效");
      next.time = time;
    }
    if (String(body.focus || "").trim()) next.focus = normalizeText(body.focus, "训练重点", 120);
    if (String(body.status || "").trim()) {
      if (!["已预约", "待确认", "已完成"].includes(String(body.status))) throw publicError(400, "课程状态无效");
      next.status = String(body.status);
    }
    state.bookings = bookings.map((item) => item.id === sessionId ? next : item);
    await saveMemberState(memberId, state, coachUserId, "hermes_private_session_updated", { session_id: sessionId, before: booking, after: next });
    return { changed: true, member_id: memberId, booking: next, sync: "网站页面已自动同步" };
  }

  async function deletePrivateSession(body, coachUserId) {
    const { memberId, state } = await loadBoundMemberState(body.member_id, coachUserId);
    const sessionId = normalizeId(body.session_id, "session_id", 120);
    const booking = (Array.isArray(state.bookings) ? state.bookings : []).find((item) => item.id === sessionId);
    if (!booking) throw publicError(404, "找不到该 session_id 对应的课程");
    state.bookings = state.bookings.filter((item) => item.id !== sessionId);
    await saveMemberState(memberId, state, coachUserId, "hermes_private_session_deleted", { session_id: sessionId, booking });
    return { changed: true, member_id: memberId, deleted_session: booking, sync: "网站页面已自动同步" };
  }

  async function updateTrainingPlan(body, coachUserId) {
    const { memberId, state } = await loadBoundMemberState(body.member_id, coachUserId);
    const current = state.trainingPlan && typeof state.trainingPlan === "object" ? state.trainingPlan : {};
    const days = Array.isArray(body.days) ? body.days.slice(0, 7).map((day, index) => ({
      id: String(day.id || `day-${index + 1}`).slice(0, 80),
      title: normalizeText(day.title, "训练日标题", 80),
      duration: normalizeText(day.duration || "60 分钟", "训练时长", 30),
      exercises: Array.isArray(day.exercises) ? day.exercises.slice(0, 20).map((item) => normalizeText(item, "训练动作", 120)) : [],
    })) : current.days;
    state.trainingPlan = {
      ...current,
      phase: normalizeText(body.phase || current.phase || "当前周期", "训练阶段", 40),
      goal: normalizeText(body.goal || current.goal || "保持稳定训练", "训练目标", 160),
      frequency: Math.min(7, Math.max(1, Number(body.frequency || current.frequency || 3))),
      focus: normalizeText(body.focus || current.focus || "动作质量", "训练重点", 180),
      note: normalizeText(body.note || current.note || "由 AI 按教练指令更新", "教练备注", 500),
      days: days || [],
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    await saveMemberState(memberId, state, coachUserId, "hermes_training_plan_updated", { training_plan: state.trainingPlan });
    return { changed: true, member_id: memberId, training_plan: state.trainingPlan, sync: "网站页面已自动同步" };
  }

  async function updateNutritionPlan(body, coachUserId) {
    const { memberId, state } = await loadBoundMemberState(body.member_id, coachUserId);
    const current = state.nutritionPlan && typeof state.nutritionPlan === "object" ? state.nutritionPlan : {};
    const meals = Array.isArray(body.meals) ? body.meals.slice(0, 6).map((meal) => ({
      type: normalizeText(meal.type, "餐次", 10),
      time: normalizeText(meal.time, "用餐时间", 10),
      food: normalizeText(meal.food, "餐食内容", 300),
      calories: Math.min(3000, Math.max(0, Number(meal.calories || 0))),
    })) : current.meals;
    state.nutritionPlan = {
      ...current,
      calories: Math.min(6000, Math.max(800, Number(body.calories || current.calories || 1800))),
      protein: Math.min(400, Math.max(0, Number(body.protein || current.protein || 120))),
      carbs: Math.min(800, Math.max(0, Number(body.carbs || current.carbs || 180))),
      fat: Math.min(300, Math.max(0, Number(body.fat || current.fat || 60))),
      reminder: normalizeText(body.reminder || current.reminder || "按训练状态调整摄入", "执行提醒", 600),
      meals: meals || [],
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    await saveMemberState(memberId, state, coachUserId, "hermes_nutrition_plan_updated", { nutrition_plan: state.nutritionPlan });
    return { changed: true, member_id: memberId, nutrition_plan: state.nutritionPlan, sync: "网站页面已自动同步" };
  }

  async function addBodyFeedback(body, coachUserId) {
    const { memberId, state } = await loadBoundMemberState(body.member_id, coachUserId);
    const risk = ["良好", "注意", "需关注"].includes(String(body.risk)) ? String(body.risk) : "注意";
    const feedback = {
      id: `hermes-feedback-${randomUUID()}`,
      date: new Date().toISOString().slice(0, 10),
      summary: normalizeText(body.summary, "身体反馈", 1000),
      nextFocus: normalizeText(body.next_focus, "观察重点", 500),
      risk,
    };
    state.bodyFeedbacks = [...(Array.isArray(state.bodyFeedbacks) ? state.bodyFeedbacks : []), feedback].slice(-100);
    await saveMemberState(memberId, state, coachUserId, "hermes_body_feedback_added", { feedback });
    return { changed: true, member_id: memberId, feedback, sync: "网站页面已自动同步" };
  }

  async function updateMemberProfile(body, coachUserId) {
    const { memberId, state } = await loadBoundMemberState(body.member_id, coachUserId);
    const profile = state.profile && typeof state.profile === "object" ? state.profile : {};
    for (const [field, label] of [["plan", "会员计划"], ["expires_at", "到期日期"], ["level", "会员等级"]]) {
      if (body[field] !== undefined && String(body[field]).trim()) {
        profile[field === "expires_at" ? "expiresAt" : field] = normalizeText(body[field], label, 120);
      }
    }
    state.profile = profile;
    await saveMemberState(memberId, state, coachUserId, "hermes_member_profile_updated", { profile });
    return { changed: true, member_id: memberId, profile, sync: "网站页面已自动同步" };
  }

  async function getMemberChangeHistory(rawMemberId, rawLimit, coachUserId) {
    const { memberId } = await loadBoundMemberState(rawMemberId, coachUserId);
    const limit = Math.min(50, Math.max(1, Number(rawLimit || 20)));
    const result = await pool.query(
      `SELECT action,detail,created_at
       FROM audit_log
       WHERE actor_id=$1 AND detail->>'member_id'=$2
       ORDER BY created_at DESC
       LIMIT $3`,
      [`wecom:${coachUserId}`, memberId, limit],
    );
    return result.rows.map((row) => ({
      action: row.action,
      detail: row.detail,
      created_at: row.created_at,
    }));
  }

  async function listCustomerIds(coachUserId) {
    requireContactConfigured();
    const data = await callWecom(
      `/cgi-bin/externalcontact/list?userid=${encodeURIComponent(coachUserId)}`,
      { method: "GET" },
    );
    const ids = Array.isArray(data.external_userid) ? data.external_userid : [];
    return ids.slice(0, 1000).map((externalUserId) => ({
      external_userid: String(externalUserId),
      coach_userid: coachUserId,
    }));
  }

  async function createMemberBindingQr(rawMemberId, coachUserId) {
    requireContactConfigured();
    const memberId = normalizeId(rawMemberId, "member_id");
    const memberResult = await pool.query(
      `SELECT u.id,u.name,u.status,b.coach_userid,b.external_userid
       FROM users u
       LEFT JOIN member_wecom_bindings b ON b.member_id=u.id AND b.status='active'
       WHERE u.id=$1 AND u.role='member'
       LIMIT 1`,
      [memberId],
    );
    const member = memberResult.rows[0];
    if (!member || member.status !== "active") throw publicError(404, "member_id 不存在或会员已停用");
    if (member.coach_userid && member.coach_userid !== coachUserId) {
      throw publicError(403, "该会员已归属其他教练");
    }
    if (member.external_userid) {
      throw publicError(409, "该会员已完成企业微信绑定，无需重复生成二维码");
    }

    const stateToken = `sb_${randomBytes(15).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const contactWay = await callWecom("/cgi-bin/externalcontact/add_contact_way", {
      method: "POST",
      body: {
        type: 1,
        scene: 2,
        style: 1,
        remark: "会员自动绑定",
        skip_verify: true,
        state: stateToken,
        user: [coachUserId],
      },
    });
    const qrCode = String(contactWay.qr_code || "").trim();
    const configId = String(contactWay.config_id || "").trim();
    if (!qrCode || !configId) throw publicError(502, "企业微信未返回可用的客户联系二维码");

    const client = typeof pool.connect === "function" ? await pool.connect() : pool;
    try {
      if (client !== pool) await client.query("BEGIN");
      await client.query(
        `INSERT INTO member_wecom_bindings (member_id,external_userid,coach_userid,status,updated_at)
         VALUES ($1,NULL,$2,'active',NOW())
         ON CONFLICT (member_id) DO UPDATE
         SET coach_userid=EXCLUDED.coach_userid,status='active',updated_at=NOW()
         WHERE member_wecom_bindings.external_userid IS NULL`,
        [memberId, coachUserId],
      );
      await client.query(
        `UPDATE wecom_binding_links
         SET status='superseded',updated_at=NOW()
         WHERE member_id=$1 AND coach_userid=$2 AND status='pending'`,
        [memberId, coachUserId],
      );
      await client.query(
        `INSERT INTO wecom_binding_links
           (state_token,member_id,coach_userid,config_id,qr_code,status,expires_at)
         VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
        [stateToken, memberId, coachUserId, configId, qrCode, expiresAt],
      );
      await auditOperation(coachUserId, "wecom_member_binding_qr_created", {
        member_id: memberId,
        config_id: configId,
        expires_at: expiresAt,
      }, client);
      if (client !== pool) await client.query("COMMIT");
    } catch (error) {
      if (client !== pool) await client.query("ROLLBACK");
      throw error;
    } finally {
      if (client !== pool) client.release();
    }

    return {
      member_id: memberId,
      coach_userid: coachUserId,
      qr_code: qrCode,
      status: "pending",
      expires_at: expiresAt,
      instruction: "请让该会员使用普通微信扫描此专属二维码并添加教练，添加成功后网站会自动同步绑定。",
    };
  }

  async function handleContactEvent(message) {
    if (String(message?.msgType || "").toLowerCase() !== "event"
      || String(message?.event || "").toLowerCase() !== "change_external_contact"
      || String(message?.changeType || "").toLowerCase() !== "add_external_contact") {
      return { ignored: true, reason: "unsupported_event" };
    }
    const coachUserId = requireCoachUserId(message.userId);
    const externalUserId = normalizeId(message.externalUserId, "external_userid", 128);
    const stateToken = String(message.state || "").trim();
    if (!/^sb_[A-Za-z0-9_-]{20}$/.test(stateToken)) {
      return { ignored: true, reason: "not_a_member_binding_qr" };
    }

    const linkResult = await pool.query(
      `SELECT state_token,member_id,coach_userid,status,external_userid,expires_at
       FROM wecom_binding_links
       WHERE state_token=$1 AND coach_userid=$2
       LIMIT 1`,
      [stateToken, coachUserId],
    );
    const link = linkResult.rows[0];
    if (!link) return { ignored: true, reason: "binding_link_not_found" };
    if (link.status === "consumed" && link.external_userid === externalUserId) {
      return { bound: true, idempotent_replay: true, member_id: link.member_id };
    }
    if (link.status !== "pending" || new Date(link.expires_at).getTime() <= Date.now()) {
      return { ignored: true, reason: "binding_link_inactive" };
    }

    const customer = await callWecom(
      `/cgi-bin/externalcontact/get?external_userid=${encodeURIComponent(externalUserId)}`,
      { method: "GET" },
    );
    const followUsers = Array.isArray(customer.follow_user) ? customer.follow_user : [];
    if (!followUsers.some((item) => String(item.userid || "") === coachUserId)) {
      throw publicError(403, "新增客户事件未通过企业微信客户归属复核");
    }

    const client = typeof pool.connect === "function" ? await pool.connect() : pool;
    try {
      if (client !== pool) await client.query("BEGIN");
      const lockedResult = await client.query(
        `SELECT member_id,coach_userid,status,external_userid,expires_at
         FROM wecom_binding_links
         WHERE state_token=$1
         FOR UPDATE`,
        [stateToken],
      );
      const locked = lockedResult.rows[0];
      if (!locked || locked.coach_userid !== coachUserId) {
        throw publicError(404, "会员绑定二维码不存在");
      }
      if (locked.status === "consumed" && locked.external_userid === externalUserId) {
        if (client !== pool) await client.query("COMMIT");
        return { bound: true, idempotent_replay: true, member_id: locked.member_id };
      }
      if (locked.status !== "pending" || new Date(locked.expires_at).getTime() <= Date.now()) {
        throw publicError(409, "会员绑定二维码已失效");
      }
      const existingResult = await client.query(
        "SELECT member_id FROM member_wecom_bindings WHERE external_userid=$1 FOR UPDATE",
        [externalUserId],
      );
      const existingMemberId = existingResult.rows[0]?.member_id;
      if (existingMemberId && existingMemberId !== locked.member_id) {
        throw publicError(409, "该企业微信客户已绑定其他 member_id");
      }
      const memberBindingResult = await client.query(
        "SELECT external_userid FROM member_wecom_bindings WHERE member_id=$1 FOR UPDATE",
        [locked.member_id],
      );
      const currentExternalUserId = memberBindingResult.rows[0]?.external_userid;
      if (currentExternalUserId && currentExternalUserId !== externalUserId) {
        throw publicError(409, "该 member_id 已绑定其他企业微信客户，禁止扫码覆盖");
      }
      await client.query(
        `INSERT INTO member_wecom_bindings
           (member_id,external_userid,coach_userid,status,updated_at)
         VALUES ($1,$2,$3,'active',NOW())
         ON CONFLICT (member_id) DO UPDATE
         SET external_userid=EXCLUDED.external_userid,
             coach_userid=EXCLUDED.coach_userid,
             status='active',
             updated_at=NOW()`,
        [locked.member_id, externalUserId, coachUserId],
      );
      await client.query(
        `UPDATE wecom_binding_links
         SET status='consumed',external_userid=$2,consumed_at=NOW(),updated_at=NOW()
         WHERE state_token=$1`,
        [stateToken, externalUserId],
      );
      const syncedName = await syncOfficialCustomerName(client, locked.member_id, customer);
      await auditOperation(coachUserId, "wecom_member_binding_auto_completed", {
        member_id: locked.member_id,
        external_userid: externalUserId,
        official_name_synced: Boolean(syncedName),
      }, client);
      if (client !== pool) await client.query("COMMIT");
      return {
        bound: true,
        member_id: locked.member_id,
        external_userid: externalUserId,
        coach_userid: coachUserId,
        verified_via_wecom: true,
        member_name: syncedName,
      };
    } catch (error) {
      if (client !== pool) await client.query("ROLLBACK");
      throw error;
    } finally {
      if (client !== pool) client.release();
    }
  }

  async function bindMemberExternalUserId(rawMemberId, rawExternalUserId, coachUserId) {
    requireContactConfigured();
    const memberId = normalizeId(rawMemberId, "member_id");
    const externalUserId = normalizeId(rawExternalUserId, "external_userid", 128);
    const memberResult = await pool.query(
      "SELECT id,name,status FROM users WHERE id=$1 AND role='member' LIMIT 1",
      [memberId],
    );
    if (!memberResult.rows[0]) throw publicError(404, "member_id 不存在");

    const customer = await callWecom(
      `/cgi-bin/externalcontact/get?external_userid=${encodeURIComponent(externalUserId)}`,
      { method: "GET" },
    );
    const followUsers = Array.isArray(customer.follow_user) ? customer.follow_user : [];
    if (!followUsers.some((item) => String(item.userid || "") === coachUserId)) {
      throw publicError(403, "该 external_userid 不是当前教练的企业微信客户");
    }

    await pool.query(
      `INSERT INTO member_wecom_bindings
         (member_id, external_userid, coach_userid, status, updated_at)
       VALUES ($1,$2,$3,'active',NOW())
       ON CONFLICT (member_id) DO UPDATE
       SET external_userid=EXCLUDED.external_userid,
           coach_userid=EXCLUDED.coach_userid,
           status='active',
           updated_at=NOW()`,
      [memberId, externalUserId, coachUserId],
    );
    await pool.query(
      `UPDATE wecom_binding_links
       SET status='superseded',updated_at=NOW()
       WHERE member_id=$1 AND coach_userid=$2 AND status='pending'`,
      [memberId, coachUserId],
    );
    const syncedName = await syncOfficialCustomerName(pool, memberId, customer);
    await auditOperation(coachUserId, "wecom_member_binding_verified", {
      member_id: memberId,
      external_userid: externalUserId,
      official_name_synced: Boolean(syncedName),
    });
    return {
      member_id: memberId,
      external_userid: externalUserId,
      coach_userid: coachUserId,
      verified_via_wecom: true,
      member_name: syncedName,
    };
  }

  async function syncOfficialCustomerName(database, memberId, customer) {
    const officialName = String(customer?.external_contact?.name || "").trim();
    const characterCount = Array.from(officialName).length;
    if (!officialName || characterCount > 64) return null;

    await database.query(
      "UPDATE users SET name=$2 WHERE id=$1 AND role='member'",
      [memberId, officialName],
    );
    const stateResult = await database.query(
      "SELECT state_json FROM portal_state WHERE user_id=$1 FOR UPDATE",
      [memberId],
    );
    if (stateResult.rows[0]?.state_json) {
      const state = structuredClone(stateResult.rows[0].state_json);
      state.profile = { ...(state.profile || {}), name: officialName };
      if (Array.isArray(state.suggestions)) {
        state.suggestions = state.suggestions.map((item) => ({ ...item, member: officialName }));
      }
      await database.query(
        "UPDATE portal_state SET state_json=$2,updated_at=NOW() WHERE user_id=$1",
        [memberId, state],
      );
    }
    return officialName;
  }

  async function createMessageDraft({ memberId: rawMemberId, coachUserId, title, content }) {
    const memberId = normalizeId(rawMemberId, "member_id");
    const safeTitle = normalizeText(title, "标题", 80);
    const safeContent = normalizeText(content, "消息内容", 1800);
    const binding = await pool.query(
      `SELECT b.member_id,b.external_userid,b.coach_userid,u.name
       FROM member_wecom_bindings b
       JOIN users u ON u.id=b.member_id
       WHERE b.member_id=$1 AND b.coach_userid=$2 AND b.status='active'
       LIMIT 1`,
      [memberId, coachUserId],
    );
    const row = binding.rows[0];
    if (!row) throw publicError(404, "会员未绑定给当前教练");
    if (!row.external_userid) {
      throw publicError(409, "会员尚未绑定 external_userid，不能创建发送草稿");
    }
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO wecom_send_tasks
         (id,member_id,external_userid,coach_userid,title,content,status)
       VALUES ($1,$2,$3,$4,$5,$6,'draft')`,
      [taskId, memberId, row.external_userid, coachUserId, safeTitle, safeContent],
    );
    await auditOperation(coachUserId, "wecom_message_draft_created", {
      task_id: taskId,
      member_id: memberId,
    });
    return {
      task_id: taskId,
      member_id: memberId,
      member_name: row.name,
      title: safeTitle,
      content: safeContent,
      status: "draft",
      member_received: false,
    };
  }

  async function confirmCustomerSendTask(rawTaskId, coachUserId) {
    requireContactConfigured();
    const taskId = normalizeUuid(rawTaskId, "task_id");
    const client = await pool.connect();
    let task;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT id,member_id,external_userid,coach_userid,title,content,status
         FROM wecom_send_tasks
         WHERE id=$1 AND coach_userid=$2
         FOR UPDATE`,
        [taskId, coachUserId],
      );
      task = result.rows[0];
      if (!task) throw publicError(404, "发送草稿不存在");
      if (task.status !== "draft") {
        throw publicError(409, "该草稿已处理，不能重复创建发送任务");
      }
      await client.query(
        "UPDATE wecom_send_tasks SET status='creating_task',confirmed_at=NOW() WHERE id=$1",
        [taskId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    try {
      const result = await callWecom("/cgi-bin/externalcontact/add_msg_template", {
        method: "POST",
        body: {
          chat_type: "single",
          external_userid: [task.external_userid],
          sender: coachUserId,
          text: { content: `【${task.title}】\n${task.content}` },
        },
      });
      const failed = Array.isArray(result.fail_list)
        && result.fail_list.map(String).includes(String(task.external_userid));
      if (failed || !result.msgid) {
        await pool.query(
          `UPDATE wecom_send_tasks
           SET status='provider_rejected',provider_message=$2,provider_updated_at=NOW()
           WHERE id=$1`,
          [taskId, failed ? "企业微信拒绝为该客户创建发送任务" : "企业微信未返回 msgid"],
        );
        throw publicError(502, "企业微信未能创建客户发送任务");
      }
      await pool.query(
        `UPDATE wecom_send_tasks
         SET status='awaiting_coach_confirmation',
             wecom_msgid=$2,
             provider_message='任务已创建，等待企业微信客户端确认',
             provider_updated_at=NOW()
         WHERE id=$1`,
        [taskId, String(result.msgid)],
      );
      await auditOperation(coachUserId, "wecom_customer_send_task_created", {
        task_id: taskId,
        member_id: task.member_id,
      });
      return {
        task_id: taskId,
        member_id: task.member_id,
        status: "awaiting_coach_confirmation",
        member_received: false,
      };
    } catch (error) {
      await pool.query(
        `UPDATE wecom_send_tasks
         SET status='provider_error',provider_message=$2,provider_updated_at=NOW()
         WHERE id=$1 AND status='creating_task'`,
        [taskId, String(error.message || "企业微信接口错误").slice(0, 300)],
      );
      throw error;
    }
  }

  async function syncSendTaskStatus(rawTaskId, coachUserId) {
    requireContactConfigured();
    const taskId = normalizeUuid(rawTaskId, "task_id");
    const result = await pool.query(
      `SELECT id,member_id,external_userid,coach_userid,status,wecom_msgid,provider_message
       FROM wecom_send_tasks WHERE id=$1 AND coach_userid=$2 LIMIT 1`,
      [taskId, coachUserId],
    );
    const task = result.rows[0];
    if (!task) throw publicError(404, "发送任务不存在");
    if (!task.wecom_msgid || task.status === "draft") return publicTask(task);

    const data = await callWecom("/cgi-bin/externalcontact/get_groupmsg_send_result", {
      method: "POST",
      body: {
        msgid: task.wecom_msgid,
        userid: coachUserId,
        limit: 100,
      },
    });
    const status = (Array.isArray(data.send_list) ? data.send_list : [])
      .find((item) => String(item.external_userid || "") === String(task.external_userid));
    if (!status) return publicTask(task);

    const providerStatus = Number(status.status);
    const nextStatus = providerStatus === 1
      ? "wecom_reported_sent"
      : providerStatus === 2
        ? "failed_not_friend"
        : providerStatus === 3
          ? "failed_frequency_limit"
          : "awaiting_coach_confirmation";
    const providerMessage = providerStatus === 1
      ? "企业微信报告教练已执行发送"
      : providerStatus === 2
        ? "客户不是教练好友，发送失败"
        : providerStatus === 3
          ? "客户已收到其他群发消息，发送失败"
          : "等待企业微信客户端确认";
    await pool.query(
      `UPDATE wecom_send_tasks
       SET status=$2,provider_message=$3,provider_updated_at=NOW()
       WHERE id=$1`,
      [taskId, nextStatus, providerMessage],
    );
    await auditOperation(coachUserId, "wecom_send_task_status_checked", {
      task_id: taskId,
      member_id: task.member_id,
      status: nextStatus,
    });
    return {
      task_id: taskId,
      member_id: task.member_id,
      status: nextStatus,
      provider_message: providerMessage,
      member_received: false,
    };
  }

  function requireCoachUserId(rawCoachUserId) {
    const coachUserId = normalizeId(rawCoachUserId, "coach_userid", 128);
    if (!allowedCoachUserIds.has(coachUserId)) {
      throw publicError(403, "该企业微信 userid 没有 AI 管理工具权限");
    }
    return coachUserId;
  }

  function requireContactConfigured() {
    if (!contactConfigured) {
      throw publicError(503, "企业微信客户联系 API 尚未配置");
    }
  }

  async function callWecom(path, { method, body }) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await getAccessToken(attempt > 0);
      const url = new URL(path, WECOM_API_ORIGIN);
      url.searchParams.set("access_token", token);
      const response = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json; charset=utf-8" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      if (TOKEN_ERROR_CODES.has(Number(data.errcode)) && attempt === 0) {
        accessToken = "";
        accessTokenExpiresAt = 0;
        continue;
      }
      if (!response.ok || Number(data.errcode || 0) !== 0) {
        throw publicError(502, `企业微信接口失败：${String(data.errmsg || response.status).slice(0, 160)}`);
      }
      return data;
    }
    throw publicError(502, "企业微信 access_token 刷新失败");
  }

  async function getAccessToken(forceRefresh = false) {
    if (!forceRefresh && accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
    const url = new URL("/cgi-bin/gettoken", WECOM_API_ORIGIN);
    url.searchParams.set("corpid", corpId);
    url.searchParams.set("corpsecret", contactSecret);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || Number(data.errcode || 0) !== 0 || !data.access_token) {
      throw publicError(502, `企业微信鉴权失败：${String(data.errmsg || response.status).slice(0, 160)}`);
    }
    accessToken = String(data.access_token);
    accessTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000;
    return accessToken;
  }

  async function auditOperation(coachUserId, action, detail, database = pool) {
    await database.query(
      "INSERT INTO audit_log (id,actor_id,action,detail) VALUES ($1,$2,$3,$4)",
      [randomUUID(), `wecom:${coachUserId}`, action, detail],
    );
  }

  return {
    contactConfigured,
    toolsConfigured,
    handleContactEvent,
    handleInternalTool,
  };
}

function normalizeId(value, label, maxLength = 80) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength || !/^[A-Za-z0-9_.:@-]+$/.test(normalized)) {
    throw publicError(400, `${label} 格式无效`);
  }
  return normalized;
}

function normalizeUuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw publicError(400, `${label} 格式无效`);
  }
  return normalized;
}

function normalizeText(value, label, maxLength) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw publicError(400, `${label}不能为空且不得超过 ${maxLength} 个字符`);
  }
  return normalized;
}

function hasValidBearer(request, expected) {
  const provided = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) throw publicError(413, "请求过大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw publicError(400, "请求 JSON 无效");
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function publicTask(task) {
  return {
    task_id: task.id,
    member_id: task.member_id,
    status: task.status,
    provider_message: task.provider_message || null,
    member_received: false,
  };
}

function publicError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
