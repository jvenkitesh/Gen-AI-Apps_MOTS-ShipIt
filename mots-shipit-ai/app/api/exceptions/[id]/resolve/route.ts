import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { exceptionResolutionSchema, parseBody } from "@/lib/security/inputValidator";
import { resolveException } from "@/lib/freight/exceptions";

// Offer decisions (approve/counter/reject) happen on the load page; here a person records
// how the exception was handled, or escalates it.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["administrator", "supply_chain_operations_manager", "transportation_planner", "compliance_analyst"]);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody(request, exceptionResolutionSchema);
  if (!body.ok) return body.response;
  try {
    const exception = await resolveException(createAdminClient(), {
      exceptionId: params.id,
      resolverId: auth.userId,
      action: body.data.action,
      resolution: body.data.resolution,
    });
    return NextResponse.json({ exception }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_OPEN") {
      return NextResponse.json({ error: "NOT_OPEN", message: "This exception is already resolved or doesn't exist." }, { status: 409 });
    }
    console.error("[api/exceptions/resolve] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "FAILED", message: "The exception couldn't be updated." }, { status: 500 });
  }
}
