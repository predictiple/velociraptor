/**
 * Behavioral spec for the Artifacts view — extended coverage.
 *
 * Covers the states the main spec doesn't: loading, API errors, preset
 * filter switching, special-character search, and the upload dialog.
 *
 * These tests use Playwright's route interception to simulate slow/failing
 * API responses, so they're deterministic regardless of server speed.
 *
 * Run with: npx playwright test src/components/artifacts/artifacts-states.spec.js
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const ARTIFACT = "Generic.Client.Info";

// Path to a zip containing malformed YAML (built with Python's zipfile so
// the server's Go zip reader accepts the container and rejects the YAML).
const BAD_ARTIFACT_ZIP = path.join(__dirname, "fixtures", "bad-artifact.zip");

test.beforeEach(async ({ page }) => {
  await page.goto("/app/index.html#/artifacts");
  await page.locator("button.hamburger").click();
  await page.getByRole("link", { name: "View Artifacts" }).click();
  await expect(page.locator(".artifact-search-input")).toBeVisible();
});

test.describe("Artifacts view — states", () => {
  test("shows a loading spinner while the artifact list is being fetched", async ({ page }) => {
    // Delay the GetArtifacts response so the spinner is visible.
    await page.route("**/api/v1/GetArtifacts", async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.continue();
    });

    // Reload the view so the fetch happens under our delayed route.
    await page.goto("/app/index.html#/artifacts");
    await page.locator("button.hamburger").click();
    await page.getByRole("link", { name: "View Artifacts" }).click();

    // The spinner should be visible while the request is in flight.
    // (Spinner renders as a FontAwesome spin icon inside an .overlay div.)
    await expect(page.locator(".overlay .fa-spinner")).toBeVisible();
    // ...and disappear once the data arrives.
    await expect(page.locator(".overlay .fa-spinner")).toHaveCount(0);
    await expect(page.locator(".artifact-search-table tr").first()).toBeVisible();
  });

  test("recovers gracefully when the artifact list API fails", async ({ page }) => {
    // Simulate a server error on the list fetch.
    await page.route("**/api/v1/GetArtifacts", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
    );

    await page.goto("/app/index.html#/artifacts");
    await page.locator("button.hamburger").click();
    await page.getByRole("link", { name: "View Artifacts" }).click();

    // The view must not crash: search box and toolbar still render.
    await expect(page.locator(".artifact-search-input")).toBeVisible();
    await expect(page.getByRole("button", { name: /add an artifact/i })).toBeVisible();
    // No rows render (empty table) but no fatal error screen either.
    await expect(page.locator(".artifact-search-table tr")).toHaveCount(0);
  });

  test("preset filter can be switched to Server Artifacts", async ({ page }) => {
    // Open the react-select dropdown.
    await page.locator(".artifact-filter").click();
    // Choose "Server Artifacts" — scope to the dropdown options so the
    // sidebar link of the same name doesn't cause a strict-mode violation.
    await page.locator(".artifact-filter .velo__option", { hasText: "Server Artifacts" }).click();

    // The selected value updates.
    const selected = page.locator(".artifact-filter .css-1uccc91-singleValue");
    await expect(selected).toContainText(/server artifacts/i);

    // A known server artifact should now be searchable.
    const search = page.locator(".artifact-search-input");
    await search.fill("Server.Internal");
    await expect(page.locator(".artifact-search-table tr").first()).toBeVisible();
  });

  test("preset filter can be switched to All Artifacts", async ({ page }) => {
    await page.locator(".artifact-filter").click();
    await page.locator(".artifact-filter .velo__option", { hasText: "All Artifacts" }).click();

    const selected = page.locator(".artifact-filter .css-1uccc91-singleValue");
    await expect(selected).toContainText(/all artifacts/i);
  });

  test("search handles special characters without breaking", async ({ page }) => {
    const search = page.locator(".artifact-search-input");
    // A regex-special string that matches nothing should not crash the view.
    await search.fill(".*+[]{}()^$");
    // The view stays usable.
    await expect(page.locator(".artifact-search-input")).toBeVisible();
    await expect(page.getByRole("button", { name: /add an artifact/i })).toBeVisible();

    // Clearing restores normal behavior. Use exact match — the artifact
    // "Windows.EventLogs.Cleared" also matches /clear/i.
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(search).toHaveValue("");
    await search.fill(ARTIFACT);
    await expect(page.locator(".artifact-search-table tr", { hasText: ARTIFACT })).toHaveCount(1);
  });

  test("upload artifact pack opens the upload dialog", async ({ page }) => {
    await page.getByRole("button", { name: /upload artifact pack/i }).click();
    // The dialog opens with its title (the file input itself is hidden).
    await expect(page.getByText("Upload artifacts from a Zip pack")).toBeVisible();
    // And can be closed again.
    await page.getByRole("button", { name: /close/i }).click();
    await expect(page.getByText("Upload artifacts from a Zip pack")).toHaveCount(0);
  });

  test("uploading a zip with malformed YAML surfaces import errors", async ({ page }) => {
    await page.getByRole("button", { name: /upload artifact pack/i }).click();
    await expect(page.getByText("Upload artifacts from a Zip pack")).toBeVisible();

    // Select a zip whose YAML cannot be parsed.
    await page.locator("input[type=file].hidden-file-upload").setInputFiles(BAD_ARTIFACT_ZIP);

    // The upload button appears once a file is chosen.
    await page.getByRole("button", { name: "Click to Upload" }).click();

    // The server rejects the pack and the dialog surfaces the errors.
    await expect(page.locator(".artifact-import-errors")).toBeVisible();
    await expect(page.locator(".artifact-import-errors .error-message").first()).toBeVisible();
  });
});