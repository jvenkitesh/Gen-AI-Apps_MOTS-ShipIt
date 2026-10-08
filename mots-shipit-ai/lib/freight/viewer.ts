import type { SupabaseClient } from "@supabase/supabase-js";
import { isUserRole, type UserRole } from "@/types/userRole";

// The signed-in user's role for page-level permissions (buttons shown); APIs re-check with requireAuth.
export async function viewerRole(supabase: SupabaseClient): Promise<UserRole | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.schema("data_foundation").from("user_profiles").select("role").eq("id", user.id).maybeSingle();
  return isUserRole(data?.role) ? data.role : null;
}

export async function loadExternalIds(supabase: SupabaseClient, ids: Array<string | null>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return {};
  const { data } = await supabase.schema("transportation_shipment").from("loads").select("id, external_id").in("id", unique);
  return Object.fromEntries((data ?? []).map((l) => [l.id as string, l.external_id as string]));
}
