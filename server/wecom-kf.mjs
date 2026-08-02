const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
const TOKEN_ERROR_CODES = new Set([40014, 42001]);
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_RETRY_ATTEMPTS = 5;

export function createWecomCustomerService({
  pool,
  visionService,
  replyService,
  audit = async () => {},
  fetchImpl = fetch,
} = {}) {
  const corpId = String(process.env.WECOM_CORP_ID || "").trim();
  const secret = String(process.env.WECOM_KF_SECRET || process.env.WECOM_APP_SECRET || "").trim();
  const configuredOpenKfId = String(process.env.WECOM_KF_OPEN_KFID || "").trim();
  const expectedAccountName = String(process.env.WECOM_KF_ACCOUNT_NAME || "AI健康管理服务").trim();
  let accessToken = "";
  let accessTokenExpiresAt = 0;
  let resolvedAccount = null;
  const configured = Boolean(
    corpId
    && secret
    && (configuredOpenKfId || expectedAccountName)
    && pool
    && visionService?.configured
    && replyService?.configured,
  );

  async function handleEvent(message) {
    if (!configured) throw publicError(503, "企业微信客服接口尚未配置");
    const eventOpenKfId = normalizeId(message.openKfId, "微信客服账号 ID");
    const account = await resolveAccount(eventOpenKfId);
    const syncToken = normalizeToken(message.kfToken);
    let cursor = await loadCursor(account.openKfId);
    let processed = 0;
    let hasMore = false;
    for (let page = 0; page < 10; page += 1) {
      const data = await callApi("/cgi-bin/kf/sync_msg", {
        method: "POST",
        body: { cursor, token: syncToken, limit: 1000, voice_format: 0, open_kfid: account.openKfId },
      });
      const messages = Array.isArray(data.msg_list) ? data.msg_list : [];
      for (const item of messages) {
        if (String(item?.open_kfid || "") !== account.openKfId || Number(item?.origin) !== 3) continue;
        processed += 1;
        await processCustomerMessage(item).catch(async (error) => markFailed(item?.msgid, error));
      }
      hasMore = Number(data.has_more || 0) === 1;
      const nextCursor = String(data.next_cursor || "");
      if (nextCursor) {
        cursor = nextCursor;
        await saveCursor(account.openKfId, cursor);
      }
      if (!hasMore || !nextCursor) break;
    }
    return { processed, hasMore };
  }

  async function processCustomerMessage(message, { retry = false } = {}) {
    const msgId = normalizeId(message.msgid, "微信客服消息 ID");
    const externalUserId = normalizeId(message.external_userid, "客户 external_userid");
    const openKfId = normalizeId(message.open_kfid, "微信客服账号 ID");
    await resolveAccount(openKfId);
    const msgType = String(message.msgtype || "").trim().toLowerCase();
    const payload = normalizePayload(message, msgType);
    const claimed = retry
      ? await pool.query(
        `UPDATE wecom_customer_messages
         SET status='processing',attempt_count=attempt_count+1,error_message=NULL,updated_at=NOW()
         WHERE msg_id=$1 AND status='failed' AND attempt_count < $2
         RETURNING msg_id`,
        [msgId, MAX_RETRY_ATTEMPTS],
      )
      : await pool.query(
        `INSERT INTO wecom_customer_messages
         (msg_id,external_userid,open_kfid,msg_type,status,payload_json,attempt_count)
         VALUES ($1,$2,$3,$4,'processing',$5,1)
         ON CONFLICT (msg_id) DO NOTHING
         RETURNING msg_id`,
        [msgId, externalUserId, openKfId, msgType || "unknown", payload],
      );
    if (!claimed.rows[0]) return { duplicate: true };

    const memberResult = await pool.query(
      `SELECT u.id,u.name,p.state_json
       FROM member_wecom_bindings b
       JOIN users u ON u.id=b.member_id AND u.role='member' AND u.status='active'
       LEFT JOIN portal_state p ON p.user_id=u.id
       WHERE b.external_userid=$1 AND b.status='active'
       LIMIT 1`,
      [externalUserId],
    );
    const member = memberResult.rows[0];
    if (!member) {
      await sendText({ openKfId, externalUserId, content: "当前微信尚未绑定会员档案，请联系邵教练完成绑定后再查询。" });
      await markReplied(msgId, "unbound");
      return { unbound: true };
    }

    let customerText = "";
    let imageDescription = "";
    if (msgType === "text") {
      customerText = String(message?.text?.content || "").trim().slice(0, 1200);
      if (!customerText) throw publicError(400, "客户文字消息为空");
    } else if (msgType === "image") {
      const mediaId = normalizeId(message?.image?.media_id, "客户图片 media_id");
      const media = await downloadMedia(mediaId);
      imageDescription = await visionService.analyzeImage({ ...media, prompt: "会员通过微信客服发送了这张图片，请理解图片并协助回答。" });
      customerText = "请结合我发送的图片和会员档案回答。";
    } else {
      await sendText({ openKfId, externalUserId, content: "我目前可以理解文字和图片，请改用这两种方式发送。" });
      await markReplied(msgId, "unsupported");
      return { unsupported: true };
    }

    const history = await loadConversation(externalUserId, member.id);
    const content = await replyService.reply({
      externalUserId,
      memberName: member.name,
      memberState: member.state_json,
      customerText,
      imageDescription,
      history,
    });
    await sendText({ openKfId, externalUserId, content });
    await saveConversation(externalUserId, member.id, history, {
      role: "user",
      content: imageDescription ? `[图片] ${imageDescription}` : customerText,
    }, { role: "assistant", content });
    await markReplied(msgId, "replied");
    await audit(externalUserId, "wecom_customer_hermes_replied", {
      memberId: member.id,
      msgType,
      msgId,
      replyLength: Array.from(content).length,
    });
    return { replied: true, memberId: member.id };
  }

  async function retryFailedMessages() {
    if (!configured) return { retried: 0 };
    const result = await pool.query(
      `SELECT payload_json FROM wecom_customer_messages
       WHERE status='failed' AND attempt_count < $1 AND next_retry_at <= NOW()
       ORDER BY next_retry_at ASC LIMIT 20`,
      [MAX_RETRY_ATTEMPTS],
    );
    let retried = 0;
    for (const row of result.rows) {
      try {
        const outcome = await processCustomerMessage(row.payload_json, { retry: true });
        if (!outcome.duplicate) retried += 1;
      } catch (error) {
        await markFailed(row.payload_json?.msgid, error);
      }
    }
    return { retried };
  }

  async function resolveAccount(eventOpenKfId = "") {
    if (resolvedAccount) {
      if (eventOpenKfId && eventOpenKfId !== resolvedAccount.openKfId) throw publicError(403, "微信客服账号不匹配");
      return resolvedAccount;
    }
    if (configuredOpenKfId) {
      if (eventOpenKfId && eventOpenKfId !== configuredOpenKfId) throw publicError(403, "微信客服账号不匹配");
      resolvedAccount = { openKfId: configuredOpenKfId, name: expectedAccountName };
      return resolvedAccount;
    }
    const data = await callApi("/cgi-bin/kf/account/list");
    const accounts = Array.isArray(data.account_list) ? data.account_list : [];
    const match = accounts.find((item) => String(item?.name || "").trim() === expectedAccountName);
    const openKfId = String(match?.open_kfid || "").trim();
    if (!openKfId || (eventOpenKfId && eventOpenKfId !== openKfId)) throw publicError(403, "未找到指定的微信客服账号");
    resolvedAccount = { openKfId: normalizeId(openKfId, "微信客服账号 ID"), name: expectedAccountName };
    return resolvedAccount;
  }

  async function loadCursor(openKfId) {
    const result = await pool.query("SELECT cursor FROM wecom_customer_sync_state WHERE open_kfid=$1", [openKfId]);
    return String(result.rows[0]?.cursor || "");
  }

  async function saveCursor(openKfId, cursor) {
    await pool.query(
      `INSERT INTO wecom_customer_sync_state (open_kfid,cursor,updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (open_kfid) DO UPDATE SET cursor=EXCLUDED.cursor,updated_at=NOW()`,
      [openKfId, cursor],
    );
  }

  async function loadConversation(externalUserId, memberId) {
    const result = await pool.query(
      "SELECT turns_json FROM wecom_customer_conversations WHERE external_userid=$1 AND member_id=$2",
      [externalUserId, memberId],
    );
    return Array.isArray(result.rows[0]?.turns_json) ? result.rows[0].turns_json.slice(-8) : [];
  }

  async function saveConversation(externalUserId, memberId, history, userTurn, assistantTurn) {
    const turns = [...history, userTurn, assistantTurn].slice(-8).map((turn) => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: String(turn.content || "").slice(0, 600),
    }));
    await pool.query(
      `INSERT INTO wecom_customer_conversations (external_userid,member_id,turns_json,updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (external_userid) DO UPDATE
       SET member_id=EXCLUDED.member_id,turns_json=EXCLUDED.turns_json,updated_at=NOW()`,
      [externalUserId, memberId, turns],
    );
  }

  async function downloadMedia(mediaId) {
    const token = await getAccessToken();
    const url = new URL("/cgi-bin/media/get", WECOM_API_ORIGIN);
    url.searchParams.set("access_token", token);
    url.searchParams.set("media_id", mediaId);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    const mimeType = String(response.headers?.get?.("content-type") || "").split(";")[0].toLowerCase();
    if (!response.ok || mimeType === "application/json") {
      const data = await response.json().catch(() => ({}));
      throw providerError(data, response.status, "下载客户图片失败");
    }
    const contentLength = Number(response.headers?.get?.("content-length") || 0);
    if (contentLength > MAX_MEDIA_BYTES) throw publicError(413, "客户图片超过 8 MB");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw publicError(413, "客户图片大小无效");
    return { bytes, mimeType };
  }

  async function sendText({ openKfId, externalUserId, content }) {
    return callApi("/cgi-bin/kf/send_msg", {
      method: "POST",
      body: {
        touser: normalizeId(externalUserId, "客户 external_userid"),
        open_kfid: normalizeId(openKfId, "微信客服账号 ID"),
        msgtype: "text",
        text: { content: String(content || "").trim().slice(0, 1800) },
      },
    });
  }

  async function markReplied(msgId, result) {
    await pool.query(
      "UPDATE wecom_customer_messages SET status='replied',result=$2,error_message=NULL,next_retry_at=NULL,updated_at=NOW() WHERE msg_id=$1",
      [msgId, result],
    );
  }

  async function markFailed(rawMsgId, error) {
    const msgId = String(rawMsgId || "").trim();
    if (!msgId) return;
    const safeMessage = sanitizeError(error);
    await pool.query(
      `UPDATE wecom_customer_messages
       SET status='failed',error_message=$2,
           next_retry_at=NOW() + (LEAST(30, POWER(2, GREATEST(0,attempt_count-1))) * INTERVAL '1 minute'),
           updated_at=NOW()
       WHERE msg_id=$1`,
      [msgId, safeMessage],
    );
    await audit("wecom-customer", "wecom_customer_hermes_failed", { msgId, error: safeMessage });
  }

  async function getAccessToken(force = false) {
    if (!force && accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
    const url = new URL("/cgi-bin/gettoken", WECOM_API_ORIGIN);
    url.searchParams.set("corpid", corpId);
    url.searchParams.set("corpsecret", secret);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || Number(data.errcode || 0) !== 0 || !data.access_token) {
      throw providerError(data, response.status, "获取微信客服 access_token 失败");
    }
    accessToken = String(data.access_token);
    accessTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000;
    return accessToken;
  }

  async function callApi(path, { method = "GET", body } = {}, retry = true) {
    const token = await getAccessToken();
    const url = new URL(path, WECOM_API_ORIGIN);
    url.searchParams.set("access_token", token);
    const response = await fetchImpl(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({}));
    const code = Number(data.errcode || 0);
    if (retry && TOKEN_ERROR_CODES.has(code)) {
      accessToken = "";
      accessTokenExpiresAt = 0;
      await getAccessToken(true);
      return callApi(path, { method, body }, false);
    }
    if (!response.ok || code !== 0) throw providerError(data, response.status, "微信客服接口调用失败");
    return data;
  }

  return { configured, handleEvent, processCustomerMessage, retryFailedMessages, resolveAccount };
}

