import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Unit tests import the app's own modules through its "@/..." path alias.
const alias = { "@": path.resolve(__dirname, "../mots-shipit-ai") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["unit/**/*.test.ts"],
          setupFiles: ["./unit/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["unit/**", "e2e/**", "node_modules/**"],
          setupFiles: ["./vitest.setup.ts"],
          // Live tests against the running app, the dev Supabase project and (in a few
          // tests) OpenAI and the ShipStation sandbox. A first request also compiles the route.
          testTimeout: 90_000,
          hookTimeout: 90_000,
          // One shared dev project: run files one at a time so test data never races.
          fileParallelism: false,
        },
      },
    ],
  },
});
