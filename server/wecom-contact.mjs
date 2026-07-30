import { randomUUID, timingSafeEqual } from "node:crypto";

const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const TOKEN_ERROR_CODES = new Set([40014, 42001]);

export function createWecomContactService({ pool }) {
  const corpId = String(process.env.WECOM_CORP_ID || "").trim();
  const contactSecret = String(process.env.WECOM_CONTACT_SECRET || "").trim();
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
      return sendJson(response, 403, { error: "Hermes 管理工具仅允许服务器回环调用" });
    }
    if (!toolsConfigured || !hasValidBearer(request, toolToken)) {
      return sendJson(response, 401, { error: "Hermes 管理工具凭证无效" });
    }

    const body = await readJson(request);
    const operation = String(body.operation || "");
    const coachUserId = requireCoachUserId(body.coach_userid);

    if (operation === "get_member_by_id") {
      const member = await getMemberById(body.member_id, coachUserId);
      return sendJson(response, 200, { member });
    }
    if (operation === "list_customer_ids") {
      const customers = await listCustomerIds(coachUserId);
      return sendJson(response, 200, { customers });
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
    return sendJson(response, 400, { error: "不支持的 Hermes 管理工具操作" });
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
    };
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
    await auditOperation(coachUserId, "wecom_member_binding_verified", {
      member_id: memberId,
      external_userid: externalUserId,
    });
    return {
      member_id: memberId,
      external_userid: externalUserId,
      coach_userid: coachUserId,
      verified_via_wecom: true,
    };
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
      throw publicError(403, "该企业微信 userid 没有 Hermes 管理工具权限");
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

  async function auditOperation(coachUserId, action, detail) {
    await pool.query(
      "INSERT INTO audit_log (id,actor_id,action,detail) VALUES ($1,$2,$3,$4)",
      [randomUUID(), `wecom:${coachUserId}`, action, detail],
    );
  }

  return {
    contactConfigured,
    toolsConfigured,
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
