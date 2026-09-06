/**
 * Behavioral spec for the Hunt Manager view.
 *
 * Encodes what the hunt view DOES: show the hunt list, expose the
 * toolbar (New/Modify/Run/Stop/Delete/Copy/Stats/My-Hunts), and drive the
 * New Hunt wizard (step gating, expiry validation, artifact selection).
 *
 * Runs against the live server. These tests are NON-destructive: they never
 * create, modify, run, stop, or delete hunts. The full create/delete journey
 * lives in hunt-lifecycle.spec.js.
 *
 * Run with: npx playwright test src/components/hunts/hunts.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

// Click a wizard step and wait for it to become active.
//
// StepWizard renders every step's paginator in the DOM (all "visible" to
// Playwright), and every paginator has a working link for each step. But the
// inactive step containers are position:absolute (z-index:0) behind the
// active step's position:relative wrapper, so links in inactive footers are
// covered and a force-click on them is flaky: the browser hit-tests the click
// point and the active wrapper swallows the event.
//
// The reliable way to navigate is to click the target link in the CURRENTLY
// ACTIVE step's footer — that footer is on top and receives events normally.
// We then wait for the target step's wrapper to become position:relative (the
// react-step-wizard "active" marker) so the next click never races the
// transition animation. The Launch step is the exception: it auto-submits and
// closes the wizard, so callers pass { wait: false } and assert the modal
// closes instead.
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

// Index of the currently active step, found by locating the step wrapper
// (a .modal-footer's parent) whose computed position is relative.
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

// The first pagination item for a step name (belongs to step 1's paginator,
// which is first in the DOM). Disabled steps render as spans inside an li
// with the "disabled" class.
const stepItem = (page, name) =>
  page.locator(".pagination li", { hasText: name }).first();

test.beforeEach(async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/hunts");
  await expect(page.locator("nav.hunt-toolbar")).toBeVisible();
});

test.describe("Hunt Manager view", () => {
  test("empty state: inspector prompts to select a hunt", async ({ page }) => {
    await expect(page.getByText("Please select a hunt above")).toBeVisible();
  });

  test("toolbar: New Hunt enabled, Modify/Run/Stop/Delete/Copy disabled without selection", async ({ page }) => {
    await expect(page.getByRole("button", { name: "New Hunt" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Modify Hunt" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Run Hunt" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Stop Hunt" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete Hunt" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Copy Hunt" })).toBeDisabled();
    // Stats toggle and "show only my hunts" are always available.
    await expect(page.getByRole("button", { name: "Show only my hunts" })).toBeEnabled();
  });

  test("New Hunt wizard opens on the Configure Hunt step", async ({ page }) => {
    await page.getByRole("button", { name: "New Hunt" }).click();
    await expect(page.getByText("New Hunt - Configure Hunt")).toBeVisible();
    // Configure step fields: description, expiry, include/exclude conditions.
    await expect(page.locator("#hunt-description-text")).toBeVisible();
    await expect(page.locator(".datetime-selector")).toBeVisible();
    await expect(page.getByText("Include Condition")).toBeVisible();
    await expect(page.getByText("Exclude Condition")).toBeVisible();
  });

  test("wizard step gating: only Select Artifacts is enabled before an artifact is chosen", async ({ page }) => {
    await page.getByRole("button", { name: "New Hunt" }).click();
    await expect(page.getByText("New Hunt - Configure Hunt")).toBeVisible();

    // Select Artifacts is clickable...
    await expect(stepItem(page, "Select Artifacts")).not.toHaveClass(/disabled/);
    // ...everything after it is gated until an artifact is selected.
    for (const name of ["Configure Parameters", "Specify Resources", "Review", "Launch"]) {
      await expect(stepItem(page, name)).toHaveClass(/disabled/);
    }
  });

  test("wizard expiry validation: past expiry shows an error toast", async ({ page }) => {
    await page.getByRole("button", { name: "New Hunt" }).click();
    await expect(page.getByText("New Hunt - Configure Hunt")).toBeVisible();

    // Open the datetime editor.
    await page.locator(".datetime-selector button").first().click();
    const input = page.locator(".datetime-selector input");
    await expect(input).toBeVisible();
    // A valid RFC3339 timestamp in the past.
    await input.fill("2020-01-01T00:00:00Z");
    // Save the edited time (enabled because the value parses).
    await page.locator(".datetime-selector button[type=submit]").click();
    // The wizard rejects it via the snackbar toast.
    await expect(page.getByText("Expiry time is in the past")).toBeVisible();
  });

  test("wizard: selecting an artifact unlocks steps and Review shows the request", async ({ page }) => {
    await page.getByRole("button", { name: "New Hunt" }).click();
    await expect(page.getByText("New Hunt - Configure Hunt")).toBeVisible();

    await gotoWizardStep(page, "Select Artifacts");
    await page.getByPlaceholder("Search for artifacts...").fill("Generic.Client.Info");
    // The artifact search is debounced (~400ms).
    await expect(
      page.locator(".new-artifact-search-table tbody tr", { hasText: "Generic.Client.Info" })
    ).toHaveCount(1);
    await page
      .locator(".new-artifact-search-table tbody tr", { hasText: "Generic.Client.Info" })
      .first()
      .locator("button")
      .click();

    // All later steps are now unlocked.
    for (const name of ["Configure Parameters", "Specify Resources", "Review", "Launch"]) {
      await expect(stepItem(page, name)).not.toHaveClass(/disabled/);
    }

    // Review renders the serialized request containing the artifact.
    await gotoWizardStep(page, "Review");
    await expect(page.locator(".ace_editor")).toContainText("Generic.Client.Info");
  });
});