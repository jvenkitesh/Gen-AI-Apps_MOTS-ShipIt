import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { contactBatch, OutreachBlockedError } from "@/lib/freight/outreach";

const bodySchema = z.object({ batchSize: z.number().int().min(1).max(10).default(3) });

// Roles that may contact carriers. Compliance analysts and viewers can only read.
const OUTREACH_ROLES = ["administrator", "supply_chain_operations_manager", "transportation_planner"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...OUTREACH_ROLES]);
  if (auth instanceof NextResponse) return auth;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "NOT_CONFIGURED", message: "Outreach is not configured." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "batchSize must be a whole number from 1 to 10." }, { status: 400 });
  }

  try {
    const result = await contactBatch({
      supabase: createClient(),
      admin: createAdminClient(),
      loadId: params.id,
      batchSize: parsed.data.batchSize,
      userId: auth.userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof OutreachBlockedError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "BATCH_WAIT" ? 429 : 409;
      const headers = err.retryAfterSeconds ? { "Retry-After": String(err.retryAfterSeconds) } : undefined;
      return NextResponse.json({ error: err.code, message: err.message }, { status, headers });
    }
    console.error("[api/loads/outreach] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "OUTREACH_FAILED", message: "Carriers couldn't be contacted. Please try again." }, { status: 500 });
  }
}
