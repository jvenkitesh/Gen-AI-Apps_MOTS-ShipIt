import { expect, test } from "@playwright/test";

// Priority: P0 -- middleware sends signed-out visitors to the login page, in a real browser.
for (const page of ["/dashboard", "/loads", "/exceptions", "/estimate", "/reports"]) {
  test(`unauthenticated-redirect: ${page} redirects to /login`, async ({ page: browser }) => {
    await browser.goto(page);
    await expect(browser).toHaveURL(/\/login$/);
  });
}
