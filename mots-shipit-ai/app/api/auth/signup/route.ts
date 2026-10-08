import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { firstIssueMessage, signupSchema } from "@/lib/security/inputValidator";
import { appOrigin } from "@/lib/utils/redirects";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security/rateLimiter";
import { createConfirmedTestMember, isTestMember } from "@/lib/security/testMembers";

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(`ip:${getClientIp(request)}`, "auth");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: firstIssueMessage(parsed.error) },
      { status: 422 }
    );
  }

  const { fullName, email, password } = parsed.data;
  const supabase = createClient();

  if (await isTestMember(email)) {
    const created = await createConfirmedTestMember({ email, password, fullName });
    if (!created.ok && created.reason === "already_registered") {
      return NextResponse.json(
        { error: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists. Log in instead." },
        { status: 409 }
      );
    }
    if (!created.ok) {
      return NextResponse.json(
        { error: "SIGNUP_FAILED", message: "Something went wrong creating your account. Please try again." },
        { status: 500 }
      );
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      console.error("[signup] test member created but sign-in failed:", signInError.code, signInError.message);
      return NextResponse.json({ message: "Your account is ready. Log in to continue." }, { status: 201 });
    }
    return NextResponse.json({ message: "Your test account is ready.", signedIn: true }, { status: 201 });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${appOrigin(request)}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    if (error.status === 429 || error.code === "over_email_send_rate_limit") {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many sign-up emails were sent recently. Wait a few minutes and try again." },
        { status: 429 }
      );
    }
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      return NextResponse.json(
        { error: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists. Log in instead." },
        { status: 409 }
      );
    }
    // The allow-list trigger on auth.users rejects the insert; Supabase surfaces any
    // trigger exception as this generic message, so the real cause is logged here.
    if (/database error saving new user/i.test(error.message)) {
      console.warn("[signup] rejected by database (allow-list):", email.split("@")[1]);
      return NextResponse.json(
        { error: "SIGNUP_NOT_ALLOWED", message: "Sign-up is limited to approved company email addresses." },
        { status: 403 }
      );
    }
    console.error("[signup] unexpected Supabase error:", error.code, error.status, error.message);
    return NextResponse.json(
      { error: "SIGNUP_FAILED", message: "Something went wrong creating your account. Please try again." },
      { status: 500 }
    );
  }

  // Supabase returns a user with no identities (and no error) when the email is already
  // registered, so the response doesn't reveal which emails have accounts.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return NextResponse.json(
      { error: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists. Log in instead." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { message: "Check your email and click the confirmation link to activate your account." },
    { status: 201 }
  );
}
