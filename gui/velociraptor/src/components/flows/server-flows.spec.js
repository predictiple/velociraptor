/**
 * Behavioral spec for the Server Artifacts view (/collected/server).
 *
 * Encodes what the server flows view DOES: show the collected-flow table,
 * expose the toolbar (New Collection / Delete / Cancel / Copy / Save /
 * offline collector), and drive the New Collection wizard (step gating,
 * artifact selection, review).
 *
 * Runs against the live server. These tests are NON-destructive: they never
 * create, delete, cancel, copy, or save collections. The full
 * create/inspect/delete journey lives in collection-lifecycle.spec.js.
 *
 * Run with: npx playwright test src/components/flows/server-flows.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

// The New Collection wizard is the same react-step-wizard machinery as the
// hunt wizard: every step's paginator is in the DOM, inactive step wrappers
// are position:absolute behind the active step's position:relative wrapper,
// so we click the target link in the CURRENTLY ACTIVE footer and wait for the
// target step to become active. See hunts.spec.js for the full rationale.
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

// The first pagination item for a step name (belongs to step 1's paginator,
// which is first in the DOM). Disabled steps render as spans inside an li
// with the "disabled" class.
const stepItem = (page, name) =>
  page.locator(".pagination li", { hasText: name }).first();

test.beforeEach(async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/collected/server");
  await expect(page.locator("nav.flow-toolbar")).toBeVisible();
});

test.describe("Server Artifacts view", () => {
  test("empty inspector prompts to select a collection", async ({ page }) => {
    await expect(page.getByText("Please click a collection in the above table")).toBeVisible();
  });

  test("toolbar: New Collection enabled; server-only offline collector present, no Add to hunt", async ({ page }) => {
    await expect(page.getByRole("button", { name: "New Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Delete Artifact Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Cancel Artifact Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Copy Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save Collection" })).toBeEnabled();
    // Server-only action.
    await expect(page.getByRole("button", { name: "Build offline collector" })).toBeEnabled();
    // Client-only action must NOT be present on the server.
    await expect(page.getByRole("button", { name: "Add to hunt" })).toHaveCount(0);
  });

  test("table renders the flow columns", async ({ page }) => {
    const headers = page.locator("table.paged-table th");
    await expect(headers).toHaveCount(8);
    for (const name of ["State", "FlowId", "Artifacts", "Created", "Last Active", "Creator", "Mb", "Rows"]) {
      await expect(page.locator("table.paged-table th", { hasText: name })).toHaveCount(1);
    }
  });

  test("New Collection wizard opens on the Select Artifacts step", async ({ page }) => {
    await page.getByRole("button", { name: "New Collection" }).click();
    await expect(page.getByText("New Collection: Select Artifacts to collect")).toBeVisible();
    await expect(page.getByPlaceholder("Search for artifacts...")).toBeVisible();
  });

  test("wizard step gating: only Select Artifacts is enabled before an artifact is chosen", async ({ page }) => {
    await page.getByRole("button", { name: "New Collection" }).click();
    await expect(page.getByText("New Collection: Select Artifacts to collect")).toBeVisible();

    await expect(stepItem(page, "Select Artifacts")).not.toHaveClass(/disabled/);
    for (const name of ["Configure Parameters", "Specify Resources", "Review", "Launch"]) {
      await expect(stepItem(page, name)).toHaveClass(/disabled/);
    }
  });

  test("wizard: selecting an artifact unlocks steps and Review shows the request", async ({ page }) => {
    await page.getByRole("button", { name: "New Collection" }).click();
    await expect(page.getByText("New Collection: Select Artifacts to collect")).toBeVisible();

    // The wizard opens on the Select Artifacts step already.
    await page.getByPlaceholder("Search for artifacts...").fill("Server.Information.Users");
    // The artifact search is debounced (~400ms).
    await expect(
      page.locator(".new-artifact-search-table tbody tr", { hasText: "Server.Information.Users" })
    ).toHaveCount(1);
    await page
      .locator(".new-artifact-search-table tbody tr", { hasText: "Server.Information.Users" })
      .first()
      .locator("button")
      .click();

    // All later steps are now unlocked.
    for (const name of ["Configure Parameters", "Specify Resources", "Review", "Launch"]) {
      await expect(stepItem(page, name)).not.toHaveClass(/disabled/);
    }

    // Review renders the serialized request containing the artifact.
    await gotoWizardStep(page, "Review");
    await expect(page.locator(".modal-body").nth(3).locator(".ace_editor")).toContainText("Server.Information.Users");
  });

  test("row click shows the flow overview in the inspector", async ({ page }) => {
    const rows = page.locator("table.paged-table tbody tr");
    await expect(rows.first()).toBeVisible();
    await rows.first().locator("td").first().click();

    // The inspector loads the flow overview (dt labels, not the table headers).
    await expect(page.locator("dt", { hasText: "Artifact Names" })).toBeVisible();
    await expect(page.locator("dt", { hasText: "Flow ID" })).toBeVisible();
    await expect(page.locator("dt", { hasText: "Creator" })).toBeVisible();
    await expect(page.locator("dt", { hasText: "State" })).toBeVisible();
  });
});