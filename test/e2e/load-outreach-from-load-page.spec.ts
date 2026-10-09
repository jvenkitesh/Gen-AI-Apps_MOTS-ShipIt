import { expect, test } from "@playwright/test";
import { createE2ELoad, deleteE2ELoads } from "../helpers/fixtures";
import { roleUser } from "../helpers/testUser";
import { signIn } from "./signIn";

// Priority: P0 -- a planner opens a new TMS load, contacts carriers in test mode from the
// load page, and sees the outreach results and the audit trail.
test("load-outreach-from-load-page: contact carriers from the load page in test mode", async ({ page, context }) => {
  const load = await createE2ELoad({ destination_zipcode: "90012" });
  try {
    await signIn(context, await roleUser("transportation_planner"));
    await page.goto(`/loads/${load.id}`);

    await expect(page.getByRole("heading", { name: load.payload.external_id })).toBeVisible();
    await expect(page.getByText("Test mode: no real carriers contacted")).toBeVisible();
    await expect(page.getByText("No carriers contacted for this load version yet.")).toBeVisible();

    await page.locator("#batch-size").selectOption("1");
    await page.getByRole("button", { name: "Contact next carriers" }).click();

    await expect(page.getByText("simulated", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("No carriers contacted for this load version yet.")).toHaveCount(0);

    // The new load's audit trail is at the bottom of the page.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Audit trail" })).toBeVisible();
    await expect(page.getByText("Load received from the TMS (version 1).")).toBeVisible();
  } finally {
    await deleteE2ELoads([load.id]);
  }
});
