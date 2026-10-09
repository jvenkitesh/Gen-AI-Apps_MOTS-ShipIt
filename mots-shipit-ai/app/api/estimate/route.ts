import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/security/authGuard";
import { estimateRequestSchema, parseBody } from "@/lib/security/inputValidator";
import { sanitizeForLLM } from "@/lib/security/promptInjectionGuard";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rateLimiter";
import { resolveEstimate } from "@/lib/estimate/orchestrator";
import { EstimateInputError } from "@/lib/estimate/types";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const rateLimit = await checkRateLimit(`user:${auth.userId}`, "estimate");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const body = await parseBody(request, estimateRequestSchema);
  if (!body.ok) return body.response;

  // The question is sent to the model with the answer's facts, so it is checked first.
  const check = sanitizeForLLM(body.data.query);
  if (!check.safe) {
    console.warn("[api/estimate] prompt injection blocked:", check.reasons.join(","));
    return NextResponse.json(
      { error: "PROMPT_INJECTION", message: "Ask about freight cost or transit time for a US zip code or state." },
      { status: 400 }
    );
  }

  try {
    const result = await resolveEstimate({
      supabase: createClient(),
      rawQuery: check.text,
      userId: auth.userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof EstimateInputError) {
      return NextResponse.json({ error: "NO_LOCATION", message: err.message }, { status: 422 });
    }
    console.error("[api/estimate] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "ESTIMATE_FAILED", message: "The estimate couldn't be calculated right now. Please try again." },
      { status: 500 }
    );
  }
}
