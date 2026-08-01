import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 1024 * 1024;

export function createWecomCallbackService({ onMessage, onContactEvent } = {}) {
  const token = String(process.env.WECOM_CALLBACK_TOKEN || "").trim();
  const encodingAesKey = String(process.env.WECOM_CALLBACK_AES_KEY || "").trim();
  const expectedReceiverId = String(process.env.WECOM_CORP_ID || "").trim();
  const allowedCoachUserIds = new Set(
    String(process.env.WECOM_ALLOWED_COACH_USERIDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const aesKey = decodeEncodingAesKey(encodingAesKey);
  const callbackConfigured = Boolean(token && aesKey);

  async function handle(request, response, url) {
    if (!callbackConfigured) {
      return sendText(response, 503, "企业微信接收消息回调尚未配置");
    }
    if (request.method === "GET") {
      const encryptedEcho = requireQuery(url, "echostr", 4096);
      const signature = requireSignatureQuery(url);
      const timestamp = requireQuery(url, "timestamp", 20);
      const nonce = requireQuery(url, "nonce", 256);
      verifySignature({ token, timestamp, nonce, encrypted: encryptedEcho, signature });
      const payload = decryptPayload(encryptedEcho, aesKey);
      verifyReceiverId(payload.receiverId, expectedReceiverId);
      return sendText(response, 200, payload.message);
    }
    if (request.method === "POST") {
      const body = await readBody(request);
      const encrypted = extractXmlText(body, "Encrypt");
      if (!encrypted) throw publicError(400, "回调消息缺少 Encrypt");
      const signature = requireSignatureQuery(url);
      const timestamp = requireQuery(url, "timestamp", 20);
      const nonce = requireQuery(url, "nonce", 256);
      verifySignature({ token, timestamp, nonce, encrypted, signature });
      const payload = decryptPayload(encrypted, aesKey);
      verifyReceiverId(payload.receiverId, expectedReceiverId);
      const message = parseMessageXml(payload.message);

      const isContactEvent = message.msgType === "event"
        && message.event === "change_external_contact";
      if (isContactEvent
        && typeof onContactEvent === "function"
        && allowedCoachUserIds.has(message.userId)) {
        Promise.resolve(onContactEvent({ ...message, receiverId: payload.receiverId }))
          .catch((error) => console.error(JSON.stringify({
            level: "error",
            integration: "wecom_contact_callback",
            message: error instanceof Error ? error.message : String(error),
          })));
      } else if (typeof onMessage === "function" && allowedCoachUserIds.has(message.fromUserName)) {
        Promise.resolve(onMessage({ ...message, receiverId: payload.receiverId }))
          .catch((error) => console.error(JSON.stringify({
            level: "error",
            integration: "wecom_callback",
            message: error instanceof Error ? error.message : String(error),
          })));
      }
      return sendText(response, 200, "success");
    }
    response.setHeader("allow", "GET, POST");
    return sendText(response, 405, "请求方法不支持");
  }

  return { callbackConfigured, handle };
}

export function calculateWecomSignature(token, timestamp, nonce, encrypted) {
  return createHash("sha1")
    .update([token, timestamp, nonce, encrypted].map(String).sort().join(""), "utf8")
    .digest("hex");
}

function verifySignature({ token, timestamp, nonce, encrypted, signature }) {
  if (!/^\d{1,20}$/.test(timestamp) || !nonce || nonce.length > 256) {
    throw publicError(400, "企业微信回调参数无效");
  }
  const expected = Buffer.from(calculateWecomSignature(token, timestamp, nonce, encrypted), "ascii");
  const provided = Buffer.from(String(signature || "").toLowerCase(), "ascii");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw publicError(403, "企业微信回调签名无效");
  }
}

function decodeEncodingAesKey(value) {
  if (!/^[A-Za-z0-9+/]{43}$/.test(value)) return null;
  const key = Buffer.from(`${value}=`, "base64");
  return key.length === 32 ? key : null;
}

function decryptPayload(encrypted, aesKey) {
  let ciphertext;
  try {
    ciphertext = Buffer.from(String(encrypted), "base64");
  } catch {
    throw publicError(400, "企业微信回调密文格式无效");
  }
  if (!ciphertext.length || ciphertext.length % 16 !== 0) {
    throw publicError(400, "企业微信回调密文格式无效");
  }
  let padded;
  try {
    const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
    decipher.setAutoPadding(false);
    padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw publicError(400, "企业微信回调 AES 解密失败");
  }
  const plain = removePkcs7Padding(padded);
  if (plain.length < 20) throw publicError(400, "企业微信回调明文无效");
  const messageLength = plain.readUInt32BE(16);
  const messageStart = 20;
  const messageEnd = messageStart + messageLength;
  if (messageLength < 1 || messageEnd > plain.length) {
    throw publicError(400, "企业微信回调消息长度无效");
  }
  return {
    message: plain.subarray(messageStart, messageEnd).toString("utf8"),
    receiverId: plain.subarray(messageEnd).toString("utf8"),
  };
}

function removePkcs7Padding(buffer) {
  if (!buffer.length) throw publicError(400, "企业微信回调填充无效");
  const pad = buffer[buffer.length - 1];
  if (pad < 1 || pad > 32 || pad > buffer.length) {
    throw publicError(400, "企业微信回调填充无效");
  }
  for (let index = buffer.length - pad; index < buffer.length; index += 1) {
    if (buffer[index] !== pad) throw publicError(400, "企业微信回调填充无效");
  }
  return buffer.subarray(0, buffer.length - pad);
}

function verifyReceiverId(actual, expected) {
  if (!expected) return;
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw publicError(403, "企业微信回调接收方不匹配");
  }
}

function requireSignatureQuery(url) {
  const value = String(url.searchParams.get("msg_signature") || url.searchParams.get("msgsignature") || "");
  if (!/^[0-9a-fA-F]{40}$/.test(value)) throw publicError(400, "企业微信回调签名参数无效");
  return value;
}

function requireQuery(url, name, maxLength) {
  const value = String(url.searchParams.get(name) || "");
  if (!value || value.length > maxLength) throw publicError(400, `企业微信回调缺少 ${name}`);
  return value;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw publicError(413, "企业微信回调消息过大");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseMessageXml(xml) {
  return {
    toUserName: extractXmlText(xml, "ToUserName"),
    fromUserName: extractXmlText(xml, "FromUserName"),
    createTime: extractXmlText(xml, "CreateTime"),
    msgType: extractXmlText(xml, "MsgType").toLowerCase(),
    content: extractXmlText(xml, "Content").slice(0, 4000),
    event: extractXmlText(xml, "Event").toLowerCase(),
    changeType: extractXmlText(xml, "ChangeType").toLowerCase(),
    userId: extractXmlText(xml, "UserID"),
    externalUserId: extractXmlText(xml, "ExternalUserID"),
    state: extractXmlText(xml, "State"),
    welcomeCode: extractXmlText(xml, "WelcomeCode"),
    agentId: extractXmlText(xml, "AgentID"),
    msgId: extractXmlText(xml, "MsgId"),
  };
}

function extractXmlText(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, "i"));
  return xmlUnescape(String(match?.[1] ?? match?.[2] ?? "").trim());
}

function xmlUnescape(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function sendText(response, status, body) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(String(body));
}

function publicError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
