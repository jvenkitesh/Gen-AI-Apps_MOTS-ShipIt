import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstimateAnswer, EstimateSource, QueryType } from "@/lib/estimate/types";

export type CachedEstimate = {
  id: string;
  answer: EstimateAnswer;
  sources: EstimateSource[];
  load_transit_freight_amount_id: string | null;
};

// Read with the signed-in user's client (RLS allows reads); only unexpired rows count.
export async function getCachedEstimate(
  supabase: SupabaseClient,
  params: { geography: string; zipOrState: string; queryType: QueryType }
): Promise<CachedEstimate | null> {
  const { data, error } = await supabase
    .schema("transportation_shipment")
    .from("load_estimate_cache")
    .select("id, answer, sources, load_transit_freight_amount_id")
    .eq("geography", params.geography)
    .eq("zip_or_state", params.zipOrState)
    .eq("query_type", params.queryType)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("[estimate cache] read failed:", error.code, error.message);
    return null;
  }
  return data as CachedEstimate | null;
}

// Written with the service role. A newer answer replaces the row and resets the 24-hour expiry.
export async function upsertEstimate(
  admin: SupabaseClient,
  params: {
    geography: string;
    zipOrState: string;
    queryType: QueryType;
    answer: EstimateAnswer;
    sources: EstimateSource[];
    loadTransitFreightAmountId: string | null;
  }
): Promise<string | null> {
  const now = new Date();
  const { data, error } = await admin
    .schema("transportation_shipment")
    .from("load_estimate_cache")
    .upsert(
      {
        geography: params.geography,
        zip_or_state: params.zipOrState,
        query_type: params.queryType,
        answer: params.answer,
        sources: params.sources,
        load_transit_freight_amount_id: params.loadTransitFreightAmountId,
        updated_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "geography,zip_or_state,query_type" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("[estimate cache] write failed:", error.code, error.message);
    return null;
  }
  return data.id as string;
}
