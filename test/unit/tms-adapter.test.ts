import { createHmac } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { GenericTmsAdapter, type BookingRecord } from "@/lib/freight/tmsAdapter";

const booking: BookingRecord = {
  id: "booking-1",
  load_id: "load-1",
  load_external_id: "E2E-1",
  load_version: 2,
  carrier_id: "carrier-1",
  carrier_name: "Norfolk Southern",
  rate_dollars: 1050,
  booked_at: "2026-10-08T12:00:00.000Z",
};

let server: Server | null = null;

// A local stand-in TMS that records what it receives.
async function fakeTms(status: number, response: unknown) {
  const received: { headers: IncomingHttpHeaders; body: string }[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(response));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/bookings`, received };
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

describe("TMS write-back: GenericTmsAdapter", () => {
  it("posts the booking signed with HMAC-SHA256 and returns the TMS reference", async () => {
    const tms = await fakeTms(200, { reference: "TMS-42" });
    const result = await new GenericTmsAdapter(tms.url, "shared-secret").writeBooking(booking);

    expect(result).toEqual({ synced: true, externalRef: "TMS-42" });
    const [request] = tms.received;
    expect(JSON.parse(request.body)).toEqual({ event: "booking.created", booking });
    const expected = createHmac("sha256", "shared-secret").update(request.body).digest("hex");
    expect(request.headers["x-shipit-signature"]).toBe(`sha256=${expected}`);
    expect(request.headers["idempotency-key"]).toBe("booking-1");
  });

  it("reports a TMS error status as not synced", async () => {
    const tms = await fakeTms(503, { error: "down" });
    expect(await new GenericTmsAdapter(tms.url, "s").writeBooking(booking)).toEqual({ synced: false, error: "TMS answered 503" });
  });

  it("says plainly when no TMS is connected or the secret is missing", async () => {
    expect(await new GenericTmsAdapter(undefined, "s").writeBooking(booking)).toEqual({
      synced: false,
      error: "No TMS is connected yet (TMS_BOOKING_WEBHOOK_URL is not set).",
    });
    expect(await new GenericTmsAdapter("http://127.0.0.1:1/x", undefined).writeBooking(booking)).toEqual({
      synced: false,
      error: "TMS_WEBHOOK_SECRET is not set.",
    });
  });

  it("turns a connection failure into a recorded error, never a throw", async () => {
    const result = await new GenericTmsAdapter("http://127.0.0.1:1/unreachable", "s").writeBooking(booking);
    expect(result.synced).toBe(false);
  });
});
