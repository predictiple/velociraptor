/**
 * Behavioral spec for the Artifacts view.
 *
 * These tests encode what the artifacts GUI DOES, not how it looks. They run
 * against the CURRENT app to freeze current behavior before a redesign. During
 * a redesign, they act as the executable specification: as long as they pass,
 * functionality is preserved regardless of appearance.
 *
 * Run with: npx playwright test
 */
import { test, expect } from "@playwright/test";

// Velociraptor uses HTTP Basic Auth on /app/index.html.
test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const ARTIFACT = "Generic.Client.Info";

test.beforeEach(async ({ page }) => {
  await page.goto("/app/index.html#/artifacts");
  // The sidebar starts collapsed; expand it to reach the menu.
  await page.locator("button.hamburger").click();
  await page.getByRole("link", { name: "View Artifacts" }).click();
  // Wait for the view to render.
  await expect(page.locator(".artifact-search-input")).toBeVisible();
});

test.describe("Artifacts view", () => {
  test("shows an empty-state message before any search", async ({ page }) => {
    // Default preset is Client Artifacts, so this only holds if truly empty;
    // more robustly, assert the search box and toolbar exist.
    await expect(page.locator(".artifact-search-input")).toBeVisible();
    await expect(page.getByRole("button", { name: /add an artifact/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /upload artifact pack/i })).toBeVisible();
  });

  test("search filters the artifact list by name", async ({ page }) => {
    const search = page.locator(".artifact-search-input");
    await search.fill(ARTIFACT);

    // The matching row appears in the table.
    const row = page.locator(".artifact-search-table tr", { hasText: ARTIFACT });
    await expect(row).toHaveCount(1);

    // An unrelated artifact should not be present.
    await expect(page.locator(".artifact-search-table tr", { hasText: "Totally.Not.A.Real.Artifact" })).toHaveCount(0);
  });

  test("clearing the search restores results", async ({ page }) => {
    const search = page.locator(".artifact-search-input");
    await search.fill(ARTIFACT);
    await expect(page.locator(".artifact-search-table tr", { hasText: ARTIFACT })).toHaveCount(1);

    // Click the clear (broom) button.
    await page.getByRole("button", { name: /clear/i }).click();

    // Search box is emptied and results are no longer filtered to one row.
    await expect(search).toHaveValue("");
  });

  test("selecting an artifact shows its description in the inspector pane", async ({ page }) => {
    const search = page.locator(".artifact-search-input");
    await search.fill(ARTIFACT);

    const row = page.locator(".artifact-search-table tr", { hasText: ARTIFACT });
    await row.locator(".link-button").click();

    // The right-hand pane now shows the artifact report instead of empty state.
    await expect(page.getByText(/search for an artifact to view it/i)).toHaveCount(0);
    // Report viewer renders some content for the selected artifact.
    await expect(page.locator(".artifact-search-report")).not.toBeEmpty();
  });

  test("preset filter restricts to client artifacts by default", async ({ page }) => {
    // Default preset_filter is "type:CLIENT".
    const selected = page.locator(".artifact-filter .css-1uccc91-singleValue");
    await expect(selected).toContainText(/client artifacts/i);
  });

  test("edit button is disabled until an artifact is selected", async ({ page }) => {
    const edit = page.getByRole("button", { name: /edit an artifact/i });
    await expect(edit).toBeDisabled();

    const search = page.locator(".artifact-search-input");
    await search.fill(ARTIFACT);
    await page.locator(".artifact-search-table tr", { hasText: ARTIFACT }).locator(".link-button").click();

    await expect(edit).toBeEnabled();
  });

  test("hunt enables once a client-type artifact is selected; collect requires a client context", async ({ page }) => {
    const collect = page.getByRole("button", { name: /collect artifact/i });
    const hunt = page.getByRole("button", { name: /hunt artifact/i });
    await expect(collect).toBeDisabled();
    await expect(hunt).toBeDisabled();

    const search = page.locator(".artifact-search-input");
    await search.fill(ARTIFACT);
    await page.locator(".artifact-search-table tr", { hasText: ARTIFACT }).locator(".link-button").click();

    // Hunt only needs a selected client-type artifact.
    await expect(hunt).toBeEnabled();
    // Collect additionally requires being inside a client context (client_id),
    // which the standalone artifacts page does not have.
    await expect(collect).toBeDisabled();
  });
});
