/**
 * Behavioral spec for the Notebooks action toolbar (with a notebook selected).
 *
 * Encodes what the action buttons DO once a notebook row is selected:
 * Full Screen navigates to the fullscreen view, Copy opens the New Notebook
 * wizard prefilled, Edit opens the Edit notebook dialog, Uploads opens the
 * uploads dialog, and Export opens the export dialog.
 *
 * Non-destructive: it only opens dialogs and closes them; nothing is
 * created, edited, copied, uploaded, or exported. Uses the first notebook
 * already present on the server.
 *
 * Run with: npx playwright test src/components/notebooks/notebooks-actions.spec.js
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
  await page.goto("/app/index.html?org_id=root#/notebooks");
  await expect(page.locator("table.paged-table tbody tr").first()).toBeVisible();
  // Select the first notebook so the toolbar actions enable.
  await page.locator("table.paged-table tbody tr").first().locator("td").first().click();
  await expect(page.locator("nav.toolbar button", { hasText: "Full Screen" })).toBeEnabled();
});

test.describe.serial("Notebook action toolbar", () => {
  test("Full Screen navigates to the fullscreen notebook view", async ({ page }) => {
    const notebookId = (await page
      .locator("table.paged-table tbody tr.row-selected")
      .innerText())
      .trim()
      .split("\t")[0]
      .trim();

    await page.locator("nav.toolbar button", { hasText: "Full Screen" }).click();
    await expect(page).toHaveURL(new RegExp(`#/fullscreen/notebooks/${notebookId}`));
  });

  test("Copy Notebook opens the New Notebook wizard prefilled with the notebook name", async ({ page }) => {
    // The Copy button's sr-only text is also "New Notebook" (copy-paste bug
    // in notebooks-list.jsx) — the toolbar has two buttons with that name.
    const copyButton = page.locator("nav.toolbar button", { hasText: "New Notebook" }).nth(1);
    await copyButton.click();

    await expect(page.getByText("New Notebook: Configure Parameters").first()).toBeVisible();
    // The name field is prefilled with the source notebook's name.
    const nameInput = page.locator(".new-collection-parameter-page textarea").first();
    await expect(nameInput).not.toHaveValue("");

    // Close the wizard without creating anything (header X).
    await page.locator(".modal-header button[aria-label='Close']").first().click();
    await expect(page.getByText("New Notebook: Configure Parameters").first()).toHaveCount(0);
  });

  test("Edit Notebook opens the edit dialog with the notebook id in the title", async ({ page }) => {
    const notebookId = (await page
      .locator("table.paged-table tbody tr.row-selected")
      .innerText())
      .trim()
      .split("\t")[0]
      .trim();

    await page.locator("nav.toolbar button", { hasText: "Edit Notebook" }).click();
    await expect(page.locator(".modal-title", { hasText: `Edit notebook ${notebookId}` })).toBeVisible();
    // The Name field is prefilled.
    await expect(page.locator(".modal-body textarea").first()).not.toHaveValue("");

    await page.locator(".modal-header button[aria-label='Close']").click();
    await expect(page.locator(".modal-title", { hasText: "Edit notebook" })).toHaveCount(0);
  });

  test("Notebook Uploads opens the uploads dialog", async ({ page }) => {
    const notebookName = (await page
      .locator("table.paged-table tbody tr.row-selected")
      .innerText())
      .trim()
      .split("\t")[1]
      .trim();

    await page.locator("nav.toolbar button", { hasText: "Notebook Uploads" }).click();
    await expect(page.locator(".modal-title", { hasText: `Notebook uploads: ${notebookName}` })).toBeVisible();

    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.locator(".modal-title", { hasText: "Notebook uploads:" })).toHaveCount(0);
  });

  test("Export Notebook opens the export dialog", async ({ page }) => {
    await page.locator("nav.toolbar button", { hasText: "Export Notebook" }).click();
    await expect(page.getByText("Export notebooks")).toBeVisible();
    // The dialog offers HTML and Zip export for the selected notebook.
    await expect(page.getByRole("button", { name: "Export to HTML" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export to Zip" })).toBeVisible();
    await expect(page.getByText("Available Downloads")).toBeVisible();

    await page.locator(".modal-footer button", { hasText: "Cancel" }).click();
    await expect(page.getByText("Export notebooks")).toHaveCount(0);
  });
});