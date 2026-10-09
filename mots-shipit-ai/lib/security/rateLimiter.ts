import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitAction = "auth" | "estimate" | "booking" | "carrier_reply" | "webhook";

// Sliding-window limits from specs/auth-rbac.md. webhook has no limit until a real TMS is chosen.
// carrier_reply (Stage 7): each pasted reply is an OpenAI call, so it is capped like estimates.
const LIMITS: Record<Exclude<RateLimitAction, "webhook">, { maxRequests: number; windowSeconds: number }> = {
  auth: { maxRequests: 10, windowSeconds: 60 },
  estimate: { maxRequests: 30, windowSeconds: 60 },
  booking: { maxRequests: 5, windowSeconds: 3600 },
  carrier_reply: { maxRequests: 30, windowSeconds: 60 },
};

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number };

let warnedMissingKey = false;

// identifier: "ip:<address>" before sign-in, "user:<uuid>" after -- never a bare user id,
// so failed logins against accounts that don't exist are still counted.
export async function checkRateLimit(identifier: string, action: RateLimitAction): Promise<RateLimitResult> {
  if (action === "webhook") return { allowed: true };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!warnedMissingKey) {
      console.warn("[rateLimiter] SUPABASE_SERVICE_ROLE_KEY is not set -- rate limiting is OFF.");
      warnedMissingKey = true;
    }
    return { allowed: true };
  }

  const { maxRequests, windowSeconds } = LIMITS[action];
  const { data, error } = await createAdminClient()
    .schema("operational_excellence_governance")
    .rpc("check_rate_limit", {
      p_identifier: identifier,
      p_action: action,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

  if (error) {
    // Fail open: a rate-limiter outage should not lock every user out of sign-in.
    console.error("[rateLimiter] check failed, allowing request:", error.code, error.message);
    return { allowed: true };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row?.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: row?.retry_after_seconds ?? windowSeconds };
}

export function rateLimitResponse(retryAfterSeconds = 60): NextResponse {
  return NextResponse.json(
    { error: "RATE_LIMITED", message: `Too many attempts. Try again in ${retryAfterSeconds} seconds.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

// Netlify sets x-nf-client-connection-ip itself, so prefer it over the client-supplied x-forwarded-for.
export function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("x-nf-client-connection-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
