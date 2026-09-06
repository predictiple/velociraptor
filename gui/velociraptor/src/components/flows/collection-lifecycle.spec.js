/**
 * End-to-end lifecycle spec for Server Artifact collections.
 *
 * Creates a real collection on the live server (Server.Information.Users —
 * a read-only, fast artifact), verifies it appears in the flows table,
 * inspects it in the flow overview, then deletes it via the
 * "Permanently delete collections" dialog and verifies it is gone.
 *
 * This is the only flows spec that mutates server state; it always cleans
 * up after itself (the collection is deleted at the end).
 *
 * Run with: npx playwright test src/components/flows/collection-lifecycle.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const STEP_INDEX = {
  "Select Artifacts": 0,
  "Configure Parameters": 1,
  "Specify Resources": 2,
  "Review": 3,
  "Launch": 4,
};

const stepWrapper = (page, idx) =>
  page.locator(".modal-body").nth(idx).locator("xpath=..");

const activeStepIndex = (page) =>
  page.evaluate(() => {
    const footers = document.querySelectorAll(".modal-footer");
    for (let i = 0; i < footers.length; i++) {
      if (getComputedStyle(footers[i].parentElement).position === "relative") return i;
    }
    return -1;
  });

const gotoWizardStep = async (page, name, { wait = true } = {}) => {
  const currentIdx = await activeStepIndex(page);
  await page
    .locator(".modal-footer")
    .nth(currentIdx)
    .locator("a.page-link", { hasText: name })
    .click();
  if (wait) {
    await expect(stepWrapper(page, STEP_INDEX[name])).toHaveCSS("position", "relative");
  }
};

test("server collection lifecycle: create, inspect, delete", async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/collected/server");
  await expect(page.locator("nav.flow-toolbar")).toBeVisible();

  // --- Create ---
  await page.getByRole("button", { name: "New Collection" }).click();
  await expect(page.getByText("New Collection: Select Artifacts to collect")).toBeVisible();

  await page.getByPlaceholder("Search for artifacts...").fill("Server.Information.Users");
  await expect(
    page.locator(".new-artifact-search-table tbody tr", { hasText: "Server.Information.Users" })
  ).toHaveCount(1);
  await page
    .locator(".new-artifact-search-table tbody tr", { hasText: "Server.Information.Users" })
    .first()
    .locator("button")
    .click();

  // Review shows the request.
  await gotoWizardStep(page, "Review");
  await expect(page.locator(".modal-body").nth(3).locator(".ace_editor")).toContainText("Server.Information.Users");

  // Launch auto-submits (no tools) and closes the wizard.
  await gotoWizardStep(page, "Launch", { wait: false });
  await expect(page.locator(".modal")).toHaveCount(0);

  // --- The new collection appears as the first row (newest first) ---
  const rows = page.locator("table.paged-table tbody tr");
  await expect(rows.first()).toContainText("Server.Information.Users");

  // --- Inspect ---
  await rows.first().locator("td").first().click();
  await expect(page.locator("dt", { hasText: "Artifact Names" })).toBeVisible();
  await expect(page.locator("dt", { hasText: "Flow ID" })).toBeVisible();
  await expect(page.locator("dt", { hasText: "Creator" })).toBeVisible();
  await expect(page.locator("dt", { hasText: "State" })).toBeVisible();

  // --- Delete ---
  await page.getByRole("button", { name: "Delete Artifact Collection" }).click();
  await expect(page.getByText("Permanently delete collections")).toBeVisible();
  await page.getByRole("button", { name: "Yes do it!" }).click();

  // The dialog closes and the row disappears (list refreshes after delete).
  await expect(page.getByText("Permanently delete collections")).toHaveCount(0);
  await expect(page.locator("table.paged-table tbody tr", { hasText: "Server.Information.Users" })).toHaveCount(0);
});