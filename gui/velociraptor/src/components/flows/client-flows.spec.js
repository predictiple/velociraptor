/**
 * Behavioral spec for the Client Artifacts view (/collected/:client_id).
 *
 * Encodes what the client flows view DOES differently from the server view:
 * the "Add to hunt" action exists and the "Build offline collector" action
 * does not. Non-destructive — never creates, deletes, cancels, or hunts.
 *
 * Uses the live client C.9e12b994f5c41ab6 (1oca1host).
 *
 * Run with: npx playwright test src/components/flows/client-flows.spec.js
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

test.beforeEach(async ({ page }) => {
  await page.goto(`/app/index.html?org_id=root#/collected/${CLIENT_ID}`);
  await expect(page.locator("nav.flow-toolbar")).toBeVisible();
});

test.describe("Client Artifacts view", () => {
  test("toolbar: Add to hunt present, Build offline collector absent", async ({ page }) => {
    await expect(page.getByRole("button", { name: "New Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Add to hunt" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Delete Artifact Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Cancel Artifact Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Copy Collection" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save Collection" })).toBeEnabled();
    // Server-only action must NOT be present on a client.
    await expect(page.getByRole("button", { name: "Build offline collector" })).toHaveCount(0);
  });

  test("row click shows the flow overview in the inspector", async ({ page }) => {
    const rows = page.locator("table.paged-table tbody tr");
    await expect(rows.first()).toBeVisible();
    await rows.first().locator("td").first().click();

    await expect(page.locator("dt", { hasText: "Artifact Names" })).toBeVisible();
    await expect(page.locator("dt", { hasText: "Flow ID" })).toBeVisible();
    await expect(page.locator("dt", { hasText: "Creator" })).toBeVisible();
    await expect(page.locator("dt", { hasText: "State" })).toBeVisible();
  });
});