function normalizePayload(message, msgType) {
  return {
    msgid: normalizeId(message.msgid, "微信客服消息 ID"),
    open_kfid: normalizeId(message.open_kfid, "微信客服账号 ID"),
    external_userid: normalizeId(message.external_userid, "客户 external_userid"),
    origin: 3,
    msgtype: msgType,
    ...(msgType === "text" ? { text: { content: String(message?.text?.content || "").slice(0, 1200) } } : {}),
    ...(msgType === "image" ? { image: { media_id: normalizeId(message?.image?.media_id, "客户图片 media_id") } } : {}),
  };
}

function normalizeId(value, label) {
  const result = String(value || "").trim();
  if (!/^[A-Za-z0-9._@-]{1,256}$/.test(result)) throw publicError(400, `${label} 无效`);
  return result;
}

function normalizeToken(value) {
  const result = String(value || "").trim();
  if (!result || result.length > 1024 || /[\u0000-\u001f\u007f]/.test(result)) throw publicError(400, "微信客服同步 Token 无效");
  return result;
}

function sanitizeError(error) {
  return String(error instanceof Error ? error.message : "客户消息处理失败")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, 400);
}

function providerError(data, status, fallback) {
  const error = new Error(`${fallback}（errcode=${Number(data?.errcode || status || -1)}）`);
  error.statusCode = 502;
  return error;
}

function publicError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
