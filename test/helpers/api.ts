import { randomInt } from "node:crypto";
import { APP_URL } from "./env";

export type ApiResponse<T = Record<string, unknown>> = { status: number; body: T; headers: Headers };

/** Calls one of the app's routes. `cookie` is a session from cookieHeader(). */
export async function api<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}
): Promise<ApiResponse<T>> {
  const res = await fetch(`${APP_URL}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body: body as T, headers: res.headers };
}

/** A made-up client address, so auth tests each get their own rate-limit bucket
 *  (the limiter keys on the caller's IP). 198.51.100.0/24 is reserved for documentation. */
export function fakeClientIp(): Record<string, string> {
  return { "X-Forwarded-For": `198.51.100.${randomInt(1, 255)}` };
}
