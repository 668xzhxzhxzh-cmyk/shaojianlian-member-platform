export const runtime = "edge";

export function GET() {
  return Response.json({
    demo: true,
    users: [
      { name: "李明", role: "member", status: "active" },
      { name: "邵教练", role: "coach", status: "active" },
    ],
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { name?: string; role?: string };
  return Response.json({
    demo: true,
    user: { name: body.name || "新用户", role: body.role || "member" },
    temporaryPassword: "Demo-Only-2026",
  }, { status: 201 });
}
