import type { SupabaseClient } from "@supabase/supabase-js";
import { getLoad, type LoadRow } from "@/lib/freight/loadQueries";
import { rankCandidates } from "@/lib/freight/rankCandidates";
import { channelFor, type ChannelName, type OutreachChannel, type OutreachMessage } from "@/lib/freight/outreachChannels";
import { activePauses, assertNotPaused, ScopePausedError } from "@/lib/freight/controlPlane";
import { EQUIPMENT_LABELS, formatDateTimeUtc, formatPounds } from "@/lib/utils/format";

export type OutreachMode = "test" | "live";

export type OutreachOutcome = {
  carrierId: string;
  carrierName: string;
  channel: ChannelName | null;
  status: "simulated" | "sent" | "failed" | "skipped";
  recipient: string | null;
  channelReference: string | null;
  reason?: string;
};

export type OutreachBatchResult = {
  batchId: string;
  mode: OutreachMode;
  contacted: OutreachOutcome[];
  skipped: OutreachOutcome[];
  remainingCandidates: number;
};

export class OutreachBlockedError extends Error {
  constructor(message: string, readonly code: string, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

type Contact = {
  id: string;
  carrier_id: string;
  email: string | null;
  phone: string | null;
  preferred_channel: "sms" | "email" | "voice" | null;
  opt_out: boolean;
};

const DEFAULT_DISCLOSURE = "This is an automated message from MOTS ShipIt. Reply STOP to opt out.";
const BLOCKED_STATUSES = new Set(["booked", "cancelled", "exception"]);

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export function outreachSettings() {
  return {
    // Anything other than an explicit "live" is test mode: no real carrier is ever contacted by default.
    mode: (process.env.OUTREACH_MODE === "live" ? "live" : "test") as OutreachMode,
    testEmail: process.env.OUTREACH_TEST_EMAIL || null,
    testPhone: process.env.OUTREACH_TEST_PHONE || null,
    maxMessagesPerContactPerDay: positiveInt(process.env.OUTREACH_MAX_MESSAGES_PER_CONTACT_PER_DAY, 3),
    batchWaitMinutes: positiveInt(process.env.OUTREACH_BATCH_WAIT_MINUTES, 30),
  };
}

// Load facts only. Target rate and rate ceiling are never shared with carriers.
export function buildMessage(load: LoadRow, disclosure: string): OutreachMessage {
  const lane = `${load.origin_state_code ?? ""} ${load.origin_zipcode} to ${load.destination_state_code ?? ""} ${load.destination_zipcode}`.replace(/\s+/g, " ").trim();
  const body = [
    disclosure,
    "",
    `Load ${load.external_id} needs a carrier:`,
    `Lane: ${lane}`,
    `Equipment: ${EQUIPMENT_LABELS[load.equipment_type] ?? load.equipment_type}`,
    `Weight: ${formatPounds(load.weight_pounds)}`,
    `Commodity: ${load.commodity}`,
    `Pickup: ${formatDateTimeUtc(load.scheduled_pickup_at)}`,
    `Delivery: ${formatDateTimeUtc(load.scheduled_delivery_at)}`,
    "",
    "Reply with your rate and availability if you can cover it.",
  ].join("\n");
  return { subject: `Load ${load.external_id}: ${lane}, ${EQUIPMENT_LABELS[load.equipment_type] ?? load.equipment_type}`, body };
}

function pickChannel(contact: Contact | null, mode: OutreachMode, settings: ReturnType<typeof outreachSettings>):
  { channel: ChannelName; recipient: string | null } | null {
  if (mode === "test") {
    // Test mode never uses the carrier's real address; it goes to the test recipient or is simulated.
    if (settings.testEmail) return { channel: "email", recipient: settings.testEmail };
    if (settings.testPhone) return { channel: "sms", recipient: settings.testPhone };
    return { channel: "email", recipient: null };
  }
  if (!contact) return null;
  if (contact.preferred_channel === "sms" && contact.phone) return { channel: "sms", recipient: contact.phone };
  if (contact.email) return { channel: "email", recipient: contact.email };
  if (contact.phone) return { channel: "sms", recipient: contact.phone };
  return null;
}

async function sendWithOneRetry(channel: OutreachChannel, recipient: string | null, message: OutreachMessage) {
  if (!recipient || channel.isSimulated) {
    return { result: await channel.send(recipient ?? "", message), attempts: 1, simulated: true };
  }
  const first = await channel.send(recipient, message);
  if (first.ok) return { result: first, attempts: 1, simulated: false };
  const second = await channel.send(recipient, message);
  return { result: second, attempts: 2, simulated: false };
}

// C4: contact the next N ranked carriers for a load that haven't been contacted for this
// load version yet. Writes use the service role client (admin).
export async function contactBatch(params: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  loadId: string;
  batchSize: number;
  userId: string;
}): Promise<OutreachBatchResult> {
  const { supabase, admin, loadId, batchSize, userId } = params;
  const settings = outreachSettings();

  const load = await getLoad(supabase, loadId);
  if (!load) throw new OutreachBlockedError("Load not found.", "NOT_FOUND");
  if (BLOCKED_STATUSES.has(load.status)) {
    throw new OutreachBlockedError(`No outreach on a load that is ${load.status}.`, "LOAD_NOT_OPEN");
  }
  if (!load.evaluated_at) {
    throw new OutreachBlockedError("The Policy engine hasn't checked this load version yet, so no carrier can be contacted.", "NOT_EVALUATED");
  }

  try {
    await assertNotPaused(admin, {
      agent: "outreach",
      loadId: load.id,
      customerId: load.customer_id,
      originState: load.origin_state_code,
      destinationState: load.destination_state_code,
    });
  } catch (err) {
    if (err instanceof ScopePausedError) throw new OutreachBlockedError(err.message, "PAUSED");
    throw err;
  }
  const pausedChannels = new Set(
    (await activePauses(admin)).filter((p) => p.scope === "channel").map((p) => p.scope_id)
  );

  const { data: previous, error: previousError } = await admin
    .schema("transportation_shipment")
    .from("carrier_interactions")
    .select("carrier_id, status, created_at")
    .eq("load_id", load.id)
    .eq("load_version", load.version)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false });
  if (previousError) throw new Error(`Reading previous outreach failed: ${previousError.message}`);

  // Wait between batches so carriers aren't over-contacted. Only messages that actually went
  // out (sent or simulated) count; a batch where everyone was skipped doesn't start the wait.
  const lastContact = (previous ?? []).find((p) => p.status === "sent" || p.status === "simulated");
  const lastBatchAt = lastContact ? new Date(lastContact.created_at as string).getTime() : null;
  if (lastBatchAt) {
    const waitMs = settings.batchWaitMinutes * 60_000 - (Date.now() - lastBatchAt);
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      throw new OutreachBlockedError(
        `The last batch went out less than ${settings.batchWaitMinutes} minutes ago. Wait ${Math.ceil(seconds / 60)} more minute(s) before contacting the next carriers.`,
        "BATCH_WAIT",
        seconds
      );
    }
  }

  const alreadyContacted = new Set(
    (previous ?? []).filter((p) => p.status === "sent" || p.status === "simulated").map((p) => p.carrier_id as string)
  );

  const ranking = await rankCandidates(supabase, load.id);
  const remaining = ranking.candidates.filter((c) => !alreadyContacted.has(c.carrierId));

  const { data: policy } = await admin
    .schema("operational_excellence_governance")
    .from("sourcing_policies")
    .select("outreach_disclosure_text")
    .eq("id", load.evaluated_policy_id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  const disclosure = (policy?.outreach_disclosure_text as string | undefined) || DEFAULT_DISCLOSURE;
  const message = buildMessage(load, disclosure);

  const { data: contactRows, error: contactError } = await admin
    .schema("data_foundation")
    .from("carrier_contacts")
    .select("id, carrier_id, email, phone, preferred_channel, opt_out")
    .in("carrier_id", remaining.map((c) => c.carrierId).concat("00000000-0000-0000-0000-000000000000"));
  if (contactError) throw new Error(`Reading carrier contacts failed: ${contactError.message}`);
  const contacts = (contactRows ?? []) as Contact[];

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const batchId = crypto.randomUUID();
  const contacted: OutreachOutcome[] = [];
  const skipped: OutreachOutcome[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const candidate of remaining) {
    if (contacted.length >= batchSize) break;

    const carrierContacts = contacts.filter((c) => c.carrier_id === candidate.carrierId);
    const usable = carrierContacts.filter((c) => !c.opt_out);
    // Opted-out contacts are never contacted and never count toward the batch.
    if (carrierContacts.length > 0 && usable.length === 0) {
      skipped.push({ carrierId: candidate.carrierId, carrierName: candidate.name, channel: null, status: "skipped", recipient: null, channelReference: null, reason: "opted_out" });
      continue;
    }
    const contact = usable[0] ?? null;

    if (contact && settings.mode === "live") {
      const { count } = await admin
        .schema("transportation_shipment")
        .from("carrier_interactions")
        .select("id", { count: "exact", head: true })
        .eq("carrier_contact_id", contact.id)
        .in("status", ["sent", "simulated"])
        .gte("created_at", dayAgo);
      if ((count ?? 0) >= settings.maxMessagesPerContactPerDay) {
        skipped.push({ carrierId: candidate.carrierId, carrierName: candidate.name, channel: null, status: "skipped", recipient: null, channelReference: null, reason: "frequency_cap" });
        continue;
      }
    }

    const route = pickChannel(contact, settings.mode, settings);
    if (!route) {
      skipped.push({ carrierId: candidate.carrierId, carrierName: candidate.name, channel: null, status: "skipped", recipient: null, channelReference: null, reason: "no_contact" });
      continue;
    }
    if (pausedChannels.has(route.channel)) {
      skipped.push({ carrierId: candidate.carrierId, carrierName: candidate.name, channel: route.channel, status: "skipped", recipient: null, channelReference: null, reason: "channel_paused" });
      continue;
    }

    const channel = channelFor(route.channel);
    const { result, attempts, simulated } = await sendWithOneRetry(channel, route.recipient, message);
    const status = !result.ok ? "failed" : simulated ? "simulated" : "sent";
    const outcome: OutreachOutcome = {
      carrierId: candidate.carrierId,
      carrierName: candidate.name,
      channel: route.channel,
      status,
      recipient: route.recipient,
      channelReference: result.ok ? result.channelReference : null,
      reason: result.ok ? undefined : result.error,
    };
    // A failed send is logged and that carrier is skipped this round; the batch carries on.
    if (status === "failed") skipped.push(outcome);
    else contacted.push(outcome);

    rows.push({
      load_id: load.id,
      load_version: load.version,
      carrier_id: candidate.carrierId,
      carrier_contact_id: contact?.id ?? null,
      batch_id: batchId,
      direction: "outbound",
      channel: route.channel,
      outreach_mode: settings.mode,
      status,
      recipient: route.recipient,
      disclosure_text: disclosure,
      message_text: message.body,
      channel_reference: outcome.channelReference,
      error_message: result.ok ? null : result.error,
      attempts,
      sent_by: userId,
    });
  }

  for (const s of skipped.filter((x) => x.status === "skipped")) {
    rows.push({
      load_id: load.id,
      load_version: load.version,
      carrier_id: s.carrierId,
      batch_id: batchId,
      direction: "outbound",
      channel: "email",
      outreach_mode: settings.mode,
      status: "skipped",
      disclosure_text: disclosure,
      message_text: message.body,
      skip_reason: s.reason,
      attempts: 0,
      sent_by: userId,
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await admin.schema("transportation_shipment").from("carrier_interactions").insert(rows);
    if (insertError) throw new Error(`Logging outreach failed: ${insertError.message}`);
  }

  if (contacted.length > 0 && load.status === "sourcing") {
    const { error: statusError } = await admin
      .schema("transportation_shipment")
      .from("loads")
      .update({ status: "negotiating", updated_at: new Date().toISOString() })
      .eq("id", load.id)
      .eq("version", load.version);
    if (statusError) throw new Error(`Updating the load status failed: ${statusError.message}`);
  }

  return {
    batchId,
    mode: settings.mode,
    contacted,
    skipped,
    remainingCandidates: Math.max(0, remaining.length - contacted.length - skipped.length),
  };
}

// Sends one follow-up message (for example a counter-offer) to a carrier under the same
// test/live rules as outreach, and logs it verbatim in carrier_interactions.
export async function sendCarrierMessage(params: {
  admin: SupabaseClient;
  load: LoadRow;
  carrierId: string;
  body: string;
  subject: string;
  userId: string;
}): Promise<{ status: "simulated" | "sent" | "failed" | "skipped"; recipient: string | null }> {
  const { admin, load, carrierId, body, subject, userId } = params;
  const settings = outreachSettings();

  const { data: contactRows } = await admin
    .schema("data_foundation")
    .from("carrier_contacts")
    .select("id, carrier_id, email, phone, preferred_channel, opt_out")
    .eq("carrier_id", carrierId);
  const contact = ((contactRows ?? []) as Contact[]).find((c) => !c.opt_out) ?? null;
  const allOptedOut = (contactRows ?? []).length > 0 && !contact;

  const { data: policy } = await admin
    .schema("operational_excellence_governance")
    .from("sourcing_policies")
    .select("outreach_disclosure_text")
    .eq("id", load.evaluated_policy_id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  const disclosure = (policy?.outreach_disclosure_text as string | undefined) || DEFAULT_DISCLOSURE;
  const message = { subject, body: `${disclosure}\n\n${body}` };

  const route = allOptedOut ? null : pickChannel(contact, settings.mode, settings);
  let status: "simulated" | "sent" | "failed" | "skipped" = "skipped";
  let reference: string | null = null;
  let error: string | null = null;
  let attempts = 0;
  if (route) {
    const sent = await sendWithOneRetry(channelFor(route.channel), route.recipient, message);
    attempts = sent.attempts;
    status = !sent.result.ok ? "failed" : sent.simulated ? "simulated" : "sent";
    reference = sent.result.ok ? sent.result.channelReference : null;
    error = sent.result.ok ? null : sent.result.error;
  }

  const { error: insertError } = await admin.schema("transportation_shipment").from("carrier_interactions").insert({
    load_id: load.id,
    load_version: load.version,
    carrier_id: carrierId,
    carrier_contact_id: contact?.id ?? null,
    batch_id: crypto.randomUUID(),
    direction: "outbound",
    channel: route?.channel ?? "email",
    outreach_mode: settings.mode,
    status,
    recipient: route?.recipient ?? null,
    disclosure_text: disclosure,
    message_text: message.body,
    channel_reference: reference,
    skip_reason: route ? null : allOptedOut ? "opted_out" : "no_contact",
    error_message: error,
    attempts,
    sent_by: userId,
  });
  if (insertError) throw new Error(`Logging the message failed: ${insertError.message}`);
  return { status, recipient: route?.recipient ?? null };
}
