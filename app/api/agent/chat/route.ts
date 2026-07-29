export const runtime = "edge";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    member?: { name?: string };
    messages?: Array<{ content?: string }>;
  };
  const name = body.member?.name || "会员";
  const question = body.messages?.at(-1)?.content || "本周训练恢复情况";
  const reply = `Hermes 已收到关于${name}的任务：“${question}”。展示环境会以脱敏数据演示分析流程；阿里云生产环境将由 deepseek-v4-flash 结合训练、饮食、身体与打卡数据生成实时建议，并由邵教练确认后发送。`;

  return new Response(reply, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
