import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLoad } from "@/lib/freight/loadQueries";
import { loadRankingInputs, raiseNoCandidatesException, rankCarriers, type CandidateList } from "@/lib/freight/carrierRanking";

export class LoadNotFoundError extends Error {}
export class LoadNotRankableError extends Error {}

const RANKABLE_STATUSES = new Set(["sourcing", "negotiating"]);

// GET /api/loads/:id/candidates and the load detail page both use this.
export async function rankCandidates(supabase: SupabaseClient, loadId: string): Promise<CandidateList> {
  const load = await getLoad(supabase, loadId);
  if (!load) throw new LoadNotFoundError(`No load ${loadId}`);
  if (!RANKABLE_STATUSES.has(load.status)) {
    throw new LoadNotRankableError(`Load is ${load.status}; only loads that passed the policy engine are ranked.`);
  }

  const inputs = await loadRankingInputs(supabase, load);
  const result = rankCarriers({ load, ...inputs });

  if (result.candidates.length === 0) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await raiseNoCandidatesException(createAdminClient(), load, result.excluded);
    } else {
      console.warn("[carrier ranking] no candidates, but SUPABASE_SERVICE_ROLE_KEY is not set -- exception not raised.");
    }
  }
  return result;
}
