import { EstimateInputError, type QueryType } from "@/lib/estimate/types";
import { findStateInText, stateFromZip } from "@/lib/estimate/usStates";

// Freight terms that trigger a Unisco glossary lookup (KB3). Every slug was checked to
// have a real page on unisco.com/freight-glossary (2026-10-08); unknown slugs return the
// site's generic page, which glossary.ts discards.
const GLOSSARY_TERMS: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /\breefer\b|refrigerated|temperature[\s-]controlled/i, slug: "temperature-controlled-shipping" },
  { pattern: /\bltl\b|less[\s-]than[\s-]truckload/i, slug: "less-than-truckload-ltl" },
  { pattern: /\bftl\b|full[\s-]truckload/i, slug: "full-truckload-shipping" },
  { pattern: /\bintermodal\b/i, slug: "intermodal" },
  { pattern: /\baccessorial/i, slug: "accessorial-charge" },
  { pattern: /\bfreight\s*class\b/i, slug: "freight-class" },
  { pattern: /\bbill\s*of\s*lading\b|\bbol\b/i, slug: "bill-of-lading" },
  { pattern: /\bdrayage\b/i, slug: "drayage" },
  { pattern: /\bpallet/i, slug: "palletization" },
];

export type ParsedQuery = {
  zipcode: string | null;
  stateCode: string;
  cacheKey: string;
  queryType: QueryType;
  weightPounds: number | null;
  glossarySlug: string | null;
};

export function parseQuery(rawQuery: string): ParsedQuery {
  const zipMatch = rawQuery.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zipcode = zipMatch ? zipMatch[1] : null;
  const stateCode = zipcode ? stateFromZip(zipcode) : findStateInText(rawQuery);

  if (!stateCode) {
    throw new EstimateInputError(
      zipcode
        ? `ZIP code ${zipcode} isn't in a US state we can route to.`
        : "Please include a US zip code or state name."
    );
  }

  const asksCost = /\b(cost|price|rate|quote|how much|freight amount|\$|dollars?|usd)\b/i.test(rawQuery);
  const asksTransit = /\b(transit|how long|days?|deliver(y|ed)?|eta|arrive|time)\b/i.test(rawQuery);
  const queryType: QueryType = asksCost && !asksTransit ? "cost" : asksTransit && !asksCost ? "transit_time" : "both";

  const weightMatch = rawQuery.match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?)\b/i);
  const weightPounds = weightMatch ? Number(weightMatch[1]) : null;

  const glossarySlug = GLOSSARY_TERMS.find((t) => t.pattern.test(rawQuery))?.slug ?? null;

  return {
    zipcode,
    stateCode,
    cacheKey: zipcode ?? stateCode,
    queryType,
    weightPounds: weightPounds && weightPounds > 0 ? weightPounds : null,
    glossarySlug,
  };
}
