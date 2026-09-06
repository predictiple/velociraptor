/**
 * E2E: full hunt lifecycle.
 *
 * A real user journey against the live server:
 *   create a hunt via the wizard -> it appears in the list -> select it ->
 *   the inspector shows its overview -> delete it -> it disappears.
 *
 * The hunt is created in the default PAUSED state (we do NOT check "Start
 * Hunt Immediately"), so it never runs on any client. The description is
 * unique per run so the test is idempotent and cleans up after itself.
 *
 * Run with: npx playwright test src/components/hunts/hunt-lifecycle.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const DESCRIPTION = `E2E Hunt Test ${Date.now().toString(36)}`;

// Click a wizard step and wait for it to become active. See hunts.spec.js for
// the full rationale: links in inactive step footers are covered by the active
// step's position:relative wrapper, so we click the target link in the
// CURRENTLY ACTIVE footer and then wait for the target step to become active
// (position:relative) so a click never races the previous step's transition.
// The Launch step auto-submits and closes the wizard, so it is clicked with
// { wait: false } and the caller asserts the modal closes.
const STEP_INDEX = {
  "Configure Hunt": 0,
  "Select Artifacts": 1,
  "Configure Parameters": 2,
  "Specify Resources": 3,
  "Review": 4,
  "Launch": 5,
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

test("hunt lifecycle: create, find, inspect, delete", async ({ page }) => {
  // --- Navigate to the hunt manager ---
  await page.goto("/app/index.html?org_id=root#/hunts");
  await expect(page.locator("nav.hunt-toolbar")).toBeVisible();

  // --- Create a hunt via the wizard ---
  await page.getByRole("button", { name: "New Hunt" }).click();
  await expect(page.getByText("New Hunt - Configure Hunt")).toBeVisible();
  await page.locator("#hunt-description-text").fill(DESCRIPTION);

  await gotoWizardStep(page, "Select Artifacts");
  await page.getByPlaceholder("Search for artifacts...").fill("Generic.Client.Info");
  await expect(
    page.locator(".new-artifact-search-table tbody tr", { hasText: "Generic.Client.Info" })
  ).toHaveCount(1);
  await page
    .locator(".new-artifact-search-table tbody tr", { hasText: "Generic.Client.Info" })
    .first()
    .locator("button")
    .click();

  await gotoWizardStep(page, "Review");
  await expect(page.locator(".ace_editor")).toContainText("Generic.Client.Info");

  // Launch auto-submits (Generic.Client.Info has no tool dependencies).
  await gotoWizardStep(page, "Launch", { wait: false });
  // The wizard closes once the server confirms creation.
  await expect(page.locator(".modal")).toHaveCount(0);

  // --- Find it in the list ---
  const row = page.locator("table.paged-table tbody tr", { hasText: DESCRIPTION });
  await expect(row).toHaveCount(1);

  // --- Inspect it ---
  await row.locator("td", { hasText: DESCRIPTION }).click();
  // The inspector loads the hunt overview.
  await expect(page.getByText("Hunt ID")).toBeVisible();
  await expect(page.getByText("Artifact Names")).toBeVisible();
  await expect(page.getByText("Generic.Client.Info").first()).toBeVisible();

  // --- Delete it ---
  await page.getByRole("button", { name: "Delete Hunt" }).click();
  await expect(page.getByText("Delete these hunts?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete them all!" }).click();

  // The delete dialog closes and the hunt disappears from the list.
  await expect(page.getByText("Delete these hunts?", { exact: true })).toHaveCount(0);
  await expect(row).toHaveCount(0);
});