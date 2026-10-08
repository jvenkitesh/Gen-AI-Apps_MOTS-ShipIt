import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/security/authGuard";
import { respondToOffer } from "@/lib/freight/negotiation";
import { negotiationErrorResponse } from "@/lib/freight/negotiationErrors";

const bodySchema = z.object({
  action: z.enum(["approve", "counter", "reject"]),
  counterRateDollars: z.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Choose approve, counter or reject." }, { status: 400 });
  }

  try {
    const offer = await respondToOffer({
      supabase: createClient(),
      admin: createAdminClient(),
      offerId: params.id,
      action: parsed.data.action,
      counterRateDollars: parsed.data.counterRateDollars,
      note: parsed.data.note,
      userId: auth.userId,
      role: auth.role,
    });
    return NextResponse.json({ offer, status: offer.status }, { status: 200 });
  } catch (err) {
    return negotiationErrorResponse(err, "api/offers/respond");
  }
}
