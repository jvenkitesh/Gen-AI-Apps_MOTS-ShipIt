import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/api";
import { createE2ELoad, deleteE2ELoads } from "../helpers/fixtures";
import { createAdminClient } from "../helpers/supabaseAdmin";
import { cookieHeader, roleUser } from "../helpers/testUser";

type Candidate = { carrierId: string; name: string; score: number };
type Offer = { id: string; status: string; rate_dollars: number; carrier_id: string };
type Booking = { id: string; status: string; rate_dollars: number; tms_sync_status: string; tms_last_error: string | null };

// Priority: P0 -- the core product path, end to end through the real API:
// TMS load -> ranked carriers -> outreach (test mode) -> carrier replies read by the real
// OpenAI model -> ceiling and approval limits -> fresh compliance -> atomic booking -> audit.
// Runs steps in order; each step depends on the one before.
describe("negotiation-booking-golden-path", () => {
  const admin = createAdminClient();
  let loadId: string;
  let externalId: string;
  let planner: string;
  let manager: string;
  let analyst: string;
  let viewer: string;
  let candidates: Candidate[];
  let goodOffer: Offer;
  let complianceCheckIds: string[] = [];
  const bookingKey = `e2e-${randomUUID()}`;
  let booking: Booking;

  beforeAll(async () => {
    [planner, manager, analyst, viewer] = await Promise.all([
      roleUser("transportation_planner").then(cookieHeader),
      roleUser("supply_chain_operations_manager").then(cookieHeader),
      roleUser("compliance_analyst").then(cookieHeader),
      roleUser("viewer").then(cookieHeader),
    ]);
    // Memphis to Los Angeles: California has two carriers in the routing guide (BNSF, FedEx).
    const load = await createE2ELoad({ destination_zipcode: "90012" });
    loadId = load.id;
    externalId = load.payload.external_id;
  });

  afterAll(async () => {
    // Manual checks made by this test would make the carrier look verified for 24 hours.
    if (complianceCheckIds.length > 0) {
      await admin.schema("operational_excellence_governance").from("carrier_compliance_checks").delete().in("id", complianceCheckIds);
    }
    // A booked load can't be deleted; it stays, labelled E2E-. Otherwise it's removed.
    if (loadId) await deleteE2ELoads([loadId]);
  });

  it("ranks carriers for the load from the routing guide", async () => {
    const res = await api<{ candidates: Candidate[] }>(`/api/loads/${loadId}/candidates`, { cookie: planner });
    expect(res.status).toBe(200);
    candidates = res.body.candidates;
    expect(candidates.length, "TN to CA needs at least two carriers in the routing guide").toBeGreaterThanOrEqual(2);
    const scores = candidates.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("contacts the top two carriers in test mode, never their real addresses", async () => {
    const res = await api<{ mode: string; contacted: Array<{ carrierId: string; status: string; recipient: string | null }> }>(
      `/api/loads/${loadId}/outreach`,
      { body: { batchSize: 2 }, cookie: planner }
    );
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("test");
    expect(res.body.contacted.map((c) => c.carrierId)).toEqual(candidates.slice(0, 2).map((c) => c.carrierId));
    for (const c of res.body.contacted) {
      expect(c.status).toBe("simulated");
      expect([process.env.OUTREACH_TEST_EMAIL ?? null, null]).toContain(c.recipient);
    }
    const { data: load } = await admin.schema("transportation_shipment").from("loads").select("status").eq("id", loadId).single();
    expect(load?.status).toBe("negotiating");
  });

  it("makes the next batch wait (429 BATCH_WAIT)", async () => {
    const res = await api(`/api/loads/${loadId}/outreach`, { body: { batchSize: 1 }, cookie: planner });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: "BATCH_WAIT" });
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("refuses a reply from a carrier that wasn't contacted", async () => {
    const res = await api(`/api/loads/${loadId}/replies`, { body: { carrierId: randomUUID(), replyText: "We can do $900." }, cookie: planner });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "NOT_CONTACTED" });
  });

  it("reads a clear price from a carrier reply with the live AI model (proposed offer)", async () => {
    const res = await api<{ kind: string; blocked: boolean; offer: Offer }>(`/api/loads/${loadId}/replies`, {
      body: { carrierId: candidates[0].carrierId, replyText: `Hi, we can cover load ${externalId} for $1,000 all-in. Pickup confirmed.` },
      cookie: planner,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kind: "offer", blocked: false, offer: { status: "proposed", rate_dollars: 1000 } });
    goodOffer = res.body.offer;
  });

  it("blocks an offer above the rate ceiling and raises an exception", async () => {
    const res = await api<{ kind: string; blocked: boolean; offer: Offer }>(`/api/loads/${loadId}/replies`, {
      body: { carrierId: candidates[1].carrierId, replyText: `Our all-in rate for load ${externalId} is $1,500.` },
      cookie: planner,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kind: "offer", blocked: true, offer: { status: "blocked", rate_dollars: 1500 } });

    const { data } = await admin
      .schema("operational_excellence_governance")
      .from("operational_exceptions")
      .select("trigger_type")
      .eq("load_id", loadId)
      .eq("trigger_type", "rate_above_ceiling");
    expect(data).toHaveLength(1);
  });

  it("refuses a counter above the ceiling (422)", async () => {
    const res = await api(`/api/offers/${goodOffer.id}/respond`, { body: { action: "counter", counterRateDollars: 5000 }, cookie: planner });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "ABOVE_CEILING" });
  });

  it("stops a viewer, and a planner above their $800 approval limit", async () => {
    const asViewer = await api(`/api/offers/${goodOffer.id}/respond`, { body: { action: "approve" }, cookie: viewer });
    expect(asViewer.status).toBe(403);
    const asPlanner = await api(`/api/offers/${goodOffer.id}/respond`, { body: { action: "approve" }, cookie: planner });
    expect(asPlanner.status).toBe(403);
    expect(asPlanner.body).toMatchObject({ error: "NEEDS_ESCALATION" });
  });

  it("blocks approval without a fresh compliance check, then allows it after one (fail closed)", async () => {
    const carrierId = goodOffer.carrier_id;
    const status = await api<{ snapshot?: { result: string } }>(`/api/carriers/${carrierId}/compliance`, { cookie: manager });

    if (status.status === 409) {
      const blocked = await api(`/api/offers/${goodOffer.id}/respond`, { body: { action: "approve" }, cookie: manager });
      expect(blocked.status).toBe(409);
      expect(blocked.body).toMatchObject({ error: "COMPLIANCE_UNAVAILABLE" });

      const check = await api<{ snapshot: { id: string; result: string } }>(`/api/carriers/${carrierId}/compliance`, {
        body: { result: "pass", authorityActive: true, insuranceValid: true, note: "E2E automated test: manual verification" },
        cookie: analyst,
      });
      expect(check.status).toBe(201);
      expect(check.body.snapshot.result).toBe("pass");
      complianceCheckIds.push(check.body.snapshot.id);
    } else {
      // Someone verified this carrier in the last 24 hours; the stale path can't be shown here.
      expect(status.status).toBe(200);
      expect(status.body.snapshot?.result).toBe("pass");
    }

    const approved = await api<{ status: string }>(`/api/offers/${goodOffer.id}/respond`, { body: { action: "approve" }, cookie: manager });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("accepted");
  });

  it("books the accepted offer once; the booking stands even if the TMS write-back fails", async () => {
    const res = await api<{ booking: Booking; outcome: string }>(`/api/loads/${loadId}/book`, {
      body: { offerId: goodOffer.id, idempotencyKey: bookingKey },
      cookie: planner,
    });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("created");
    booking = res.body.booking;
    expect(booking).toMatchObject({ status: "active", rate_dollars: 1000 });
    expect(["synced", "failed"]).toContain(booking.tms_sync_status);
    if (!process.env.TMS_BOOKING_WEBHOOK_URL) expect(booking.tms_last_error).toMatch(/No TMS is connected/);

    const { data: load } = await admin.schema("transportation_shipment").from("loads").select("status").eq("id", loadId).single();
    expect(load?.status).toBe("booked");
  });

  it("returns the same booking for a retry with the same key (200)", async () => {
    const res = await api<{ booking: Booking; outcome: string }>(`/api/loads/${loadId}/book`, {
      body: { offerId: goodOffer.id, idempotencyKey: bookingKey },
      cookie: planner,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ outcome: "existing", booking: { id: booking.id } });
  });

  it("never books the same load twice", async () => {
    const res = await api(`/api/loads/${loadId}/book`, { body: { offerId: goodOffer.id, idempotencyKey: `e2e-${randomUUID()}` }, cookie: planner });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "BOOKING_ALREADY_BOOKED" });
    const { data } = await admin.schema("transportation_shipment").from("carrier_bookings").select("id").eq("load_id", loadId);
    expect(data).toHaveLength(1);
  });

  it("closes negotiation once the load is booked", async () => {
    const res = await api(`/api/loads/${loadId}/replies`, { body: { carrierId: candidates[0].carrierId, replyText: "Still available at $990." }, cookie: planner });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "LOAD_NOT_OPEN" });
  });

  it("records every step in the audit trail, including which model read the replies", async () => {
    const { data, error } = await admin
      .schema("operational_excellence_governance")
      .from("audit_events")
      .select("entity_type, event_type, model_version, actor_id")
      .eq("load_id", loadId);
    expect(error).toBeNull();
    const events = (data ?? []).map((e) => `${e.entity_type}.${e.event_type}`);
    for (const expected of ["load.created", "offer.extracted", "offer.proposed", "offer.blocked", "offer.accepted", "booking.committed"]) {
      expect(events, expected).toContain(expected);
    }
    expect(events).toContain("load.status_changed");
    const extracted = (data ?? []).filter((e) => e.event_type === "extracted");
    expect(extracted).toHaveLength(2);
    for (const e of extracted) expect(e.model_version).toBe(process.env.OPENAI_MODEL || "gpt-4o-mini");
    const committed = (data ?? []).find((e) => e.event_type === "committed");
    expect(committed?.actor_id).toBe((await roleUser("transportation_planner")).id);
  });
});
