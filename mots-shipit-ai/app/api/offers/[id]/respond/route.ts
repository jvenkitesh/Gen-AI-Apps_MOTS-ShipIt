import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { offerResponseSchema, parseBody } from "@/lib/security/inputValidator";
import { respondToOffer } from "@/lib/freight/negotiation";
import { negotiationErrorResponse } from "@/lib/freight/negotiationErrors";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody(request, offerResponseSchema);
  if (!body.ok) return body.response;

  try {
    const offer = await respondToOffer({
      supabase: createClient(),
      admin: createAdminClient(),
      offerId: params.id,
      action: body.data.action,
      counterRateDollars: body.data.counterRateDollars,
      note: body.data.note,
      userId: auth.userId,
      role: auth.role,
    });
    return NextResponse.json({ offer, status: offer.status }, { status: 200 });
  } catch (err) {
    return negotiationErrorResponse(err, "api/offers/respond");
  }
}
