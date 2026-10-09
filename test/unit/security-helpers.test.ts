import { describe, expect, it, vi } from "vitest";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security/rateLimiter";
import { negotiationErrorResponse } from "@/lib/freight/negotiationErrors";
import { NegotiationError } from "@/lib/freight/negotiation";

const request = (headers: Record<string, string>) => new Request("http://localhost/api/auth/login", { headers });

describe("rate limiter", () => {
  it("prefers Netlify's own client-IP header over the spoofable X-Forwarded-For", () => {
    expect(getClientIp(request({ "x-nf-client-connection-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4" }))).toBe("203.0.113.9");
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(getClientIp(request({}))).toBe("unknown");
  });

  it("answers 429 with Retry-After", async () => {
    const res = rateLimitResponse(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(await res.json()).toEqual({ error: "RATE_LIMITED", message: "Too many attempts. Try again in 42 seconds." });
  });

  it("never limits the TMS webhook, and is off (with a warning) without the service key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkRateLimit("ip:1.2.3.4", "webhook")).toEqual({ allowed: true });
    expect(await checkRateLimit("ip:1.2.3.4", "auth")).toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("negotiation error responses", () => {
  it("maps a NegotiationError to its own status and code", async () => {
    const res = negotiationErrorResponse(new NegotiationError("A counter can't go above the load's rate ceiling.", "ABOVE_CEILING", 422), "test");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "ABOVE_CEILING", message: "A counter can't go above the load's rate ceiling." });
  });

  it("never leaks an unexpected error's details to the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = negotiationErrorResponse(new Error("relation carrier_offers does not exist"), "test");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "FAILED", message: "Something went wrong. Please try again." });
  });
});
