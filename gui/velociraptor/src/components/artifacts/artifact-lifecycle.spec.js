/**
 * E2E: full artifact lifecycle.
 *
 * This test crosses multiple views and dialogs — a real user journey:
 *   create a custom artifact -> search for it -> inspect it -> delete it.
 *
 * It's a true end-to-end test because it exercises the whole loop against a
 * live server: the artifact is written via the API, appears in search, and is
 * removed again. During a GUI redesign this guards the complete workflow, not
 * just one view's rendering.
 *
 * The artifact name is unique per run so the test is idempotent and cleans up
 * after itself (the final delete removes what the test created).
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

// Unique artifact name so parallel/repeat runs don't collide.
// NOTE: Velociraptor rejects name parts that START WITH A DIGIT, so a raw
// Date.now() suffix is invalid. base36 keeps it unique AND starts with a
// letter (e.g. "n3f8..."), satisfying the validator.
const NAME = `Custom.E2E.Test.${Date.now().toString(36)}`;

// Minimal valid Velociraptor artifact YAML.
const YAML = `name: ${NAME}
description: |
  Created by an end-to-end Playwright test. Safe to delete.
type: CLIENT
sources:
  - query: |
      SELECT * FROM info()
`;

test("artifact lifecycle: create, find, inspect, delete", async ({ page }) => {
  // --- Navigate to the artifacts view ---
  await page.goto("/app/index.html#/artifacts");
  await page.locator("button.hamburger").click();
  await page.getByRole("link", { name: "View Artifacts" }).click();
  await expect(page.locator(".artifact-search-input")).toBeVisible();

  // --- Create a new artifact ---
  await page.getByRole("button", { name: /add an artifact/i }).click();
  await expect(page.getByText("Create a new artifact")).toBeVisible();

  // The editor starts with a template; replace it with our YAML.
  // ACE uses its own text model, so keyboard simulation is unreliable.
  // Set the value via ACE's API (this is the standard approach for ACE).
  await page.evaluate((yaml) => {
    const el = document.querySelector(".ace_editor");
    const ace = window.ace && window.ace.edit(el);
    ace.setValue(yaml);
    ace.clearSelection();
    ace.gotoLine(0, 0, true);
  }, YAML);
  // Give React a moment to register the change (enables the Save button).
  await page.waitForTimeout(500);

  // Save button is disabled until modified; it becomes enabled after typing.
  const saveBtn = page.getByRole("button", { name: /^Save$/ });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  // Dialog closes and the view re-fetches rows.
  await expect(page.getByText("Create a new artifact")).toHaveCount(0);

  // --- Search for the new artifact ---
  const search = page.locator(".artifact-search-input");
  await search.fill(NAME);
  const row = page.locator(".artifact-search-table tr", { hasText: NAME });
  await expect(row).toHaveCount(1);

  // --- Inspect it ---
  await row.locator(".link-button").click();
  // The inspector pane now shows our artifact's description.
  await expect(page.locator(".artifact-search-report")).toContainText(
    "Created by an end-to-end Playwright test"
  );

  // --- Delete it ---
  await page.getByRole("button", { name: /delete artifact/i }).click();
  await expect(page.getByText("Delete artifacts")).toBeVisible();
  await page.getByRole("button", { name: "Yes do it!" }).click();

  // The delete dialog closes and the artifact disappears from search.
  await expect(page.getByText("Delete artifacts")).toHaveCount(0);
  await expect(row).toHaveCount(0);
});