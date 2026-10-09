import { defineConfig, devices } from "@playwright/test";
import { APP_URL } from "./helpers/env";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000, // the estimate test makes a live OpenAI + ShipStation sandbox call
  expect: { timeout: 20_000 },
  fullyParallel: false, // one shared dev Supabase project
  workers: 1,
  reporter: "list",
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
