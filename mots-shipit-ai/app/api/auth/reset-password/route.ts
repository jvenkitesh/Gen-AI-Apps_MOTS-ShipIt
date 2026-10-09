import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, resetPasswordSchema } from "@/lib/security/inputValidator";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security/rateLimiter";

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(`ip:${getClientIp(request)}`, "auth");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const body = await parseBody(request, resetPasswordSchema);
  if (!body.ok) return body.response;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "RESET_LINK_EXPIRED", message: "Your reset link has expired. Request a new one." },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password: body.data.password });
  if (error) {
    if (error.code === "same_password") {
      return NextResponse.json(
        { error: "SAME_PASSWORD", message: "Choose a password different from your current one." },
        { status: 422 }
      );
    }
    if (error.code === "weak_password") {
      return NextResponse.json(
        { error: "WEAK_PASSWORD", message: "That password is too weak. Use a longer one with a mix of characters." },
        { status: 422 }
      );
    }
    console.error("[reset-password] Supabase error:", error.code, error.status, error.message);
    return NextResponse.json(
      { error: "RESET_FAILED", message: "Your password could not be changed. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Your password has been changed." }, { status: 200 });
}
