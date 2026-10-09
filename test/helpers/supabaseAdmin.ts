import "./env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

// Service-role client for test setup, teardown and direct DB assertions only.
// Tests exercise the app itself through its HTTP routes.
export function createAdminClient(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
}

// Anon-key client signed in as a test user: what RLS and grants allow a real user.
export async function createUserClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`createUserClient(${email}) sign-in failed: ${error.message}`);
  return client;
}
