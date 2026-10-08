import type { RoutingGuideEntry, ShipStationMoney, ShipStationOutcome, ShipStationRate } from "@/lib/estimate/types";

const ESTIMATE_URL = "https://api.shipstation.com/v2/rates/estimate";
const TIMEOUT_MS = 10_000;

export function rateTotal(rate: ShipStationRate): number {
  const amount = (m: ShipStationMoney) => (m && typeof m.amount === "number" ? m.amount : 0);
  return (
    amount(rate.shipping_amount) + amount(rate.insurance_amount) +
    amount(rate.confirmation_amount) + amount(rate.other_amount)
  );
}

// "Memphis, TN" -> { city: "Memphis", state: "TN" }
function splitCityState(originHub: string): { city: string; state: string } {
  const [city, state] = originHub.split(",").map((s) => s.trim());
  return { city: city ?? originHub, state: state ?? "" };
}

// KB2: ShipStation rate ESTIMATE only. Never calls label, purchase or any endpoint that
// books or confirms a load -- ShipIt only reports the best (cheapest total) choice back.
export async function getRateEstimate(params: {
  entry: RoutingGuideEntry;
  weightPounds: number;
}): Promise<ShipStationOutcome> {
  const apiKey = process.env.SHIPSTATION_API_KEY;
  const fromPostalCode = process.env.SHIPSTATION_FROM_POSTAL_CODE;
  if (!apiKey || !fromPostalCode) {
    return {
      status: "unavailable",
      allRates: [],
      reason: !apiKey ? "SHIPSTATION_API_KEY is not set" : "SHIPSTATION_FROM_POSTAL_CODE is not set",
    };
  }

  const origin = splitCityState(params.entry.origin_hub);
  const carrierIds = (process.env.SHIPSTATION_CARRIER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const body = {
    ...(carrierIds.length > 0 ? { carrier_ids: carrierIds } : {}),
    from_country_code: "US",
    from_postal_code: fromPostalCode,
    from_city_locality: origin.city,
    from_state_province: origin.state,
    to_country_code: "US",
    to_postal_code: params.entry.zipcode,
    to_city_locality: params.entry.gateway_city,
    to_state_province: params.entry.state_code,
    weight: { value: params.weightPounds, unit: "pound" },
    address_residential_indicator: "no",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ESTIMATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (json as { errors?: Array<{ message?: string }> } | null)?.errors?.[0]?.message;
      return { status: "unavailable", allRates: [], reason: `ShipStation ${res.status}${message ? `: ${message}` : ""}` };
    }

    const rates: ShipStationRate[] = Array.isArray(json) ? json : (json?.rates ?? []);
    const priced = rates.filter((r) => rateTotal(r) > 0 && !(r.error_messages && r.error_messages.length > 0));
    if (priced.length === 0) {
      return { status: "no_rates", allRates: rates, reason: "ShipStation returned no priced rates" };
    }
    const cheapest = priced.reduce((best, r) => (rateTotal(r) < rateTotal(best) ? r : best));
    return { status: "ok", cheapest, cheapestTotal: Math.round(rateTotal(cheapest) * 100) / 100, allRates: rates };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "timeout", allRates: [], reason: "ShipStation did not answer within 10 seconds" };
    }
    return { status: "unavailable", allRates: [], reason: err instanceof Error ? err.message : "ShipStation request failed" };
  } finally {
    clearTimeout(timer);
  }
}
