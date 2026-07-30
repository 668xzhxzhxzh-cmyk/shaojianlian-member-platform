export const runtime = "edge";

export function GET() {
  return Response.json({
    demo: true,
    users: [
      { id: "member-li", name: "李明", phone: "138****5206", role: "member", status: "active" },
      { id: "coach-shao", name: "邵教练", phone: "138****6608", role: "coach", status: "active" },
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
