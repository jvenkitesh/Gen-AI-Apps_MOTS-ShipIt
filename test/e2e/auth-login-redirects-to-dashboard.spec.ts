import { expect, test } from "@playwright/test";
import { roleUser } from "../helpers/testUser";

// Priority: P0 -- the real login form: fill, submit, land on the dashboard.
test("auth-login-redirects-to-dashboard: the login form signs in and opens the dashboard", async ({ page }) => {
  const user = await roleUser("supply_chain_operations_manager");

  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  // A signed-in user who opens /login is sent back to the dashboard.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("auth-login-redirects-to-dashboard: a wrong password shows a plain error and stays on login", async ({ page }) => {
  const user = await roleUser("viewer");
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("Wrong-password-1");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
