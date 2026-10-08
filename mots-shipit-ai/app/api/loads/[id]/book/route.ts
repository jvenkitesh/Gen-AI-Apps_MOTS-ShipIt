import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { BookingError, commitBooking } from "@/lib/freight/booking";

const bodySchema = z.object({
  offerId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(100),
});

// Assisted booking: a person books an accepted offer. A retry with the same key returns the
// same booking (200), never a second one.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["administrator", "supply_chain_operations_manager", "transportation_planner"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "offerId and idempotencyKey are required." }, { status: 400 });
  }

  try {
    const { booking, outcome } = await commitBooking({
      admin: createAdminClient(),
      loadId: params.id,
      offerId: parsed.data.offerId,
      idempotencyKey: parsed.data.idempotencyKey,
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
