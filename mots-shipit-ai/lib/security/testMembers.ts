import { createAdminClient } from "@/lib/supabase/admin";

// Test members (data_foundation.allowed_signup_emails.is_test_member) skip the email
// confirmation step. Needs the service role key; without it everyone confirms by email.
export async function isTestMember(email: string): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const { data, error } = await createAdminClient()
    .schema("data_foundation")
    .from("allowed_signup_emails")
    .select("is_test_member")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("[testMembers] lookup failed, using normal email confirmation:", error.code, error.message);
    return false;
  }
  return data?.is_test_member === true;
}

export type TestMemberCreateResult = { ok: true } | { ok: false; reason: "already_registered" | "failed"; message?: string };

// Creates the account already confirmed. The allow-list and profile triggers on
// auth.users still run, exactly as for a normal signup.
export async function createConfirmedTestMember(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<TestMemberCreateResult> {
  const { error } = await createAdminClient().auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { full_name: params.fullName },
  });
  if (!error) return { ok: true };
  if (error.code === "email_exists" || /already (been )?registered/i.test(error.message)) {
    return { ok: false, reason: "already_registered" };
  }
  console.error("[testMembers] createUser failed:", error.code, error.status, error.message);
  return { ok: false, reason: "failed", message: error.message };
}
