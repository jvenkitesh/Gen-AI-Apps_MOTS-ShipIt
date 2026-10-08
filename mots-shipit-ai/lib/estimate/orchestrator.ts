import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { composeSummary } from "@/lib/ai/estimateComposer";
import { getCachedEstimate, upsertEstimate } from "@/lib/estimate/cache";
import { lookupTerm } from "@/lib/estimate/glossary";
import { parseQuery } from "@/lib/estimate/parseQuery";
import { recordEnquiry, recordLoadTransitFreightAmount } from "@/lib/estimate/records";
import { lookupRoutingGuideEntry } from "@/lib/estimate/routingGuide";
import { getRateEstimate } from "@/lib/estimate/shipstation";
import { US_STATES } from "@/lib/estimate/usStates";
import type { EstimateAnswer, EstimateResult, EstimateSource } from "@/lib/estimate/types";

const GEOGRAPHY = "NA";

function defaultWeightPounds(): number {
  const configured = Number(process.env.ESTIMATE_DEFAULT_WEIGHT_POUNDS);
  return Number.isFinite(configured) && configured > 0 ? configured : 10;
}

// Writes need the service role key; without it the answer is still returned, just not saved.
function adminOrNull(): SupabaseClient | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[estimate] SUPABASE_SERVICE_ROLE_KEY is not set -- answers will not be saved.");
    return null;
  }
  return createAdminClient();
}

export async function resolveEstimate(params: {
  supabase: SupabaseClient;
  rawQuery: string;
  userId: string;
}): Promise<EstimateResult> {
  const { supabase, rawQuery, userId } = params;
  const parsed = parseQuery(rawQuery);
  const admin = adminOrNull();

  // The cache holds default-weight answers only: a stated weight can pick a different
  // routing guide weight break and ShipStation price, so those are always calculated fresh.
  const usesCache = parsed.weightPounds === null;

  const cached = usesCache
    ? await getCachedEstimate(supabase, {
        geography: GEOGRAPHY,
        zipOrState: parsed.cacheKey,
        queryType: parsed.queryType,
      })
    : null;
  if (cached) {
    if (admin) {
      await recordEnquiry(admin, {
        userId,
        enquiryText: rawQuery,
        geography: GEOGRAPHY,
        zipOrState: parsed.cacheKey,
        queryType: parsed.queryType,
        answeredFromCache: true,
        cacheId: cached.id,
        loadTransitFreightAmountId: cached.load_transit_freight_amount_id,
      });
    }
    return { cached: true, answer: cached.answer, sources: cached.sources };
  }

  const weightPounds = parsed.weightPounds ?? defaultWeightPounds();
  const entry = await lookupRoutingGuideEntry(supabase, {
    geography: GEOGRAPHY,
    stateCode: parsed.stateCode,
    zipcode: parsed.zipcode,
    weightPounds,
  });

  const stateName = US_STATES[parsed.stateCode] ?? parsed.stateCode;
  if (!entry) {
    return {
      cached: false,
      answer: {
        summary: `No routing data for ${stateName} yet, so there is no estimate for this location.`,
        ship_to: null, corridor: null, transit_days: null,
        weight_pounds: weightPounds, weight_assumed: parsed.weightPounds === null,
        best_choice: null, carrier: null, usd_estimate: null,
        routing_guide_carrier: null, routing_guide_mode: null, routing_guide_cost: null,
        shipstation_carrier: null, shipstation_service: null, shipstation_cost: null, shipstation_delivery_days: null,
        currency: "USD",
      },
      sources: [],
    };
  }

  const [shipstation, glossary] = await Promise.all([
    getRateEstimate({ entry, weightPounds }),
    parsed.glossarySlug ? lookupTerm(parsed.glossarySlug) : Promise.resolve(null),
  ]);
  if (shipstation.status !== "ok") console.warn("[estimate] ShipStation:", shipstation.status, shipstation.reason);

  const shipstationCost = shipstation.status === "ok" ? shipstation.cheapestTotal : null;
  const shipstationCarrier =
    shipstation.status === "ok" ? shipstation.cheapest.carrier_friendly_name ?? shipstation.cheapest.carrier_code ?? null : null;
  const routingGuideCost = entry.freight_cost_dollars;
  const bestIsShipStation = shipstationCost !== null && shipstationCost < routingGuideCost;

  const facts: Omit<EstimateAnswer, "summary"> = {
    ship_to: `${entry.gateway_city}, ${entry.state_code} ${entry.zipcode}`,
    corridor: entry.corridor,
    transit_days: entry.transit_days,
    weight_pounds: weightPounds,
    weight_assumed: parsed.weightPounds === null,
    best_choice: bestIsShipStation ? "shipstation" : "routing_guide",
    carrier: bestIsShipStation ? shipstationCarrier : entry.carrier,
    usd_estimate: bestIsShipStation ? shipstationCost : routingGuideCost,
    routing_guide_carrier: entry.carrier,
    routing_guide_mode: entry.mode,
    routing_guide_cost: routingGuideCost,
    shipstation_carrier: shipstationCarrier,
    shipstation_service: shipstation.status === "ok" ? shipstation.cheapest.service_type ?? null : null,
    shipstation_cost: shipstationCost,
    shipstation_delivery_days: shipstation.status === "ok" ? shipstation.cheapest.delivery_days ?? null : null,
    currency: "USD",
  };

  const summary = await composeSummary({
    ...facts,
    question: rawQuery,
    glossary: glossary ? { term: glossary.term, definition: glossary.definition } : null,
  });
  const answer: EstimateAnswer = { summary, ...facts };

  const sources: EstimateSource[] = [
    {
      kb: "routing_guide",
      detail: `Routing guide: ${entry.origin_hub} → ${entry.gateway_city}, ${entry.state_code} (${entry.carrier}, ${entry.mode}${entry.weight_break ? `, ${entry.weight_break}` : ""})`,
    },
  ];
  if (shipstation.status === "ok") {
    sources.push({
      kb: "shipstation",
      detail: `ShipStation estimate: cheapest of ${shipstation.allRates.length} rate${shipstation.allRates.length === 1 ? "" : "s"}${shipstation.cheapest.rate_id ? ` (rate ${shipstation.cheapest.rate_id})` : ""}`,
    });
  }
  if (glossary) {
    sources.push({ kb: "unisco_glossary", detail: `Unisco Freight Glossary: ${glossary.term}`, url: glossary.url });
  }

  if (admin) {
    const freightId = await recordLoadTransitFreightAmount(admin, {
      userId,
      enquiryText: rawQuery,
      geography: GEOGRAPHY,
      zipcode: parsed.zipcode,
      stateCode: parsed.stateCode,
      weightPounds,
      entry,
      shipstation,
    });
    const cacheId = usesCache
      ? await upsertEstimate(admin, {
          geography: GEOGRAPHY,
          zipOrState: parsed.cacheKey,
          queryType: parsed.queryType,
          answer,
          sources,
          loadTransitFreightAmountId: freightId,
        })
      : null;
    await recordEnquiry(admin, {
      userId,
      enquiryText: rawQuery,
      geography: GEOGRAPHY,
      zipOrState: parsed.cacheKey,
      queryType: parsed.queryType,
      answeredFromCache: false,
      cacheId,
      loadTransitFreightAmountId: freightId,
    });
  }

  return { cached: false, answer, sources };
}
