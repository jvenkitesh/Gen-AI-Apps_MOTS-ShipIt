import { expect, test } from "@playwright/test";
import { roleUser } from "../helpers/testUser";
import { signIn } from "./signIn";

// Priority: P0 -- the load-estimate chatbot in a real browser (live OpenAI + ShipStation
// sandbox estimate; nothing is ever booked or confirmed with ShipStation).
test("estimate-chat-answers: a question gets an answer card with ⓘ definitions", async ({ page, context }) => {
  await signIn(context, await roleUser("viewer"));
  await page.goto("/estimate");

  await page.getByLabel("Ask for a load estimate").fill("What does it cost to ship 40 lbs to 30303?");
  await page.getByRole("button", { name: "Get estimate" }).click();

  // Every label carries an ⓘ that explains it; its accessible name is "What is <label>?".
  const info = page.getByRole("button", { name: "What is Best choice?" });
  await expect(info).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "What is Estimated cost?" })).toBeVisible();
  await expect(page.getByText("Freshly calculated")).toBeVisible();
  await expect(page.getByText("40 lb", { exact: true })).toBeVisible();
  await info.hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "The cheapest option found" })).toBeVisible();
});
