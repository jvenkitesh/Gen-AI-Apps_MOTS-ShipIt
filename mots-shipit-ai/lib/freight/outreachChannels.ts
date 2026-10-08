export type ChannelName = "email" | "sms";

export type OutreachMessage = { subject: string; body: string };
export type SendResult = { ok: true; channelReference: string } | { ok: false; error: string };

// Every channel (email, SMS, later voice) sends through this one interface, so adding
// a channel never changes the outreach flow.
export interface OutreachChannel {
  readonly name: ChannelName;
  readonly isSimulated: boolean;
  send(recipient: string, message: OutreachMessage): Promise<SendResult>;
}

const TIMEOUT_MS = 10_000;

async function postWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// Email through Resend (RESEND_API_KEY, OUTREACH_FROM_EMAIL).
export class ResendEmailChannel implements OutreachChannel {
  readonly name = "email" as const;
  readonly isSimulated = false;
  constructor(private apiKey: string, private from: string) {}

  async send(recipient: string, message: OutreachMessage): Promise<SendResult> {
    try {
      const res = await postWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [recipient], subject: message.subject, text: message.body }),
      });
      const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!res.ok || !json?.id) return { ok: false, error: `Resend ${res.status}: ${json?.message ?? "no id returned"}` };
      return { ok: true, channelReference: json.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Resend request failed" };
    }
  }
}

// SMS through Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).
export class TwilioSmsChannel implements OutreachChannel {
  readonly name = "sms" as const;
  readonly isSimulated = false;
  constructor(private accountSid: string, private authToken: string, private from: string) {}

  async send(recipient: string, message: OutreachMessage): Promise<SendResult> {
    try {
      const res = await postWithTimeout(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: this.from, To: recipient, Body: message.body }).toString(),
        }
      );
      const json = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
      if (!res.ok || !json?.sid) return { ok: false, error: `Twilio ${res.status}: ${json?.message ?? "no sid returned"}` };
      return { ok: true, channelReference: json.sid };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Twilio request failed" };
    }
  }
}

// Records the message without sending it. Used whenever a real provider isn't configured.
export class SimulatedChannel implements OutreachChannel {
  readonly isSimulated = true;
  constructor(readonly name: ChannelName) {}
  async send(): Promise<SendResult> {
    return { ok: true, channelReference: `simulated-${crypto.randomUUID()}` };
  }
}

export function channelFor(name: ChannelName): OutreachChannel {
  if (name === "email" && process.env.RESEND_API_KEY && process.env.OUTREACH_FROM_EMAIL) {
    return new ResendEmailChannel(process.env.RESEND_API_KEY, process.env.OUTREACH_FROM_EMAIL);
  }
  if (name === "sms" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    return new TwilioSmsChannel(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_FROM_NUMBER);
  }
  return new SimulatedChannel(name);
}
