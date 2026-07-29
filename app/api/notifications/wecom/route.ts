import { env } from "@/lib/cloudflare-env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { member?: string; title?: string; content?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const member = String(body.member ?? "").slice(0, 40);
  const title = String(body.title ?? "").slice(0, 80);
  const content = String(body.content ?? "").slice(0, 1800);
  if (!member || !title || !content) return Response.json({ error: "消息内容不完整" }, { status: 400 });

  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const webhookValue = runtimeEnv.WECOM_WEBHOOK_URL ?? process.env.WECOM_WEBHOOK_URL;
  if (!webhookValue) {
    return Response.json({ sent: false, configured: false, queued: true }, { status: 202 });
  }

  let webhook: URL;
  try {
    webhook = new URL(webhookValue);
  } catch {
    return Response.json({ error: "企业微信 Webhook 配置无效" }, { status: 500 });
  }
  if (webhook.protocol !== "https:" || webhook.hostname !== "qyapi.weixin.qq.com" || webhook.pathname !== "/cgi-bin/webhook/send") {
    return Response.json({ error: "仅允许企业微信官方 Webhook 地址" }, { status: 500 });
  }

  const response = await fetch(webhook.toString(), {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: {
        content: `### ${escapeMarkdown(title)}\n> 会员：${escapeMarkdown(member)}\n${escapeMarkdown(content)}\n\n<font color=\"comment\">由 Hermes 整理，已由邵教练确认</font>`,
      },
    }),
  });
  const result = await response.json().catch(() => ({})) as { errcode?: number; errmsg?: string };
  if (!response.ok || result.errcode !== 0) {
    return Response.json({ sent: false, error: result.errmsg ?? "企业微信发送失败" }, { status: 502 });
  }
  return Response.json({ sent: true, channel: "wecom" });
}

function escapeMarkdown(value: string) {
  return value.replace(/[<>]/g, "").replace(/[`]/g, "ˋ");
}
