import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { activePauses, assertNotPaused, isPaused, laneKey, ScopePausedError, type ControlActionRow } from "@/lib/freight/controlPlane";

let clock = 0;
const action = (scope: ControlActionRow["scope"], scopeId: string | null, kind: "pause" | "resume", reason = "test"): ControlActionRow => ({
  id: `ca-${++clock}`,
  actor_id: "user-1",
  scope,
  scope_id: scopeId,
  action: kind,
  reason,
  created_at: new Date(Date.UTC(2026, 9, 8, 0, clock)).toISOString(),
});

// Just enough of the Supabase query builder for activePauses(): rows come back newest first.
function fakeClient(rows: ControlActionRow[]): SupabaseClient {
  const newestFirst = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const chain = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    limit: async () => ({ data: newestFirst, error: null }),
  };
  return { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient;
}

describe("control plane", () => {
  it("treats the latest pause or resume per scope as the current state", async () => {
    const client = fakeClient([
      action("load", "L1", "pause"),
      action("load", "L1", "resume"),
      action("agent", "booking", "resume"),
      action("agent", "booking", "pause", "TMS outage"),
    ]);
    const pauses = await activePauses(client);
    expect(pauses.map((p) => `${p.scope}:${p.scope_id}`)).toEqual(["agent:booking"]);
    expect(await isPaused(client, "load", "L1")).toBe(false);
    expect(await isPaused(client, "agent", "booking")).toBe(true);
  });

  it("blocks an action under any matching scope: global, agent, load, customer, lane", async () => {
    const context = { agent: "outreach" as const, loadId: "L1", customerId: "C1", originState: "TN", destinationState: "GA", channel: "email" as const };
    const cases: Array<[ControlActionRow["scope"], string | null]> = [
      ["global", null],
      ["agent", "outreach"],
      ["load", "L1"],
      ["customer", "C1"],
      ["lane", "TN-GA"],
      ["channel", "email"],
    ];
    for (const [scope, scopeId] of cases) {
      const attempt = assertNotPaused(fakeClient([action(scope, scopeId, "pause", `${scope} paused`)]), context);
      await expect(attempt, scope).rejects.toBeInstanceOf(ScopePausedError);
      await expect(attempt, scope).rejects.toMatchObject({ code: "PAUSED", scope, scopeId });
    }
  });

  it("lets an action through when only other scopes are paused", async () => {
    const client = fakeClient([
      action("agent", "booking", "pause"),
      action("load", "L2", "pause"),
      action("lane", "TN-FL", "pause"),
    ]);
    await expect(assertNotPaused(client, { agent: "outreach", loadId: "L1", originState: "TN", destinationState: "GA" })).resolves.toBeUndefined();
  });

  it("names the pause and how to undo it", () => {
    const error = new ScopePausedError("global", null, "Carrier fraud alert");
    expect(error.message).toBe(
      "Paused by the control plane (everything): Carrier fraud alert. An administrator or operations manager must resume it first."
    );
  });

  it("builds lane keys even when a state is unknown", () => {
    expect(laneKey("TN", "GA")).toBe("TN-GA");
    expect(laneKey(null, "GA")).toBe("??-GA");
  });
});
