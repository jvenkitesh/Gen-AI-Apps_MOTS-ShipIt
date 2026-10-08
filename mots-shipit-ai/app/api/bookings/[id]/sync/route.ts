import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { BookingError, syncBookingToTms } from "@/lib/freight/booking";

// Manual retry of the TMS write-back for a booking whose sync failed.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["administrator", "supply_chain_operations_manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const booking = await syncBookingToTms(createAdminClient(), params.id);
    return NextResponse.json({ booking }, { status: 200 });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.httpStatus });
    }
    console.error("[api/bookings/sync] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "SYNC_FAILED", message: "The TMS sync couldn't be retried." }, { status: 500 });
  }
}
