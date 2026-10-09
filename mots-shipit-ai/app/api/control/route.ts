import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { controlActionSchema, parseBody } from "@/lib/security/inputValidator";
import { activePauses, applyControlAction } from "@/lib/freight/controlPlane";

// The PRD names the Supply Chain (Strategic) Operations Manager as the control-plane role.
const CONTROL_ROLES = ["administrator", "supply_chain_operations_manager"] as const;

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ activePauses: await activePauses(createAdminClient()) }, { status: 200 });
  } catch (err) {
    console.error("[api/control] read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "FAILED", message: "Control state couldn't be loaded." }, { status: 500 });
  }
}

// POST covers pause, resume, override and cancel (the spec's POST /api/control/pause and siblings).
export async function POST(request: Request) {
  const auth = await requireAuth([...CONTROL_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody(request, controlActionSchema);
  if (!body.ok) return body.response;
  try {
    const controlAction = await applyControlAction(createAdminClient(), {
      actorId: auth.userId,
      scope: body.data.scope,
      scopeId: body.data.scope === "global" ? null : body.data.scopeId ?? null,
      action: body.data.action,
      reason: body.data.reason,
    });
    return NextResponse.json({ controlAction }, { status: 201 });
  } catch (err) {
    console.error("[api/control] write failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "FAILED", message: "The control action couldn't be saved." }, { status: 500 });
  }
}
