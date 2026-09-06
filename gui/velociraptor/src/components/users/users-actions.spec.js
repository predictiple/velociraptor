/**
 * Behavioral spec for the Users action dialogs (with a user selected).
 *
 * Encodes what the two per-user action buttons DO once a user row is
 * selected: "Update User Password" opens the password change dialog, and
 * "Assign user to Orgs" opens the org assignment dialog.
 *
 * Non-destructive: dialogs are opened and closed without submitting.
 * Uses the existing "admin" user on the live server.
 *
 * Run with: npx playwright test src/components/users/users-actions.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

test.beforeEach(async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/users");
  // Select the admin user so the action buttons enable.
  await page.locator(".user-list tbody tr", { hasText: "admin" }).locator("td").nth(1).click();
  await expect(page.locator(".user-list tr.row-selected")).toContainText("admin");
});

test.describe.serial("User action dialogs", () => {
  test("Update User Password opens the password change dialog", async ({ page }) => {
    await page.locator("button.new-user-btn", { hasText: "Update User Password" }).click();

    await expect(page.locator(".modal-title", { hasText: "Update User Password" })).toBeVisible();
    // The dialog shows the target username.
    await expect(page.locator(".modal-body h1")).toContainText("admin");
    // Password fields render.
    await expect(page.getByPlaceholder("Password", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Retype Password")).toBeVisible();

    // Close via the header X (the dialog has no footer).
    await page.locator(".modal-header button[aria-label='Close']").click();
    await expect(page.locator(".modal-title", { hasText: "Update User Password" })).toHaveCount(0);
  });

  test("Assign user to Orgs opens the org assignment dialog", async ({ page }) => {
    await page.locator("button.new-user-btn", { hasText: "Assign user to Orgs" }).click();

    await expect(page.locator(".modal-title", { hasText: "Assign user to Orgs" })).toBeVisible();
    // The org multi-select renders (react-select placeholder).
    await expect(page.locator(".org-selector .velo__placeholder")).toContainText("Select an org");
    // An "All Orgs" shortcut button is available.
    await expect(page.getByRole("button", { name: "All Orgs" })).toBeVisible();
    // Footer has Close and Do it!.
    await expect(page.locator(".modal-footer button", { hasText: "Close" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Do it!" })).toBeVisible();

    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.locator(".modal-title", { hasText: "Assign user to Orgs" })).toHaveCount(0);
  });
});