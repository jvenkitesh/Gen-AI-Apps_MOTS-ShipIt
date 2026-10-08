import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { recordCarrierReply } from "@/lib/freight/negotiation";
import { negotiationErrorResponse } from "@/lib/freight/negotiationErrors";

const bodySchema = z.object({
  carrierId: z.string().uuid(),
  replyText: z.string().trim().min(1, "Paste the carrier's reply.").max(4000, "Keep the reply under 4,000 characters."),
});

// Records a carrier's reply for a load and turns it into an offer (until inbound provider
// webhooks exist, a user pastes the reply here).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["administrator", "supply_chain_operations_manager", "transportation_planner"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid reply." }, { status: 400 });
  }

  try {
    const outcome = await recordCarrierReply({
      supabase: createClient(),
      admin: createAdminClient(),
      loadId: params.id,
      carrierId: parsed.data.carrierId,
      replyText: parsed.data.replyText,
      userId: auth.userId,
    });
    return NextResponse.json(outcome, { status: 200 });
  } catch (err) {
    return negotiationErrorResponse(err, "api/loads/replies");
  }
}
