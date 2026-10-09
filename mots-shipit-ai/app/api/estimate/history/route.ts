import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/security/authGuard";
import { TOKEN_LIMITS } from "@/lib/security/tokenLimiter";

// The signed-in user's recent questions (RLS limits rows to their own), newest first.
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await createClient()
    .schema("transportation_shipment")
    .from("load_estimate_enquiries")
    .select("id, enquiry_text, enquired_at, answered_from_cache, load_estimate_cache(answer, sources)")
    .order("enquired_at", { ascending: false })
    .limit(TOKEN_LIMITS.estimateHistoryItems);

  if (error) {
    console.error("[api/estimate/history] failed:", error.code, error.message);
    return NextResponse.json({ error: "HISTORY_FAILED", message: "Your recent estimates couldn't be loaded." }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] }, { status: 200 });
}
