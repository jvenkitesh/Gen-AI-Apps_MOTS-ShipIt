import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { manualComplianceSchema, parseBody } from "@/lib/security/inputValidator";
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

// A compliance analyst or administrator records a manual verification.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["compliance_analyst", "administrator"]);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody(request, manualComplianceSchema);
  if (!body.ok) return body.response;
  try {
    const check = await recordManualCheck(createAdminClient(), { carrierId: params.id, ...body.data, userId: auth.userId });
    return NextResponse.json({ snapshot: check }, { status: 201 });
  } catch (err) {
    console.error("[api/carriers/compliance] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "FAILED", message: "The compliance check couldn't be saved." }, { status: 500 });
  }
}
