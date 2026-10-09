import { afterEach, beforeEach, vi } from "vitest";

// Unit tests never touch the network: no Supabase, OpenAI or ShipStation. Only a local
// server a test starts itself (127.0.0.1 / localhost) is reachable.
const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return realFetch(input, init);
    throw new Error(`Unit tests must not call the network (tried ${url.origin}). Stub fetch in the test.`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
