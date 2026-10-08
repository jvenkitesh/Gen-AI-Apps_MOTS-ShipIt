import type { SupabaseClient } from "@supabase/supabase-js";

export type ComplianceCheck = {
  id: string;
  carrier_id: string;
  checked_at: string;
  source: "fmcsa" | "manual";
  result: "pass" | "block";
  authority_status: string | null;
  insurance_status: string | null;
  safety_rating: string | null;
  out_of_service: boolean | null;
  fraud_risk_score: number | null;
  reasons: string[];
};

export type ComplianceStatus =
  | { state: "fresh"; check: ComplianceCheck }
  | { state: "stale"; lastCheckedAt: string | null; reason: string };

const CHECK_COLUMNS =
  "id, carrier_id, checked_at, source, result, authority_status, insurance_status, safety_rating, out_of_service, fraud_risk_score, reasons";

export function freshnessHours(): number {
  const n = Number(process.env.COMPLIANCE_FRESHNESS_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

export const COMPLIANCE_REASON_TEXT: Record<string, string> = {
  authority_inactive: "Operating authority is not active",
  insurance_insufficient: "Liability insurance on file is below the required amount",
  out_of_service: "Carrier has an out-of-service order",
  safety_unsatisfactory: "Safety rating is Unsatisfactory",
  manual_block: "Blocked by a compliance analyst",
};

// FMCSA QCMobile carrier snapshot. Needs FMCSA_WEB_KEY and the carrier's USDOT number.
async function checkWithFmcsa(usdotNumber: string): Promise<Omit<ComplianceCheck, "id" | "carrier_id" | "checked_at"> & { evidence: unknown } | null> {
  const webKey = process.env.FMCSA_WEB_KEY;
  if (!webKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `https://mobile.fmcsa.dot.gov/qc/services/carriers/${encodeURIComponent(usdotNumber)}?webKey=${encodeURIComponent(webKey)}`,
      { signal: controller.signal, cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { content?: { carrier?: Record<string, unknown> } } | null;
    const carrier = json?.content?.carrier;
    if (!carrier) return null;

    const allowed = carrier.allowedToOperate === "Y";
    const onFile = Number(carrier.bipdInsuranceOnFile ?? 0);
    const required = Number(carrier.bipdInsuranceRequired ?? carrier.bipdRequiredAmount ?? 0);
    const insuranceOk = onFile > 0 && onFile >= required;
    const outOfService = Boolean(carrier.oosDate);
    const safety = typeof carrier.safetyRating === "string" ? carrier.safetyRating : null;

    const reasons: string[] = [];
    if (!allowed) reasons.push("authority_inactive");
    if (!insuranceOk) reasons.push("insurance_insufficient");
    if (outOfService) reasons.push("out_of_service");
    if (safety === "U") reasons.push("safety_unsatisfactory");

    return {
      source: "fmcsa",
      result: reasons.length === 0 ? "pass" : "block",
      authority_status: allowed ? "active" : "inactive",
      insurance_status: insuranceOk ? "valid" : "insufficient",
      safety_rating: safety,
      out_of_service: outOfService,
      fraud_risk_score: null,
      reasons,
      evidence: carrier,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// C6: returns a check from inside the freshness window, re-checking with FMCSA when it can.
// Anything else is "stale" and callers must block the commitment -- never proceed optimistically.
// Always called at the moment of commitment, never reused from an earlier result.
export async function getFreshCompliance(admin: SupabaseClient, carrierId: string): Promise<ComplianceStatus> {
  const since = new Date(Date.now() - freshnessHours() * 60 * 60 * 1000).toISOString();
  const { data: latest, error } = await admin
    .schema("operational_excellence_governance")
    .from("carrier_compliance_checks")
    .select(CHECK_COLUMNS)
    .eq("carrier_id", carrierId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle<ComplianceCheck>();
  if (error) return { state: "stale", lastCheckedAt: null, reason: `Compliance data unavailable: ${error.message}` };
  if (latest && latest.checked_at >= since) return { state: "fresh", check: latest };

  const { data: carrier } = await admin.schema("data_foundation").from("carriers").select("usdot_number").eq("id", carrierId).maybeSingle();
  const usdot = carrier?.usdot_number as string | null | undefined;
  const fmcsa = usdot ? await checkWithFmcsa(usdot) : null;
  if (fmcsa) {
    const { evidence, ...fields } = fmcsa;
    const { data: saved, error: saveError } = await admin
      .schema("operational_excellence_governance")
      .from("carrier_compliance_checks")
      .insert({ carrier_id: carrierId, ...fields, evidence })
      .select(CHECK_COLUMNS)
      .single<ComplianceCheck>();
    if (!saveError && saved) return { state: "fresh", check: saved };
  }

  return {
    state: "stale",
    lastCheckedAt: latest?.checked_at ?? null,
    reason: !usdot
      ? "No fresh compliance check, and the carrier has no USDOT number for an FMCSA check. A compliance analyst must verify the carrier."
      : "No fresh compliance check, and the FMCSA check is unavailable. A compliance analyst must verify the carrier.",
  };
}

export async function recordManualCheck(
  admin: SupabaseClient,
  params: { carrierId: string; result: "pass" | "block"; authorityActive: boolean; insuranceValid: boolean; note: string; userId: string }
): Promise<ComplianceCheck> {
  const reasons: string[] = [];
  if (!params.authorityActive) reasons.push("authority_inactive");
  if (!params.insuranceValid) reasons.push("insurance_insufficient");
  if (params.result === "block") reasons.push("manual_block");
  const result = params.result === "pass" && reasons.length === 0 ? "pass" : "block";

  const { data, error } = await admin
    .schema("operational_excellence_governance")
    .from("carrier_compliance_checks")
    .insert({
      carrier_id: params.carrierId,
      source: "manual",
      result,
      authority_status: params.authorityActive ? "active" : "inactive",
      insurance_status: params.insuranceValid ? "valid" : "insufficient",
      reasons,
      evidence: { note: params.note },
      checked_by: params.userId,
    })
    .select(CHECK_COLUMNS)
    .single<ComplianceCheck>();
  if (error || !data) throw new Error(`Saving the compliance check failed: ${error?.message ?? "no row"}`);
  return data;
}
