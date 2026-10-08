import type { SupabaseClient } from "@supabase/supabase-js";

export const LOAD_STATUSES = ["sourcing", "negotiating", "booked", "exception", "cancelled"] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export type LoadRow = {
  id: string;
  external_id: string;
  version: number;
  customer_id: string | null;
  origin_zipcode: string;
  destination_zipcode: string;
  origin_state_code: string | null;
  destination_state_code: string | null;
  equipment_type: "dry_van" | "reefer";
  scheduled_pickup_at: string;
  scheduled_delivery_at: string;
  commodity: string;
  weight_pounds: number;
  target_rate_dollars: number;
  rate_ceiling_dollars: number;
  status: LoadStatus;
  evaluated_policy_id: string | null;
  evaluated_policy_version: number | null;
  eligibility_reason_codes: string[];
  evaluated_at: string | null;
  created_at: string;
};

const LOAD_COLUMNS =
  "id, external_id, version, customer_id, origin_zipcode, destination_zipcode, origin_state_code, destination_state_code, equipment_type, scheduled_pickup_at, scheduled_delivery_at, commodity, weight_pounds, target_rate_dollars, rate_ceiling_dollars, status, evaluated_policy_id, evaluated_policy_version, eligibility_reason_codes, evaluated_at, created_at";

export async function listLoads(
  supabase: SupabaseClient,
  filters: { status?: string | null; customerId?: string | null } = {}
): Promise<LoadRow[]> {
  let query = supabase
    .schema("transportation_shipment")
    .from("loads")
    .select(LOAD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.status && (LOAD_STATUSES as readonly string[]).includes(filters.status)) query = query.eq("status", filters.status);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);

  const { data, error } = await query;
  if (error) throw new Error(`Loading loads failed: ${error.message}`);
  return (data ?? []) as LoadRow[];
}

export async function getLoad(supabase: SupabaseClient, id: string): Promise<LoadRow | null> {
  const { data, error } = await supabase
    .schema("transportation_shipment")
    .from("loads")
    .select(LOAD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading the load failed: ${error.message}`);
  return data as LoadRow | null;
}

// Customers live in another schema, so names are looked up separately (no cross-schema joins).
export async function customerNames(supabase: SupabaseClient, ids: Array<string | null>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.schema("master_data_management").from("customers").select("id, name").in("id", unique);
  if (error) throw new Error(`Loading customers failed: ${error.message}`);
  return Object.fromEntries((data ?? []).map((c) => [c.id as string, c.name as string]));
}
