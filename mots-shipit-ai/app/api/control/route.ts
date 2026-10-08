import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { activePauses, applyControlAction, CONTROL_SCOPES } from "@/lib/freight/controlPlane";

// The PRD names the Supply Chain (Strategic) Operations Manager as the control-plane role.
const CONTROL_ROLES = ["administrator", "supply_chain_operations_manager"] as const;

const bodySchema = z
  .object({
    scope: z.enum(CONTROL_SCOPES),
    scopeId: z.string().trim().min(1).max(100).nullable().optional(),
    action: z.enum(["pause", "resume", "override", "cancel"]),
    reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(1000),
  })
  .refine((b) => (b.scope === "global") === !b.scopeId, {
    message: "Global needs no target; every other scope needs one.",
    path: ["scopeId"],
  });

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid control action." }, { status: 400 });
  }
  try {
    const controlAction = await applyControlAction(createAdminClient(), {
      actorId: auth.userId,
      scope: parsed.data.scope,
      scopeId: parsed.data.scope === "global" ? null : parsed.data.scopeId ?? null,
      action: parsed.data.action,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ controlAction }, { status: 201 });
  } catch (err) {
    console.error("[api/control] write failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "FAILED", message: "The control action couldn't be saved." }, { status: 500 });
  }
}
