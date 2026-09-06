/**
 * Behavioral spec for the Notebooks view (/notebooks).
 *
 * Encodes what the notebooks list view DOES: show the notebook table,
 * expose the toolbar (Full Screen / New / Copy / Delete / Edit / Uploads /
 * Export), drive the New Notebook wizard (step gating, template selection,
 * review), and select a notebook to load its cells.
 *
 * Runs against the live server. Non-destructive — never creates, deletes,
 * copies, edits, uploads, or exports notebooks here; the full
 * create/inspect/delete journey lives in notebook-lifecycle.spec.js.
 *
 * Run with: npx playwright test src/components/notebooks/notebooks.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

// The New Notebook wizard uses react-step-wizard with these steps.
const STEP_INDEX = {
  "Configure Notebook": 0,
  "Select Template": 1,
  "Configure Parameters": 2,
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

// The first pagination item for a step name (belongs to step 1's paginator).
const stepItem = (page, name) =>
  page.locator(".pagination li", { hasText: name }).first();

test.beforeEach(async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/notebooks");
});

test.describe("Notebooks view", () => {
  test("empty state prompts to select a notebook", async ({ page }) => {
    await expect(page.getByText("Select a notebook from the list above.")).toBeVisible();
    await expect(page.locator("table.paged-table tbody tr").first()).toBeVisible();
    await expect(page.locator("table.paged-table th", { hasText: "NotebookId" })).toHaveCount(1);
    await expect(page.locator("table.paged-table th", { hasText: "Name" })).toHaveCount(1);
    await expect(page.locator("table.paged-table th", { hasText: "Creator" })).toHaveCount(1);
  });

  test("toolbar states without a selection", async ({ page }) => {
    await expect(page.locator("nav.toolbar button", { hasText: "New Notebook" }).first()).toBeEnabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Full Screen" })).toBeDisabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Delete Notebook" })).toBeDisabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Edit Notebook" })).toBeDisabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Notebook Uploads" })).toBeDisabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Export Notebook" })).toBeDisabled();
  });

  test("row click loads the notebook and navigates to its URL", async ({ page }) => {
    const rows = page.locator("table.paged-table tbody tr");
    const firstRow = rows.first();
    const notebookId = (await firstRow.innerText()).trim().split("\t")[0].trim();
    await firstRow.locator("td").first().click();

    await expect(page).toHaveURL(new RegExp(`#/notebooks/${notebookId}`));
    // The selected notebook row is highlighted.
    await expect(page.locator("table.paged-table tbody tr.row-selected").first()).toContainText(notebookId);
    // Toolbar actions become enabled once a notebook is selected.
    await expect(page.locator("nav.toolbar button", { hasText: "Full Screen" })).toBeEnabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Delete Notebook" })).toBeEnabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Edit Notebook" })).toBeEnabled();
    await expect(page.locator("nav.toolbar button", { hasText: "Export Notebook" })).toBeEnabled();
  });

  test("New Notebook wizard opens on Configure Parameters with defaults", async ({ page }) => {
    await page.locator("nav.toolbar button", { hasText: "New Notebook" }).first().click();
    await expect(page.getByText("New Notebook: Configure Parameters").first()).toBeVisible();
    const nameInput = page.locator(".new-collection-parameter-page textarea").first();
    await expect(nameInput).toHaveValue(/New Notebook/);
  });

  test("wizard step gating before a template is selected", async ({ page }) => {
    await page.locator("nav.toolbar button", { hasText: "New Notebook" }).first().click();
    await expect(page.getByText("New Notebook: Configure Parameters").first()).toBeVisible();

    // Step 1 (Configure Notebook) footer enables all steps.
    for (const name of ["Select Template", "Configure Parameters", "Review", "Launch"]) {
      await expect(stepItem(page, name)).not.toHaveClass(/disabled/);
    }

    // Move to Select Template; later steps are gated until a template
    // artifact is chosen. In the Select Template footer, Configure
    // Parameters / Review / Launch are disabled.
    await gotoWizardStep(page, "Select Template");
    for (const name of ["Configure Parameters", "Review", "Launch"]) {
      await expect(
        page.locator(".modal-footer").nth(1).locator(".pagination li.disabled", { hasText: name })
      ).toHaveCount(1);
    }
  });

  test("wizard template selection unlocks steps and Review shows request", async ({ page }) => {
    await page.locator("nav.toolbar button", { hasText: "New Notebook" }).first().click();
    await expect(page.getByText("New Notebook: Configure Parameters").first()).toBeVisible();

    // Go to Select Template and pick a notebook template artifact.
    await gotoWizardStep(page, "Select Template");
    await page.getByPlaceholder("Search for artifacts...").fill("Notebooks.Default");
    await expect(
      page.locator(".new-artifact-search-table tbody tr", { hasText: "Notebooks.Default" })
    ).toHaveCount(1);
    await page
      .locator(".new-artifact-search-table tbody tr", { hasText: "Notebooks.Default" })
      .first()
      .locator("button")
      .click();

    // Later steps become unlocked in the Select Template footer.
    for (const name of ["Configure Parameters", "Review", "Launch"]) {
      await expect(
        page.locator(".modal-footer").nth(1).locator(".pagination li.disabled", { hasText: name })
      ).toHaveCount(0);
    }

    // Review renders the serialized request containing the artifact.
    await gotoWizardStep(page, "Review");
    await expect(page.locator(".modal-body").nth(3).locator(".ace_editor")).toContainText("Notebooks.Default");
  });
});
