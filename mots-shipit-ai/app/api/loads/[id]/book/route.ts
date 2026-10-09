import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { bookingRequestSchema, parseBody } from "@/lib/security/inputValidator";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rateLimiter";
import { BookingError, commitBooking } from "@/lib/freight/booking";

// Assisted booking: a person books an accepted offer. A retry with the same key returns the
// same booking (200), never a second one.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["administrator", "supply_chain_operations_manager", "transportation_planner"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimit = await checkRateLimit(`user:${auth.userId}`, "booking");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const body = await parseBody(request, bookingRequestSchema);
  if (!body.ok) return body.response;

  try {
    const { booking, outcome } = await commitBooking({
      admin: createAdminClient(),
      loadId: params.id,
      offerId: body.data.offerId,
      idempotencyKey: body.data.idempotencyKey,
      userId: auth.userId,
    });
    return NextResponse.json({ booking, outcome }, { status: outcome === "created" ? 201 : 200 });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.httpStatus });
    }
    console.error("[api/loads/book] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "BOOKING_FAILED", message: "The booking couldn't be completed. Please try again." }, { status: 500 });
  }
}
