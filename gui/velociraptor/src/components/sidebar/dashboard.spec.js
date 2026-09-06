/**
 * Behavioral spec for the Dashboard view (/dashboard).
 *
 * Encodes what the dashboard view DOES: render report viewer, toolbar with
 * time-range dropdown (Last Hour to Last Week), Redraw (refresh) button,
 * and Edit dashboard button.
 *
 * Runs against the live server. Non-destructive.
 *
 * Run with: npx playwright test src/components/sidebar/dashboard.spec.js
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
  await page.goto("/app/index.html?org_id=root#/dashboard");
});

test.describe("Dashboard view", () => {
  test("dashboard renders with toolbar and report viewer", async ({ page }) => {
    // Toolbar buttons are present on the top-level dashboard toolbar (.first())
    const toolbar = page.locator("nav.toolbar").first();
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator("button").first()).toBeVisible();
    await expect(toolbar.locator("button.dropdown-toggle")).toBeVisible();

    // Report viewer container is present
    await expect(page.locator(".dashboard")).toBeVisible();
  });

  test("time-range selector allows switching range", async ({ page }) => {
    const toolbar = page.locator("nav.toolbar").first();
    const rangeToggle = toolbar.locator("button.dropdown-toggle");
    await rangeToggle.click();

    // Select "Last Week" from dropdown items
    await page.locator(".dropdown-menu .dropdown-item", { hasText: "Last Week" }).click();
    await expect(toolbar).toContainText("Last Week");
  });

  test("edit dashboard button navigates to artifact editor", async ({ page }) => {
    const toolbar = page.locator("nav.toolbar").first();
    // The second button in the left button group is Edit the dashboard (pencil)
    await toolbar.locator("button").nth(1).click();
    await expect(page).toHaveURL(/#\/artifacts\/Server\.Monitor\.Health\/edit/);
  });
});
