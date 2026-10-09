import { APP_URL, requireEnv } from "./helpers/env";

// Integration tests call the running app over HTTP. Fail fast with a clear message
// instead of every test timing out one by one.
try {
  await fetch(`${APP_URL}/login`, { signal: AbortSignal.timeout(30_000) });
} catch {
  throw new Error(
    `\n\nCannot reach ${APP_URL} -- is the MOTS ShipIt dev server running?\n` +
      `Start it with: cd mots-shipit-ai && npm run dev\n`
  );
}

requireEnv("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TMS_WEBHOOK_SECRET");
