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
  if (!member || !title || !content) {
    return Response.json({ error: "消息内容不完整" }, { status: 400 });
  }

  // Sites is the private acceptance environment. The production WeChat channel
  // runs on the mainland ECS loopback network and is intentionally not exposed
  // to the public internet.
  return Response.json({
    sent: false,
    configured: false,
    queued: true,
    channel: "hermes-weixin",
  }, { status: 202 });
}
