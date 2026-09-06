/**
 * End-to-end lifecycle spec for Notebooks.
 *
 * Creates a real notebook on the live server from the Notebooks.Default
 * template (a read-only template producing a markdown welcome cell), verifies
 * it appears in the notebook list, opens it, adds a VQL cell, runs it, and
 * verifies the table output renders. Finally deletes the notebook and
 * verifies it is gone.
 *
 * This is the only notebooks spec that mutates server state; it always
 * cleans up after itself (the notebook is deleted at the end).
 *
 * Run with: npx playwright test src/components/notebooks/notebook-lifecycle.spec.js
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

test("notebook lifecycle: create, add VQL cell, run, delete", async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/notebooks");

  // --- Create via the New Notebook wizard with the Default template ---
  await page.locator("nav.toolbar button", { hasText: "New Notebook" }).first().click();
  await expect(page.getByText("New Notebook: Configure Parameters").first()).toBeVisible();

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

  // Review shows the request.
  await gotoWizardStep(page, "Review");
  await expect(page.locator(".modal-body").nth(3).locator(".ace_editor")).toContainText("Notebooks.Default");

  // Launch auto-submits (no tools) and closes the wizard.
  await gotoWizardStep(page, "Launch", { wait: false });
  await expect(page.locator(".modal")).toHaveCount(0);

  // --- The new notebook appears as the first row (newest first) ---
  const rows = page.locator("table.paged-table tbody tr");
  await expect(rows.first()).toContainText("New Notebook");
  const notebookId = (await rows.first().innerText()).trim().split("\t")[0].trim();
  expect(notebookId).toMatch(/^N\./);

  // --- Open it: the template's markdown welcome cell renders ---
  await rows.first().locator("td").first().click();
  await expect(page).toHaveURL(new RegExp(`#/notebooks/${notebookId}`));
  await expect(page.getByRole("heading", { name: "Welcome to Velociraptor notebooks!" })).toBeVisible();

  // --- Add a VQL cell above the selected markdown cell ---
  await page.locator(".notebook-output").first().click();
  await page.locator(".notebook-cell .toolbar .dropdown-toggle").first().click();
  await page.locator(".dropdown-menu .dropdown-item", { hasText: "VQL" }).first().click();

  // The new cell is inserted above the markdown cell (first in the DOM).
  // Select it explicitly, then edit.
  await page.locator(".notebook-output").first().click();
  const selectedCell = page.locator(".notebook-cell.selected");
  await expect(selectedCell).toHaveCount(1);

  // --- Edit the VQL cell and run it ---
  await selectedCell.locator("button svg.fa-pencil").first().locator("xpath=..").click();
  const ace = page.locator(".ace_editor").last();
  await expect(ace).toBeVisible();
  await ace.click();
  // Set the editor value via the ace API directly — keyboard typing (type()
  // or insertText()) can drop/truncate characters in the ace editor under
  // load (the server log showed truncated VQL like ", 2 AS Tw").
  await page.evaluate(() => {
    const editors = document.querySelectorAll(".ace_editor");
    const editor = window.ace.edit(editors[editors.length - 1]);
    editor.setValue("SELECT 1 AS One, 2 AS Two FROM scope()");
    editor.clearSelection();
  });
  await page.locator("button svg.fa-floppy-disk").first().locator("xpath=..").click();

  // The cell output renders the query result table. The run is async — the
  // output placeholder shows "Loading" while the VQL executes, so wait for it
  // to clear first (longer timeout: under full-suite load the run can be slow).
  await expect(page.locator(".notebook-contents")).not.toContainText("Loading", {
    timeout: 30000,
  });
  await expect(page.locator(".notebook-contents")).toContainText("One");
  await expect(page.locator(".notebook-contents")).toContainText("Two");

  // --- Delete the notebook ---
  await page.locator("nav.toolbar button", { hasText: "Delete Notebook" }).click();
  await expect(page.getByText("You are about to delete this notebook permanently!")).toBeVisible();
  await page.getByRole("button", { name: "Do It!!!" }).click();

  // The dialog closes.
  await expect(page.getByText("You are about to delete this notebook permanently!")).toHaveCount(0);

  // The notebook is deleted on the server. NOTE: we deliberately do NOT
  // assert the row disappears from the list. The server's notebook index
  // rebuild is gated on `index_mtime >= store_version` with second-granularity
  // timestamps (services/notebook/shared.go GetSharedNotebooks). When the
  // delete lands in the same second as the last index write, the stale index
  // (still containing the deleted notebook) is served until any other
  // notebook event bumps the version. This is a known server race, so we
  // verify the delete deterministically via the API instead.
  const resp = await page.request.get(`/api/v1/GetNotebooks?notebook_id=${notebookId}`);
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.items || []).toHaveLength(0);
});