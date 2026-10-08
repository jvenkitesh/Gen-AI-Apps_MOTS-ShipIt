export type QueryType = "transit_time" | "cost" | "both";

export type EstimateAnswer = {
  summary: string;
  ship_to: string | null;
  corridor: string | null;
  transit_days: number | null;
  weight_pounds: number;
  weight_assumed: boolean;
  // Best choice = the cheaper of the routing guide's freight cost and ShipStation's cheapest rate.
  best_choice: "routing_guide" | "shipstation" | null;
  carrier: string | null;
  usd_estimate: number | null;
  routing_guide_carrier: string | null;
  routing_guide_mode: string | null;
  routing_guide_cost: number | null;
  shipstation_carrier: string | null;
  shipstation_service: string | null;
  shipstation_cost: number | null;
  shipstation_delivery_days: number | null;
  currency: "USD";
};

export type EstimateSource = {
  kb: "routing_guide" | "shipstation" | "unisco_glossary";
  detail: string;
  url?: string;
};

export type EstimateResult = {
  cached: boolean;
  answer: EstimateAnswer;
  sources: EstimateSource[];
};

export type RoutingGuideEntry = {
  id: string;
  geography: string;
  origin_hub: string;
  state: string;
  state_code: string;
  gateway_city: string;
  street_address: string;
  zipcode: string;
  corridor: string;
  distance_miles: number;
  transit_days: number;
  mode: string;
  transport: string;
  carrier: string;
  freight_cost_dollars: number;
  weight_break: string | null;
};

// One rate object from POST /v2/rates/estimate (fields per ShipStation API docs).
export type ShipStationMoney = { currency: string; amount: number } | null | undefined;
export type ShipStationRate = {
  rate_id?: string | null;
  rate_type?: string | null;
  carrier_id?: string | null;
  carrier_code?: string | null;
  carrier_friendly_name?: string | null;
  service_code?: string | null;
  service_type?: string | null;
  package_type?: string | null;
  zone?: number | null;
  shipping_amount?: ShipStationMoney;
  insurance_amount?: ShipStationMoney;
  confirmation_amount?: ShipStationMoney;
  other_amount?: ShipStationMoney;
  delivery_days?: number | null;
  estimated_delivery_date?: string | null;
  carrier_delivery_days?: string | null;
  ship_date?: string | null;
  guaranteed_service?: boolean | null;
  negotiated_rate?: boolean | null;
  trackable?: boolean | null;
  validation_status?: string | null;
  warning_messages?: unknown[] | null;
  error_messages?: unknown[] | null;
};

export type ShipStationOutcome =
  | { status: "ok"; cheapest: ShipStationRate; cheapestTotal: number; allRates: ShipStationRate[] }
  | { status: "no_rates" | "unavailable" | "timeout"; allRates: ShipStationRate[]; reason: string };

export class EstimateInputError extends Error {}
