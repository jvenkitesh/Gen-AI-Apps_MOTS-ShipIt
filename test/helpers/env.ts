import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Single source of truth for secrets: the app's own .env.local, never a copy.
dotenv.config({ path: path.resolve(__dirname, "../../mots-shipit-ai/.env.local"), quiet: true });

export const APP_URL = process.env.TEST_APP_URL ?? "http://localhost:3000";

export function requireEnv(...keys: string[]): void {
  for (const key of keys) {
    if (!process.env[key]) throw new Error(`\n\nMissing ${key} -- expected in mots-shipit-ai/.env.local\n`);
  }
}
