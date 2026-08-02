const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
const TOKEN_ERROR_CODES = new Set([40014, 42001]);
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export function createWecomCustomerService({
  pool,
  visionService,
  replyService,
  audit = async () => {},
  fetchImpl = fetch,
} = {}) {
  const corpId = String(process.env.WECOM_CORP_ID || "").trim();
  const secret = String(process.env.WECOM_KF_SECRET || "").trim();
  const configuredOpenKfId = String(process.env.WECOM_KF_OPEN_KFID || "").trim();
  let accessToken = "";
  let accessTokenExpiresAt = 0;
  const configured = Boolean(
    corpId
    && secret
    && configuredOpenKfId
    && pool
    && visionService?.configured
    && replyService?.configured,
  );

  async function handleEvent(message) {
    if (!configured) throw publicError(503, "企业微信客服接口尚未配置");
    const openKfId = normalizeId(message.openKfId, "微信客服账号 ID");
    if (openKfId !== configuredOpenKfId) throw publicError(403, "微信客服账号不匹配");
    const syncToken = normalizeToken(message.kfToken);
    let cursor = "";
    let processed = 0;
    let hasMore = false;
    for (let page = 0; page < 10; page += 1) {
      const data = await callApi("/cgi-bin/kf/sync_msg", {
        method: "POST",
        body: { cursor, token: syncToken, limit: 1000, voice_format: 0, open_kfid: openKfId },
      });
      const messages = Array.isArray(data.msg_list) ? data.msg_list : [];
      processed += messages.length;
      for (const item of messages) {
        if (String(item?.open_kfid || "") !== openKfId || Number(item?.origin) !== 3) continue;
        await processCustomerMessage(item).catch(async (error) => {
          await markFailed(item?.msgid, error);
        });
      }
      hasMore = Number(data.has_more || 0) === 1;
      cursor = String(data.next_cursor || "");
      if (!hasMore || !cursor) break;
    }
    return { processed, hasMore };
  }

  async function processCustomerMessage(message) {
    const msgId = normalizeId(message.msgid, "微信客服消息 ID");
    const externalUserId = normalizeId(message.external_userid, "客户 external_userid");
    const msgType = String(message.msgtype || "").trim().toLowerCase();
    const claimed = await pool.query(
      `INSERT INTO wecom_customer_messages (msg_id,external_userid,open_kfid,msg_type,status)
       VALUES ($1,$2,$3,$4,'processing')
       ON CONFLICT (msg_id) DO NOTHING
       RETURNING msg_id`,
      [msgId, externalUserId, configuredOpenKfId, msgType || "unknown"],
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
      await sendText({ externalUserId, content: "当前微信尚未绑定会员档案，请联系邵教练完成绑定后再查询。" });
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
      imageDescription = await visionService.analyzeImage(media);
      customerText = "请结合我发送的图片和会员档案回答。";
    } else {
      await sendText({ externalUserId, content: "我目前可以理解文字和图片，请改用这两种方式发送。" });
      await markReplied(msgId, "unsupported");
      return { unsupported: true };
    }

    const content = await replyService.reply({
      memberName: member.name,
      memberState: member.state_json,
      customerText,
      imageDescription,
    });
    await sendText({ externalUserId, content });
    await markReplied(msgId, "replied");
    await audit(externalUserId, "wecom_customer_hermes_replied", {
      memberId: member.id,
      msgType,
      msgId,
      replyLength: Array.from(content).length,
    });
    return { replied: true, memberId: member.id };
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

  async function sendText({ externalUserId, content }) {
    return callApi("/cgi-bin/kf/send_msg", {
      method: "POST",
      body: {
        touser: normalizeId(externalUserId, "客户 external_userid"),
        open_kfid: configuredOpenKfId,
        msgtype: "text",
        text: { content: String(content || "").trim().slice(0, 1800) },
      },
    });
  }

  async function markReplied(msgId, result) {
    await pool.query(
      "UPDATE wecom_customer_messages SET status='replied',result=$2,error_message=NULL,updated_at=NOW() WHERE msg_id=$1",
      [msgId, result],
    );
  }

  async function markFailed(rawMsgId, error) {
    const msgId = String(rawMsgId || "").trim();
    if (!msgId) return;
    const safeMessage = error instanceof Error ? error.message.slice(0, 400) : "客户消息处理失败";
    await pool.query(
      "UPDATE wecom_customer_messages SET status='failed',error_message=$2,updated_at=NOW() WHERE msg_id=$1",
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

  return { configured, handleEvent, processCustomerMessage };
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
