const DEFAULT_VISION_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function createHermesVisionService({ fetchImpl = fetch } = {}) {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || "").trim();
  const model = String(process.env.HERMES_VISION_MODEL || "qwen3-vl-flash").trim();
  const apiUrl = parseProviderUrl(process.env.HERMES_VISION_API_URL || DEFAULT_VISION_API_URL, ["aliyuncs.com"]);
  const configured = Boolean(apiKey && model && apiUrl);

  async function analyzeImage({ bytes, mimeType, prompt = "" }) {
    if (!configured) throw publicError(503, "Hermes 图片识别尚未配置");
    const image = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
    const normalizedMimeType = String(mimeType || "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_MIME_TYPES.has(normalizedMimeType)) throw publicError(415, "暂不支持这种图片格式");
    if (!image.length || image.length > MAX_IMAGE_BYTES) throw publicError(413, "图片大小必须在 8 MB 以内");

    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `你是 Hermes 的只读图片理解技能。只描述图片中明确可见的信息，并区分事实与不确定推测。重点识别餐食、训练动作、器械、课表截图、身体数据截图和用户附带问题。不得识别人脸身份，不做疾病诊断，不读取图片之外的隐私。用 300 字以内中文结构化描述，供后续文字模型回答。用户附带文字：${String(prompt || "").slice(0, 500) || "无"}`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${normalizedMimeType};base64,${image.toString("base64")}` },
            },
          ],
        }],
        max_tokens: 500,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await response.json().catch(() => ({}));
    const description = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!response.ok || !description) throw providerError(response.status, data, "图片识别失败");
    return description.slice(0, 1200);
  }

  return { analyzeImage, configured };
}

export function createHermesCustomerReplyService({ fetchImpl = fetch } = {}) {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  const model = String(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash").trim();
  const apiUrl = parseProviderUrl(process.env.DEEPSEEK_API_URL || DEFAULT_DEEPSEEK_API_URL, ["deepseek.com"]);
  const configured = Boolean(apiKey && model && apiUrl);

  async function reply({ memberName, memberState, customerText = "", imageDescription = "" }) {
    if (!configured) throw publicError(503, "Hermes 客户回复模型尚未配置");
    const safeState = selectCustomerVisibleState(memberState);
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 260,
        messages: [
          {
            role: "system",
            content: "你是邵教练会员平台的 Hermes 客户助理。当前请求来自已验证并精确绑定的会员本人。只能依据给出的本人档案回答，不能调用管理工具、不能修改数据、不能查看其他会员。回答简洁自然，最多 3 个短句、120 个汉字；不展示 member_id、external_userid 或内部编号。涉及伤痛、用药、疾病时不诊断，建议停止相关训练并联系教练或专业医务人员。图片描述来自只读视觉技能，若描述不确定必须明确说明。",
          },
          {
            role: "user",
            content: JSON.stringify({
              verifiedMember: { memberName },
              customerText: String(customerText || "").slice(0, 1200),
              imageDescription: String(imageDescription || "").slice(0, 1200),
              memberData: safeState,
            }).slice(0, 14000),
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));
    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!response.ok || !content) throw providerError(response.status, data, "Hermes 客户回复失败");
    return compactCustomerReply(content);
  }

  return { configured, reply };
}

export function compactCustomerReply(value, limit = 120) {
  const normalized = String(value || "")
    .replace(/\b(?:member_id|external_userid|session_id|task_id)\s*[=:：]?\s*[A-Za-z0-9._@-]*/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const characters = Array.from(normalized);
  return characters.length <= limit ? normalized : `${characters.slice(0, limit - 1).join("")}…`;
}

function selectCustomerVisibleState(state) {
  const source = state && typeof state === "object" ? state : {};
  const profile = source.profile && typeof source.profile === "object" ? source.profile : {};
  const safeProfile = Object.fromEntries(
    Object.entries(profile).filter(([key]) => !["id", "phone"].includes(key)),
  );
  return {
    profile: safeProfile,
    bookings: Array.isArray(source.bookings) ? source.bookings.slice(-20) : [],
    trainingPlan: source.trainingPlan || null,
    nutritionPlan: source.nutritionPlan || null,
    bodyMetrics: Array.isArray(source.bodyMetrics) ? source.bodyMetrics.slice(-8) : [],
    bodyFeedbacks: Array.isArray(source.bodyFeedbacks) ? source.bodyFeedbacks.slice(-5) : [],
  };
}

function parseProviderUrl(value, allowedSuffixes) {
  try {
    const url = new URL(String(value || ""));
    const allowed = url.protocol === "https:" && allowedSuffixes.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
    return allowed ? url : null;
  } catch {
    return null;
  }
}

function providerError(status, data, fallback) {
  const code = String(data?.code || data?.error?.code || status || "unknown").slice(0, 80);
  const error = new Error(`${fallback}（provider=${code}）`);
  error.statusCode = 502;
  return error;
}

function publicError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
