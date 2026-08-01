const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
const TOKEN_ERROR_CODES = new Set([40014, 42001]);

export function createWecomAppService({ fetchImpl = fetch } = {}) {
  const corpId = String(process.env.WECOM_CORP_ID || "").trim();
  const appSecret = String(process.env.WECOM_APP_SECRET || "").trim();
  const configuredAgentId = String(process.env.WECOM_APP_AGENT_ID || "").trim();
  let accessToken = "";
  let accessTokenExpiresAt = 0;

  const appConfigured = Boolean(corpId && appSecret && configuredAgentId);

  async function sendText({ toUserId, content, agentId = configuredAgentId }) {
    if (!appConfigured) throw publicError(503, "企业微信自建应用消息接口尚未配置");
    const safeUserId = normalizeId(toUserId, "企业微信 userid");
    const safeAgentId = normalizeAgentId(agentId);
    if (safeAgentId !== configuredAgentId) throw publicError(403, "企业微信应用 AgentID 不匹配");
    const chunks = splitUtf8(String(content || "").trim(), 1800);
    if (!chunks.length) throw publicError(400, "Hermes 没有返回可发送的文字内容");
    const results = [];
    for (const chunk of chunks) {
      results.push(await callApi("/cgi-bin/message/send", {
        method: "POST",
        body: {
          touser: safeUserId,
          msgtype: "text",
          agentid: Number(safeAgentId),
          text: { content: chunk },
          safe: 0,
          enable_duplicate_check: 1,
          duplicate_check_interval: 1800,
        },
      }));
    }
    return results;
  }

  async function getAccessToken(force = false) {
    if (!force && accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
    const url = new URL("/cgi-bin/gettoken", WECOM_API_ORIGIN);
    url.searchParams.set("corpid", corpId);
    url.searchParams.set("corpsecret", appSecret);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || Number(data.errcode || 0) !== 0 || !data.access_token) {
      throw providerError(data, response.status, "获取企业微信自建应用 access_token 失败");
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
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    const code = Number(data.errcode || 0);
    if (retry && TOKEN_ERROR_CODES.has(code)) {
      accessToken = "";
      accessTokenExpiresAt = 0;
      await getAccessToken(true);
      return callApi(path, { method, body }, false);
    }
    if (!response.ok || code !== 0) throw providerError(data, response.status, "企业微信自建应用发送失败");
    return data;
  }

  return { appConfigured, sendText };
}

function splitUtf8(value, maxBytes) {
  const chunks = [];
  let current = "";
  let currentBytes = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (current && currentBytes + bytes > maxBytes) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += bytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

function normalizeId(value, label) {
  const result = String(value || "").trim();
  if (!/^[A-Za-z0-9._@-]{1,128}$/.test(result)) throw publicError(400, `${label} 无效`);
  return result;
}

function normalizeAgentId(value) {
  const result = String(value || "").trim();
  if (!/^\d{1,20}$/.test(result)) throw publicError(400, "企业微信 AgentID 无效");
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
