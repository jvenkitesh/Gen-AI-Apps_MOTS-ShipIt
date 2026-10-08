import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/redirects";

// Landing point for links in confirmation and password-reset emails. Handles both
// link formats Supabase can send: ?code=... (default templates) and
// ?token_hash=...&type=... (custom templates).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(
    searchParams.get("next"),
    type === "recovery" ? "/reset-password" : "/dashboard"
  );

  const supabase = createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    if (error) console.warn("[auth/confirm] code exchange failed:", error.code, error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
    if (error) console.warn("[auth/confirm] token verification failed:", error.code, error.message);
  }

  if (failed) {
    return NextResponse.redirect(new URL("/login?error=link_invalid", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
