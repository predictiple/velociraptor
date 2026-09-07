/**
 * Behavioral spec for running invalid VQL in a notebook cell.
 *
 * Encodes what happens when a VQL cell fails to execute: the cell output
 * renders an ERROR message (the server prefixes failures with "ERROR:").
 *
 * Creates a notebook via the New Notebook wizard (Notebooks.Default
 * template), adds a VQL cell with invalid VQL, runs it, asserts the error
 * message renders, then deletes the notebook.
 *
 * Run with: npx playwright test src/components/notebooks/notebooks-error.spec.js
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

test("invalid VQL in a notebook cell renders an error message", async ({ page }) => {
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

  await gotoWizardStep(page, "Review");
  await expect(page.locator(".modal-body").nth(3).locator(".ace_editor")).toContainText("Notebooks.Default");

  await gotoWizardStep(page, "Launch", { wait: false });
  await expect(page.locator(".modal")).toHaveCount(0);

  // --- Open the new notebook (first row, newest first) ---
  const rows = page.locator("table.paged-table tbody tr");
  await expect(rows.first()).toContainText("New Notebook");
  const notebookId = (await rows.first().locator("td").first().innerText()).trim();
  expect(notebookId).toMatch(/^N\./);
  await rows.first().locator("td").first().click();
  await expect(page).toHaveURL(new RegExp(`#/notebooks/${notebookId}`));
  await expect(page.getByRole("heading", { name: "Welcome to Velociraptor notebooks!" })).toBeVisible();

  // --- Add a VQL cell above the selected markdown cell ---
  await page.locator(".notebook-output").first().click();
  await page.locator(".notebook-cell .toolbar .dropdown-toggle").first().click();
  await page.locator(".dropdown-menu .dropdown-item", { hasText: "VQL" }).first().click();

  await page.locator(".notebook-output").first().click();
  const selectedCell = page.locator(".notebook-cell.selected");
  await expect(selectedCell).toHaveCount(1);

  // --- Edit the VQL cell with invalid VQL and run it ---
  await selectedCell.locator("button svg.fa-pencil").first().locator("xpath=..").click();
  const ace = page.locator(".ace_editor").last();
  await expect(ace).toBeVisible();
  await ace.click();
  await page.evaluate(() => {
    const editors = document.querySelectorAll(".ace_editor");
    const editor = window.ace.edit(editors[editors.length - 1]);
    editor.setValue("SELECT * FROM DefinitelyNotARealPlugin()");
    editor.clearSelection();
  });
  await page.locator("button svg.fa-floppy-disk").first().locator("xpath=..").click();

  // The cell messages (including the ERROR line) only render while the cell
  // is selected, so click the output to select it before asserting.
  await page.locator(".notebook-output").first().click();

  // The run is async; the cell messages eventually include an ERROR line.
  await expect(page.locator(".notebook-cell .error-message").first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".notebook-cell .error-message").first()).toContainText(
    /DefinitelyNotARealPlugin|Unknown|not found|Error/i
  );

  // --- Delete the notebook ---
  await page.locator("nav.toolbar button", { hasText: "Delete Notebook" }).click();
  await expect(page.getByText("You are about to delete this notebook permanently!")).toBeVisible();
  await page.getByRole("button", { name: "Do It!!!" }).click();
  await expect(page.getByText("You are about to delete this notebook permanently!")).toHaveCount(0);
});