import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { getFreshCompliance, recordManualCheck } from "@/lib/freight/compliance";

// Fresh check -> 200. Stale or unavailable -> 409, which the UI must show as a hard block.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const status = await getFreshCompliance(createAdminClient(), params.id);
  if (status.state === "stale") {
    return NextResponse.json(
      { error: "compliance_data_stale", lastCheckedAt: status.lastCheckedAt, message: status.reason },
      { status: 409 }
    );
  }
  return NextResponse.json({ snapshot: status.check }, { status: 200 });
}

const manualSchema = z.object({
  result: z.enum(["pass", "block"]),
  authorityActive: z.boolean(),
  insuranceValid: z.boolean(),
  note: z.string().trim().min(3, "Say how you verified the carrier.").max(1000),
});

// A compliance analyst or administrator records a manual verification.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["compliance_analyst", "administrator"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = manualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid check." }, { status: 400 });
  }
  try {
    const check = await recordManualCheck(createAdminClient(), { carrierId: params.id, ...parsed.data, userId: auth.userId });
    return NextResponse.json({ snapshot: check }, { status: 201 });
  } catch (err) {
    console.error("[api/carriers/compliance] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "FAILED", message: "The compliance check couldn't be saved." }, { status: 500 });
  }
}
