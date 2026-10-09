import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../mots-shipit-ai");
// Read-only endpoints: a rate estimate and the list of connected carriers.
const ALLOWED = new Set(["https://api.shipstation.com/v2/rates/estimate", "https://api.shipstation.com/v2/carriers"]);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return ["node_modules", ".next"].includes(e.name) ? [] : sourceFiles(full);
      return /\.(ts|tsx|js|mjs)$/.test(e.name) ? [full] : [];
    })
  );
  return files.flat();
}

// Product rule: ShipIt only ESTIMATES with ShipStation. It never books, confirms, buys a
// label or creates a shipment there; the cheapest estimate is only reported to the user.
describe("ShipStation is estimate-only", () => {
  it("uses no ShipStation endpoint except the rate estimate and carrier list", async () => {
    const found: string[] = [];
    for (const file of await sourceFiles(APP)) {
      const text = await readFile(file, "utf8");
      for (const url of text.match(/https?:\/\/[a-z0-9.-]*shipstation\.com[^\s"'`)]*/gi) ?? []) {
        if (!ALLOWED.has(url)) found.push(`${path.relative(APP, file)}: ${url}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("never mentions ShipStation's booking endpoints (labels, shipments, purchase)", async () => {
    const found: string[] = [];
    for (const file of await sourceFiles(APP)) {
      const text = await readFile(file, "utf8");
      if (/\/v[12]\/(labels|shipments|manifests|pickups)\b|purchase_label|create_label/i.test(text)) found.push(path.relative(APP, file));
    }
    expect(found).toEqual([]);
  });
});
