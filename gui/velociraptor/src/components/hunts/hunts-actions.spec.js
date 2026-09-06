/**
 * Behavioral spec for the Hunt Manager action toolbar.
 *
 * Encodes what the hunt action buttons DO once a hunt is selected:
 * Modify opens the Modify Hunt dialog (tags/description/expiry), Run opens
 * the confirmation dialog, Stop is only enabled for RUNNING hunts, Copy
 * opens the New Hunt wizard prefilled with the hunt's request, tag buttons
 * filter the list, and "Show only my hunts" filters by creator.
 *
 * A single PAUSED hunt with a tag is created via the API in beforeAll and
 * deleted in afterAll, so the tests are deterministic and self-cleaning.
 * Nothing here actually runs, stops, or deletes the hunt.
 *
 * Run with: npx playwright test src/components/hunts/hunts-actions.spec.js
 */
import { test, expect } from "@playwright/test";

const AUTH = {
  Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
};
const DESCRIPTION = `Hunt Actions Test ${Date.now().toString(36)}`;
const TAG = "actions-test-tag";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: AUTH,
});

let huntId;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "https://localhost:8889",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: AUTH,
  });
  const page = await context.newPage();
  await page.goto("/app/index.html?org_id=root#/hunts");

  // Create a PAUSED hunt (no start flag) so it never runs on a client.
  const create = await page.request.post("/api/v1/CreateHunt", {
    data: {
      start_request: {
        artifacts: ["Generic.Client.Info"],
        specs: [{ artifact: "Generic.Client.Info", parameters: { env: [] } }],
      },
      hunt_description: DESCRIPTION,
      condition: {},
    },
  });
  expect(create.status()).toBe(200);
  huntId = (await create.json()).flow_id;
  expect(huntId).toMatch(/^H\./);

  // Tag it so the tag-filter test has something to click.
  const tag = await page.request.post("/api/v1/ModifyHunt", {
    data: { hunt_id: huntId, tags: [TAG] },
  });
  expect(tag.status()).toBe(200);

  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "https://localhost:8889",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: AUTH,
  });
  const page = await context.newPage();
  await page.goto("/app/index.html?org_id=root#/hunts");
  await page.request.post("/api/v1/CollectArtifact", {
    data: {
      client_id: "server",
      artifacts: ["Server.Hunts.CancelAndDelete"],
      specs: [{
        artifact: "Server.Hunts.CancelAndDelete",
        parameters: {
          env: [
            { key: "Hunts", value: JSON.stringify([huntId]) },
            { key: "DeleteAllFiles", value: "Y" },
          ],
        },
      }],
    },
  });
  await context.close();
});

// Select the test hunt in the list and wait for the inspector to load it.
async function selectHunt(page) {
  await page.goto("/app/index.html?org_id=root#/hunts");
  await expect(page.locator("nav.hunt-toolbar")).toBeVisible();
  const row = page.locator("table.paged-table tbody tr", { hasText: DESCRIPTION });
  await expect(row).toHaveCount(1);
  await row.locator("td", { hasText: DESCRIPTION }).click();
  // The inspector loads the hunt overview.
  await expect(page.getByText("Hunt ID")).toBeVisible();
}

test.describe.serial("Hunt action toolbar", () => {
  test("Modify Hunt opens the dialog with tags, description and expiry", async ({ page }) => {
    await selectHunt(page);
    await page.getByRole("button", { name: "Modify Hunt" }).click();

    await expect(page.locator(".modal-title", { hasText: "Modify Hunt" })).toBeVisible();
    // The tags multi-select renders (react-select).
    await expect(page.locator(".modal-body .labels")).toBeVisible();
    // The description field is prefilled with the hunt's description.
    await expect(page.locator(".modal-body textarea").first()).toHaveValue(DESCRIPTION);
    // Expiry renders as a timestamp editor.
    await expect(page.locator(".modal-body .datetime-selector")).toBeVisible();

    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.locator(".modal-title", { hasText: "Modify Hunt" })).toHaveCount(0);
  });

  test("Run Hunt opens the confirmation dialog for a paused hunt", async ({ page }) => {
    await selectHunt(page);
    // The hunt is PAUSED, so Run is enabled.
    await expect(page.getByRole("button", { name: "Run Hunt" })).toBeEnabled();
    await page.getByRole("button", { name: "Run Hunt" }).click();

    await expect(page.getByText("Run this hunt?")).toBeVisible();
    await expect(page.getByText("Are you sure you want to run these hunts?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run them all!" })).toBeVisible();

    // Close without running.
    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.getByText("Run this hunt?")).toHaveCount(0);
  });

  test("Stop Hunt is disabled for a paused hunt", async ({ page }) => {
    await selectHunt(page);
    // Stop only applies to RUNNING hunts.
    await expect(page.getByRole("button", { name: "Stop Hunt" })).toBeDisabled();
  });

  test("Copy Hunt opens the wizard prefilled with the hunt request", async ({ page }) => {
    await selectHunt(page);
    await page.getByRole("button", { name: "Copy Hunt" }).click();

    // The New Hunt wizard opens on the Configure Hunt step.
    await expect(page.getByText("New Hunt - Configure Hunt")).toBeVisible();
    // The description is carried over from the copied hunt.
    await expect(page.locator("#hunt-description-text")).toHaveValue(DESCRIPTION);

    // Close the wizard without creating anything (header X).
    await page.locator(".modal-header button[aria-label='Close']").first().click();
    await expect(page.getByText("New Hunt - Configure Hunt")).toHaveCount(0);
  });

  test("clicking a hunt tag filters the list by that tag", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/hunts");
    await expect(page.locator("nav.hunt-toolbar")).toBeVisible();

    const tagBtn = page.locator("table.paged-table tbody tr button", { hasText: TAG });
    await expect(tagBtn).toHaveCount(1);
    await tagBtn.click();

    // The TransformViewer shows the active filter.
    await expect(page.locator(".transform-viewer")).toContainText(/Tags\s*\(\s*actions-test-tag\s*\)/);
    // The filtered list still shows our tagged hunt.
    await expect(page.locator("table.paged-table tbody tr", { hasText: DESCRIPTION })).toHaveCount(1);

    // Clicking the filter chip clears it.
    await page.locator(".transform-viewer button").click();
    await expect(page.locator(".transform-viewer")).toHaveCount(0);
  });

  test("Show only my hunts filters by creator", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/hunts");
    await expect(page.locator("nav.hunt-toolbar")).toBeVisible();

    await page.getByRole("button", { name: "Show only my hunts" }).click();
    // The filter chip shows Creator (admin).
    await expect(page.locator(".transform-viewer")).toContainText(/Creator\s*\(\s*admin\s*\)/);

    // The toggle flips to "Show all hunts" — click it to clear the filter.
    await page.getByRole("button", { name: "Show all hunts" }).click();
    await expect(page.locator(".transform-viewer")).toHaveCount(0);
  });

  test("deep link to a non-existent hunt redirects back to the list", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/hunts/H.NONEXISTENT");
    // The 404 is handled by navigating back to the plain hunt list.
    await expect(page).toHaveURL(/#\/hunts$/);
    await expect(page.getByText("Please select a hunt above")).toBeVisible();
  });
});