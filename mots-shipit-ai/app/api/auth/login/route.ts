import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { firstIssueMessage, loginSchema } from "@/lib/security/inputValidator";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security/rateLimiter";

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(`ip:${getClientIp(request)}`, "auth");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: firstIssueMessage(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
      return NextResponse.json(
        { error: "EMAIL_NOT_CONFIRMED", message: "Confirm your email first. Check your inbox for the confirmation link." },
        { status: 401 }
      );
    }
    if (error.status === 429) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many attempts. Wait a minute and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
      { status: 401 }
    );
  }

  return NextResponse.json({}, { status: 200 });
}
