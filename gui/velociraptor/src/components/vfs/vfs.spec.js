/**
 * Behavioral spec for the VFS view (/vfs/:client_id).
 *
 * Encodes what the VFS browser DOES: render the accessor tree, navigate
 * into directories (the URL reflects the path), refresh a directory
 * listing from the client, and show file stats for a selected row.
 *
 * Uses the live client C.9e12b994f5c41ab6 (1oca1host). The refresh step
 * launches a read-only System.VFS.ListDirectory collection on the client
 * (lists files, mutates nothing on the client). All other steps are
 * read-only.
 *
 * Run with: npx playwright test src/components/vfs/vfs.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const CLIENT_ID = "C.9e12b994f5c41ab6";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto(`/app/index.html?org_id=root#/vfs/${CLIENT_ID}/`);
  // The accessor tree loads asynchronously from the server.
  await expect(page.locator(".file-tree")).toContainText("auto");
  await expect(page.locator(".file-tree")).toContainText("ntfs");
  await expect(page.locator(".file-tree")).toContainText("registry");
});

test.describe("VFS view", () => {
  test("renders the accessor tree and an empty-state message", async ({ page }) => {
    // The tree lists the available accessors for this client.
    await expect(page.locator(".file-tree")).toContainText("auto");
    await expect(page.locator(".file-tree")).toContainText("ntfs");
    await expect(page.locator(".file-tree")).toContainText("registry");

    // The file pane has no rows: either the directory was never
    // collected or it is empty.
    await expect(
      page.getByText(/No data available|Directory is empty\./),
    ).toBeVisible();

    // The stats pane prompts for a selection.
    await expect(
      page.getByText("Click on a file in the table above."),
    ).toBeVisible();
  });

  test("clicking a tree node navigates into the folder and updates the URL", async ({ page }) => {
    await page.locator(".file-tree li", { hasText: "auto" }).click();
    await expect(page).toHaveURL(new RegExp(`#/vfs/${CLIENT_ID}/auto/$`));
  });

  test("refresh directory populates the file list", async ({ page }) => {
    // Navigate into the auto accessor.
    await page.locator(".file-tree li", { hasText: "auto" }).click();
    await page.waitForTimeout(1000);

    // If the directory was never collected, refresh it from the client.
    if (await page.getByText(
      "No data available. Refresh directory from client by clicking above.",
    ).count() > 0) {
      await page.locator(".vfs-toolbar button").first().click();
    }

    // The file list table appears with the standard columns.
    const table = page.locator("table.paged-table");
    await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 60000 });
    await expect(table.locator("thead")).toContainText("Name");
    await expect(table.locator("thead")).toContainText("Size");
    await expect(table.locator("thead")).toContainText("Mode");
  });

  test("selecting a file shows its stats", async ({ page }) => {
    // Navigate into auto and wait for the listing (refresh if needed).
    await page.locator(".file-tree li", { hasText: "auto" }).click();
    await page.waitForTimeout(1000);
    if (await page.getByText(
      "No data available. Refresh directory from client by clicking above.",
    ).count() > 0) {
      await page.locator(".vfs-toolbar button").first().click();
    }
    const table = page.locator("table.paged-table");
    await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 60000 });

    // Click the first row and check the stats pane.
    await table.locator("tbody tr").first().click();
    await expect(page.locator(".file-stats")).toBeVisible();
    await expect(page.locator(".file-stats dt", { hasText: "Size" })).toBeVisible();
    await expect(page.locator(".file-stats dt", { hasText: "Mode" })).toBeVisible();
    await expect(page.locator(".file-stats dt", { hasText: "Mtime" })).toBeVisible();

    // Selecting a file also reflects the file path in the URL.
    await expect(page).toHaveURL(new RegExp(`#/vfs/${CLIENT_ID}/auto/[^/]+$`));
  });
});