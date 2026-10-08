import type { RoutingGuideEntry, ShipStationMoney, ShipStationOutcome, ShipStationRate } from "@/lib/estimate/types";

const ESTIMATE_URL = "https://api.shipstation.com/v2/rates/estimate";
const CARRIERS_URL = "https://api.shipstation.com/v2/carriers";
const TIMEOUT_MS = 10_000;
const CARRIER_CACHE_MS = 60 * 60 * 1000;

// Total per the ShipStation Rate Shopping guide: shipping + insurance + confirmation + other.
// The guide's field table calls the first one shipment_amount; the API returns shipping_amount.
export function rateTotal(rate: ShipStationRate): number {
  const amount = (m: ShipStationMoney) => (m && typeof m.amount === "number" ? m.amount : 0);
  const shipping = rate.shipping_amount ?? (rate as { shipment_amount?: ShipStationMoney }).shipment_amount;
  return (
    amount(shipping) + amount(rate.insurance_amount) +
    amount(rate.confirmation_amount) + amount(rate.other_amount)
  );
}

let carrierCache: { ids: string[]; at: number } | null = null;

// The guide: "you'll always need the carrier_ids". Use SHIPSTATION_CARRIER_IDS when set,
// otherwise every carrier connected to the ShipStation account (cached for an hour).
async function carrierIds(apiKey: string): Promise<string[]> {
  const configured = (process.env.SHIPSTATION_CARRIER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (configured.length > 0) return configured;
  if (carrierCache && Date.now() - carrierCache.at < CARRIER_CACHE_MS) return carrierCache.ids;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(CARRIERS_URL, { headers: { "api-key": apiKey }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as { carriers?: Array<{ carrier_id?: string; disabled_by_billing_plan?: boolean }> } | null;
    const ids = (json?.carriers ?? [])
      .filter((c) => c.carrier_id && !c.disabled_by_billing_plan)
      .map((c) => c.carrier_id as string);
    carrierCache = { ids, at: Date.now() };
    return ids;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
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
  const ids = await carrierIds(apiKey);
  if (ids.length === 0) {
    return {
      status: "unavailable",
      allRates: [],
      reason: "No ShipStation carrier is connected (or SHIPSTATION_CARRIER_IDS is empty and the carrier list couldn't be read)",
    };
  }

  const body = {
    carrier_ids: ids,
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

    // /v2/rates/estimate returns a plain list; /v2/rates wraps it in rate_response.rates.
    const rates: ShipStationRate[] = Array.isArray(json) ? json : (json?.rate_response?.rates ?? json?.rates ?? []);
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
