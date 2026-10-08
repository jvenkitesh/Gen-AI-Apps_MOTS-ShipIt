import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { firstIssueMessage, resetPasswordSchema } from "@/lib/security/inputValidator";

export async function POST(request: Request) {
  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: firstIssueMessage(parsed.error) },
      { status: 422 }
    );
  }

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

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
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
