import { randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "./supabaseAdmin";

export type UserRole =
  | "administrator"
  | "supply_chain_operations_manager"
  | "transportation_planner"
  | "compliance_analyst"
  | "viewer";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: UserRole;
}

const freshPassword = () => `E2e-${randomBytes(12).toString("base64url")}`;

// Sign-up is limited to an allow-list enforced by a trigger on auth.users, which also
// applies to accounts created through the admin API. The test address is allowed only for
// the moment its account is created.
async function createConfirmedUser(email: string, password: string, fullName: string): Promise<string> {
  const admin = createAdminClient();
  const allow = await admin.schema("data_foundation").from("allowed_signup_emails").upsert({ email, is_test_member: false });
  if (allow.error) throw new Error(`Allow-listing ${email} failed: ${allow.error.message}`);
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new Error(`Creating ${email} failed: ${error?.message}`);
    return data.user.id;
  } finally {
    await admin.schema("data_foundation").from("allowed_signup_emails").delete().eq("email", email);
  }
}

async function setRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await createAdminClient()
    .schema("data_foundation")
    .from("user_profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(`Setting role ${role} failed: ${error.message}`);
}

/** A throwaway user, deleted by the test that made it. Never use it for control-plane
 *  actions: control_actions.actor_id blocks deleting the user. */
export async function createEphemeralUser(label: string, role: UserRole = "supply_chain_operations_manager"): Promise<TestUser> {
  const email = `mots-shipit.e2e.${label}.${randomUUID().slice(0, 8)}@example.com`;
  const password = freshPassword();
  const id = await createConfirmedUser(email, password, `E2E ${label}`);
  await setRole(id, role);
  return { id, email, password, role };
}

export async function deleteEphemeralUser(userId: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(`Deleting test user ${userId} failed: ${error.message}`);
}

const roleUsers = new Map<UserRole, Promise<TestUser>>();

/** One permanent, clearly labelled user per role (mots-shipit.e2e.<role>@example.com).
 *  Its password is replaced on every run, so no password is stored anywhere. */
export function roleUser(role: UserRole): Promise<TestUser> {
  let user = roleUsers.get(role);
  if (!user) {
    user = (async () => {
      const admin = createAdminClient();
      const email = `mots-shipit.e2e.${role.replaceAll("_", "-")}@example.com`;
      const password = freshPassword();
      const { data: profile } = await admin
        .schema("data_foundation")
        .from("user_profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      let id = profile?.id as string | undefined;
      if (id) {
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) throw new Error(`Resetting ${email} failed: ${error.message}`);
      } else {
        id = await createConfirmedUser(email, password, `E2E ${role}`);
      }
      await setRole(id, role);
      return { id, email, password, role };
    })();
    roleUsers.set(role, user);
  }
  return user;
}

export type SessionCookie = { name: string; value: string };

/** Signs in exactly as the app's server does (@supabase/ssr) and returns its session
 *  cookies. Avoids the login route so the suite doesn't trip the 10-per-minute auth limit. */
export async function sessionCookies(user: TestUser): Promise<SessionCookie[]> {
  const jar = new Map<string, string>();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`Signing in ${user.email} failed: ${error.message}`);
  if (jar.size === 0) throw new Error(`Signing in ${user.email} set no session cookie`);
  return Array.from(jar, ([name, value]) => ({ name, value }));
}

export async function cookieHeader(user: TestUser): Promise<string> {
  return (await sessionCookies(user)).map((c) => `${c.name}=${c.value}`).join("; ");
}
