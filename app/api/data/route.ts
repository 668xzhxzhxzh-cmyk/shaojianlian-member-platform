import { getPortalState } from "@/lib/d1";
import { demoState, memberRows } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const memberId = new URL(request.url).searchParams.get("member_id");
    const demoMember = memberRows.find((member) => member.id === memberId);
    if (demoMember && demoMember.id !== demoState.profile.id) {
      const state = JSON.parse(JSON.stringify(demoState)) as typeof demoState;
      state.profile = {
        ...state.profile,
        id: demoMember.id,
        name: demoMember.name,
        phone: demoMember.phone,
        plan: demoMember.plan,
      };
      state.trainingPlan.goal = demoMember.goal;
      return Response.json({ state, demo: true }, { headers: { "cache-control": "no-store" } });
    }
    const state = await getPortalState();
    return Response.json({ state }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ state: null, mode: "offline" }, { status: 503 });
  }
}
