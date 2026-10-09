import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { carrierReplySchema, parseBody } from "@/lib/security/inputValidator";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rateLimiter";
import { recordCarrierReply } from "@/lib/freight/negotiation";
import { negotiationErrorResponse } from "@/lib/freight/negotiationErrors";

// Records a carrier's reply for a load and turns it into an offer (until inbound provider
// webhooks exist, a user pastes the reply here).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(["administrator", "supply_chain_operations_manager", "transportation_planner"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimit = await checkRateLimit(`user:${auth.userId}`, "carrier_reply");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const body = await parseBody(request, carrierReplySchema);
  if (!body.ok) return body.response;

  try {
    const outcome = await recordCarrierReply({
      supabase: createClient(),
      admin: createAdminClient(),
      loadId: params.id,
      carrierId: body.data.carrierId,
      replyText: body.data.replyText,
      userId: auth.userId,
    });
    return NextResponse.json(outcome, { status: 200 });
  } catch (err) {
    return negotiationErrorResponse(err, "api/loads/replies");
  }
}
