export const runtime = "edge";

export function GET() {
  return Response.json({
    demo: true,
    note: "Sites 展示环境不承载真实会员数据；生产环境由阿里云 API 接管登录。",
  });
}
