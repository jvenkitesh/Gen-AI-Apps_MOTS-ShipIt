import { describe, expect, it, vi } from "vitest";
import { getRateEstimate, rateTotal } from "@/lib/estimate/shipstation";
import type { RoutingGuideEntry, ShipStationRate } from "@/lib/estimate/types";

const entry: RoutingGuideEntry = {
  id: "rg-1",
  geography: "NA",
  origin_hub: "Memphis, TN",
  state: "Georgia",
  state_code: "GA",
  gateway_city: "Atlanta",
  street_address: "1 Test St",
  zipcode: "30303",
  corridor: "I-22",
  distance_miles: 390,
  transit_days: 2,
  mode: "FTL",
  transport: "road",
  carrier: "Norfolk Southern",
  freight_cost_dollars: 1050,
  weight_break: null,
};

const usd = (amount: number) => ({ currency: "usd", amount });

function configure() {
  vi.stubEnv("SHIPSTATION_API_KEY", "TEST_unit");
  vi.stubEnv("SHIPSTATION_FROM_POSTAL_CODE", "38103");
  // Set carriers explicitly so the estimate makes exactly one call.
  vi.stubEnv("SHIPSTATION_CARRIER_IDS", "se-1, se-2");
}

function respondWith(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

describe("ShipStation: rateTotal", () => {
  it("adds shipping, insurance, confirmation and other amounts", () => {
    const rate: ShipStationRate = {
      shipping_amount: usd(10),
      insurance_amount: usd(1.5),
      confirmation_amount: usd(2.25),
      other_amount: usd(0.25),
    };
    expect(rateTotal(rate)).toBe(14);
  });

  it("accepts the guide's shipment_amount name and missing parts", () => {
    expect(rateTotal({ shipment_amount: usd(9.92) } as ShipStationRate)).toBe(9.92);
    expect(rateTotal({ shipping_amount: null })).toBe(0);
  });
});

describe("ShipStation: getRateEstimate", () => {
  it("never calls ShipStation without an API key or origin zip", async () => {
    const calls = respondWith(200, []);
    const outcome = await getRateEstimate({ entry, weightPounds: 10 });
    expect(outcome).toMatchObject({ status: "unavailable", reason: "SHIPSTATION_API_KEY is not set" });
    expect(calls).toHaveLength(0);
  });

  it("estimates only, and picks the cheapest total that has no errors", async () => {
    configure();
    const calls = respondWith(200, [
      { rate_id: "r1", carrier_friendly_name: "UPS", shipping_amount: usd(12), other_amount: usd(3) },
      { rate_id: "r2", carrier_friendly_name: "USPS", shipping_amount: usd(9.92) },
      { rate_id: "r3", carrier_friendly_name: "Broken", shipping_amount: usd(1), error_messages: ["no service"] },
      { rate_id: "r4", carrier_friendly_name: "Zero", shipping_amount: usd(0) },
    ]);

    const outcome = await getRateEstimate({ entry, weightPounds: 10 });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.cheapest.rate_id).toBe("r2");
    expect(outcome.cheapestTotal).toBe(9.92);
    expect(outcome.allRates).toHaveLength(4);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.shipstation.com/v2/rates/estimate");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      carrier_ids: ["se-1", "se-2"],
      from_postal_code: "38103",
      from_city_locality: "Memphis",
      from_state_province: "TN",
      to_postal_code: "30303",
      to_state_province: "GA",
      weight: { value: 10, unit: "pound" },
    });
  });

  it("reads rates wrapped in rate_response", async () => {
    configure();
    respondWith(200, { rate_response: { rates: [{ rate_id: "w1", shipping_amount: usd(5) }] } });
    const outcome = await getRateEstimate({ entry, weightPounds: 10 });
    expect(outcome).toMatchObject({ status: "ok", cheapestTotal: 5 });
  });

  it("reports no_rates when nothing is priced", async () => {
    configure();
    respondWith(200, [{ rate_id: "x", shipping_amount: usd(0) }]);
    expect((await getRateEstimate({ entry, weightPounds: 10 })).status).toBe("no_rates");
  });

  it("passes ShipStation's error message through", async () => {
    configure();
    respondWith(400, { errors: [{ message: "Invalid postal code" }] });
    expect(await getRateEstimate({ entry, weightPounds: 10 })).toMatchObject({
      status: "unavailable",
      reason: "ShipStation 400: Invalid postal code",
    });
  });

  it("reports a timeout separately from other failures", async () => {
    configure();
    vi.stubGlobal("fetch", async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    expect((await getRateEstimate({ entry, weightPounds: 10 })).status).toBe("timeout");
  });
});
