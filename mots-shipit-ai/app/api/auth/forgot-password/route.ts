import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { firstIssueMessage, forgotPasswordSchema } from "@/lib/security/inputValidator";
import { appOrigin } from "@/lib/utils/redirects";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security/rateLimiter";

const SENT_MESSAGE = "If an account exists for that email, a password reset link is on its way.";

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(`ip:${getClientIp(request)}`, "auth");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: firstIssueMessage(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appOrigin(request)}/auth/confirm?next=/reset-password`,
  });

  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many reset emails were sent recently. Wait a few minutes and try again." },
      { status: 429 }
    );
  }
  if (error) {
    console.error("[forgot-password] Supabase error:", error.code, error.status, error.message);
  }

  // Same answer whether or not the account exists, so this can't be used to discover accounts.
  return NextResponse.json({ message: SENT_MESSAGE }, { status: 200 });
}
