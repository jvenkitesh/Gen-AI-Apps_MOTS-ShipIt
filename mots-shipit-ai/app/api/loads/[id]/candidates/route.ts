import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/security/authGuard";
import { LoadNotFoundError, LoadNotRankableError, rankCandidates } from "@/lib/freight/rankCandidates";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await rankCandidates(createClient(), params.id);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof LoadNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Load not found." }, { status: 404 });
    }
    if (err instanceof LoadNotRankableError) {
      return NextResponse.json({ error: "LOAD_NOT_ELIGIBLE", message: err.message }, { status: 409 });
    }
    console.error("[api/loads/candidates] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "RANKING_FAILED", message: "Carrier candidates couldn't be ranked." }, { status: 500 });
  }
}
