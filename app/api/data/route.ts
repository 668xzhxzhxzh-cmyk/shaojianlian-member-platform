import { getPortalState } from "@/lib/d1";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getPortalState();
    return Response.json({ state }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ state: null, mode: "offline" }, { status: 503 });
  }
}
