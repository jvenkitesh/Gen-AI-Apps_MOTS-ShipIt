import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/security/authGuard";
import { resolveEstimate } from "@/lib/estimate/orchestrator";
import { EstimateInputError } from "@/lib/estimate/types";

const estimateRequestSchema = z.object({
  query: z
    .string({ required_error: "Ask a question that includes a US zip code or state." })
    .trim()
    .min(2, "Ask a question that includes a US zip code or state.")
    .max(500, "Keep the question under 500 characters."),
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const parsed = estimateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Check your question and try again." },
      { status: 400 }
    );
  }

  try {
    const result = await resolveEstimate({
      supabase: createClient(),
      rawQuery: parsed.data.query,
      userId: auth.userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof EstimateInputError) {
      return NextResponse.json({ error: "NO_LOCATION", message: err.message }, { status: 400 });
    }
    console.error("[api/estimate] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "ESTIMATE_FAILED", message: "The estimate couldn't be calculated right now. Please try again." },
      { status: 500 }
    );
  }
}
