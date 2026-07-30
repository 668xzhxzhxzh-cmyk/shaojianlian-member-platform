export const runtime = "edge";

export async function POST(request: Request) {
  void request;
  return Response.json(
    { error: "Hermes 仅供生产环境中已登录的教练与管理员使用" },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}
