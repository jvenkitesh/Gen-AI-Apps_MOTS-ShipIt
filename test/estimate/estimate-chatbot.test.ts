import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/api";
import { cookieHeader, roleUser } from "../helpers/testUser";

type Answer = {
  summary: string;
  best_choice: "routing_guide" | "shipstation" | null;
  usd_estimate: number | null;
  routing_guide_cost: number | null;
  shipstation_cost: number | null;
  weight_pounds: number;
  weight_assumed: boolean;
  ship_to: string | null;
};

// Priority: P0 -- the load-estimate chatbot. One live call: routing guide (KB1),
// ShipStation sandbox rate estimate (KB2) and an OpenAI-written summary.
describe("estimate-chatbot", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await cookieHeader(await roleUser("viewer"));
  });

  it("rejects an empty question with 400", async () => {
    const res = await api("/api/estimate", { body: { query: "x" }, cookie });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "VALIDATION_ERROR" });
  });

  it("asks for a location when the question has none", async () => {
    const res = await api("/api/estimate", { body: { query: "What does freight cost?" }, cookie });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "NO_LOCATION", message: "Please include a US zip code or state name." });
  });

  it("answers with the cheaper of the routing guide and ShipStation (live)", async () => {
    const res = await api<{ cached: boolean; answer: Answer; sources: Array<{ kb: string }> }>("/api/estimate", {
      body: { query: "What does it cost to ship 150 lbs to 30303?" },
      cookie,
    });
    expect(res.status).toBe(200);
    // A stated weight is always calculated fresh, never served from the cache.
    expect(res.body.cached).toBe(false);

    const answer = res.body.answer;
    expect(answer).toMatchObject({ weight_pounds: 150, weight_assumed: false });
    expect(answer.ship_to).toContain("30303");
    expect(answer.summary.length).toBeGreaterThan(20);
    expect(answer.routing_guide_cost).toBeGreaterThan(0);

    const shipStationCheaper = answer.shipstation_cost !== null && answer.shipstation_cost < answer.routing_guide_cost!;
    expect(answer.best_choice).toBe(shipStationCheaper ? "shipstation" : "routing_guide");
    expect(answer.usd_estimate).toBe(shipStationCheaper ? answer.shipstation_cost : answer.routing_guide_cost);

    const kbs = res.body.sources.map((s) => s.kb);
    expect(kbs[0]).toBe("routing_guide");
    if (answer.shipstation_cost !== null) expect(kbs).toContain("shipstation");
  });
});
