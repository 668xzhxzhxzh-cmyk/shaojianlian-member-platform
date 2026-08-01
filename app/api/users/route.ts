export const runtime = "edge";

export function GET() {
  return Response.json({
    demo: true,
    users: [
      { id: "member-li", name: "李明远", phone: "138****5206", role: "member", status: "active" },
      { id: "member-wang", name: "王雨桐", phone: "136****1183", role: "member", status: "active" },
      { id: "member-zhang", name: "张小北", phone: "159****9021", role: "member", status: "active" },
      { id: "member-chen", name: "陈思颖", phone: "158****3378", role: "member", status: "active" },
      { id: "member-liu", name: "刘一航", phone: "137****6152", role: "member", status: "active" },
      { id: "coach-shao", name: "邵教练", phone: "138****6608", role: "coach", status: "active" },
      { id: "admin-shao", name: "系统管理员", phone: "138****8808", role: "admin", status: "active" },
    ],
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { name?: string; role?: string };
  return Response.json({
    demo: true,
    user: { id: "member-demo", name: body.name || "新用户", role: body.role || "member" },
    temporaryPassword: "Demo-Only-2026",
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({})) as { id?: string; role?: string; status?: string };
  if (!body.id) return Response.json({ error: "缺少用户 ID" }, { status: 400 });
  return Response.json({
    demo: true,
    user: {
      id: body.id,
      role: body.role || "member",
      status: body.status || "active",
    },
  });
}
