import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_URL } from "../helpers/env";
import { createE2ELoad, deleteE2ELoads } from "../helpers/fixtures";
import { createAdminClient, createUserClient } from "../helpers/supabaseAdmin";
import { cookieHeader, roleUser, type TestUser } from "../helpers/testUser";

const audit = (client: ReturnType<typeof createAdminClient>) => client.schema("operational_excellence_governance").from("audit_events");

// Priority: P0 -- C9: the audit log can be read but never changed or removed, by anyone.
describe("audit-log-immutable", () => {
  const admin = createAdminClient();
  let newestId: number;
  let viewer: TestUser;
  let loadId: string;

  beforeAll(async () => {
    viewer = await roleUser("viewer");
    // A new load is audited by a database trigger in the same transaction.
    loadId = (await createE2ELoad()).id;
    const { data, error } = await audit(admin).select("id, event_type").eq("load_id", loadId).eq("entity_type", "load").eq("event_type", "created").single();
    if (error || !data) throw new Error(`The new load wrote no load.created audit event: ${error?.message}`);
    newestId = data.id as number;
  });

  afterAll(async () => {
    // The load goes; its audit events stay, by design.
    if (loadId) await deleteE2ELoads([loadId]);
  });

  // Two layers: no role is granted update/delete (refused before the row is touched), and a
  // guard trigger raises AUDIT_IMMUTABLE for anyone who gets past the grants.
  it("refuses to change an event, even for the service role", async () => {
    const { error } = await audit(admin).update({ event_type: "tampered" }).eq("id", newestId);
    expect(error?.message).toMatch(/AUDIT_IMMUTABLE|permission denied for table audit_events/);
    const { data } = await audit(admin).select("event_type").eq("id", newestId).single();
    expect(data?.event_type).toBe("created");
  });

  it("keeps a load's audit events after the load is deleted", async () => {
    const other = await createE2ELoad();
    await deleteE2ELoads([other.id]);
    const { data } = await audit(admin).select("event_type").eq("load_id", other.id);
    expect(data?.map((e) => e.event_type)).toContain("created");
  });

  it("refuses to delete an event, even for the service role", async () => {
    const { error } = await audit(admin).delete().eq("id", newestId);
    expect(error?.message).toMatch(/AUDIT_IMMUTABLE|permission denied for table audit_events/);
    const { data } = await audit(admin).select("id").eq("id", newestId);
    expect(data).toHaveLength(1);
  });

  it("lets a signed-in user read events but not write them", async () => {
    const client = await createUserClient(viewer.email, viewer.password);
    const read = await audit(client).select("id").eq("id", newestId);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(1);

    const write = await audit(client).insert({ entity_type: "load", entity_id: "forged", event_type: "created", payload: {} });
    expect(write.error).not.toBeNull();
  });

  it("shows the audit log on the Reports page", async () => {
    const res = await fetch(`${APP_URL}/reports`, { headers: { Cookie: await cookieHeader(viewer) }, redirect: "manual" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Audit log");
    expect(html).not.toContain("No audit events yet.");
  });
});
