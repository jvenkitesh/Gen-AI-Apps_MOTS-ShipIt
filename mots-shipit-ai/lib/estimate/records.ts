import type { SupabaseClient } from "@supabase/supabase-js";
import { rateTotal } from "@/lib/estimate/shipstation";
import type { QueryType, RoutingGuideEntry, ShipStationOutcome } from "@/lib/estimate/types";

const money = (m: { amount: number } | null | undefined) => (m && typeof m.amount === "number" ? m.amount : null);

// One row per enquiry in transportation_shipment.load_transit_freight_amount (newest 200 kept by trigger).
export async function recordLoadTransitFreightAmount(
  admin: SupabaseClient,
  params: {
    userId: string;
    enquiryText: string;
    geography: string;
    zipcode: string | null;
    stateCode: string;
    weightPounds: number;
    entry: RoutingGuideEntry | null;
    shipstation: ShipStationOutcome;
  }
): Promise<string | null> {
  const { entry, shipstation } = params;
  const rate = shipstation.status === "ok" ? shipstation.cheapest : null;

  const { data, error } = await admin
    .schema("transportation_shipment")
    .from("load_transit_freight_amount")
    .insert({
      enquired_by: params.userId,
      enquiry_text: params.enquiryText,
      geography: params.geography,
      ship_to_zipcode: params.zipcode,
      ship_to_state_code: params.stateCode,
      package_weight_pounds: params.weightPounds,
      routing_guide_id: entry?.id ?? null,
      routing_guide_origin_hub: entry?.origin_hub ?? null,
      routing_guide_gateway_city: entry?.gateway_city ?? null,
      routing_guide_carrier: entry?.carrier ?? null,
      routing_guide_mode: entry?.mode ?? null,
      routing_guide_transport: entry?.transport ?? null,
      routing_guide_corridor: entry?.corridor ?? null,
      routing_guide_distance_miles: entry?.distance_miles ?? null,
      routing_guide_transit_days: entry?.transit_days ?? null,
      routing_guide_freight_cost_dollars: entry?.freight_cost_dollars ?? null,
      routing_guide_weight_break: entry?.weight_break ?? null,
      shipstation_status: shipstation.status,
      shipstation_rate_id: rate?.rate_id ?? null,
      shipstation_rate_type: rate?.rate_type ?? null,
      shipstation_carrier_id: rate?.carrier_id ?? null,
      shipstation_carrier_code: rate?.carrier_code ?? null,
      shipstation_carrier_friendly_name: rate?.carrier_friendly_name ?? null,
      shipstation_service_code: rate?.service_code ?? null,
      shipstation_service_type: rate?.service_type ?? null,
      shipstation_package_type: rate?.package_type ?? null,
      shipstation_zone: rate?.zone ?? null,
      shipstation_currency: rate?.shipping_amount?.currency?.toUpperCase() ?? null,
      shipstation_shipping_amount: money(rate?.shipping_amount),
      shipstation_insurance_amount: money(rate?.insurance_amount),
      shipstation_confirmation_amount: money(rate?.confirmation_amount),
      shipstation_other_amount: money(rate?.other_amount),
      shipstation_delivery_days: rate?.delivery_days ?? null,
      shipstation_estimated_delivery_date: rate?.estimated_delivery_date ?? null,
      shipstation_carrier_delivery_days: rate?.carrier_delivery_days ?? null,
      shipstation_ship_date: rate?.ship_date ?? null,
      shipstation_guaranteed_service: rate?.guaranteed_service ?? null,
      shipstation_negotiated_rate: rate?.negotiated_rate ?? null,
      shipstation_trackable: rate?.trackable ?? null,
      shipstation_validation_status: rate?.validation_status ?? null,
      shipstation_warning_messages: rate?.warning_messages ?? [],
      shipstation_error_messages:
        rate?.error_messages ?? (shipstation.status === "ok" ? [] : [{ message: shipstation.reason }]),
      shipstation_all_rates: shipstation.allRates.map((r) => ({ ...r, shipit_total_amount: rateTotal(r) })),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[estimate records] load_transit_freight_amount insert failed:", error.code, error.message);
    return null;
  }
  return data.id as string;
}

export async function recordEnquiry(
  admin: SupabaseClient,
  params: {
    userId: string;
    enquiryText: string;
    geography: string;
    zipOrState: string;
    queryType: QueryType;
    answeredFromCache: boolean;
    cacheId: string | null;
    loadTransitFreightAmountId: string | null;
  }
): Promise<void> {
  const { error } = await admin
    .schema("transportation_shipment")
    .from("load_estimate_enquiries")
    .insert({
      enquired_by: params.userId,
      enquiry_text: params.enquiryText,
      geography: params.geography,
      zip_or_state: params.zipOrState,
      query_type: params.queryType,
      answered_from_cache: params.answeredFromCache,
      load_estimate_cache_id: params.cacheId,
      load_transit_freight_amount_id: params.loadTransitFreightAmountId,
    });
  if (error) console.error("[estimate records] enquiry insert failed:", error.code, error.message);
}
