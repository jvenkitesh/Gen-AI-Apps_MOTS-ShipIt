import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestLoad, tmsLoadPayloadSchema, UnknownCustomerError } from "@/lib/freight/loadIntake";
import { validationErrorResponse } from "@/lib/security/inputValidator";

export const runtime = "nodejs";

// Constant-time comparison; hashing first makes both sides the same length.
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Service-to-service: the TMS posts a sourcing-ready load. Not a signed-in user request.
export async function POST(request: Request) {
  const expectedSecret = process.env.TMS_WEBHOOK_SECRET;
  if (!expectedSecret || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[loads/webhook] TMS_WEBHOOK_SECRET or SUPABASE_SERVICE_ROLE_KEY is not configured.");
    return NextResponse.json({ error: "NOT_CONFIGURED", message: "Load intake is not configured." }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-tms-webhook-secret"), expectedSecret)) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Missing or invalid webhook secret." }, { status: 401 });
  }

  const parsed = tmsLoadPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  try {
    const result = await ingestLoad(createAdminClient(), parsed.data);
    return NextResponse.json(
      {
        load_id: result.loadId,
        version: result.version,
        outcome: result.outcome,
        status: result.status,
        eligible: result.eligibility.eligible,
        reason_codes: result.eligibility.reasonCodes,
      },
      { status: result.outcome === "created" ? 201 : 200 }
    );
  } catch (err) {
    if (err instanceof UnknownCustomerError) {
      return NextResponse.json({ error: "UNKNOWN_CUSTOMER", field: "customer_id", message: err.message }, { status: 422 });
    }
    console.error("[loads/webhook] intake failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "INTAKE_FAILED", message: "The load could not be stored. Retry the webhook." }, { status: 500 });
  }
}
