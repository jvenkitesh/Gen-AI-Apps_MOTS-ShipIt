import type { BrowserContext } from "@playwright/test";
import { APP_URL } from "../helpers/env";
import { sessionCookies, type TestUser } from "../helpers/testUser";

/** Puts a real Supabase session in the browser without using the login form (the form
 *  itself is covered by auth-login-redirects-to-dashboard.spec.ts). */
export async function signIn(context: BrowserContext, user: TestUser): Promise<void> {
  const cookies = await sessionCookies(user);
  await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, url: APP_URL, httpOnly: false, sameSite: "Lax" as const })));
}
