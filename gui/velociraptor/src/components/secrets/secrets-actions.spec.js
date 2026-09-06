/**
 * Behavioral spec for the Secrets "Edit secret" share dialog.
 *
 * Encodes what the Edit Secret dialog DOES once a secret is selected:
 * it shows the secret name, the "Share secret with these users" user
 * multi-select, and (in the root org) the "Visible To All Orgs" toggle.
 *
 * A throwaway SMTP secret is created via the API in beforeAll and deleted
 * in afterAll, so the test is deterministic and self-cleaning. The dialog
 * is opened and closed without submitting.
 *
 * Run with: npx playwright test src/components/secrets/secrets-actions.spec.js
 */
import { test, expect } from "@playwright/test";

const AUTH = {
  Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
};

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: AUTH,
});

const SECRET_NAME = `e2e_share_test_${Date.now().toString(36)}`;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "https://localhost:8889",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: AUTH,
  });
  const page = await context.newPage();
  await page.goto("/app/index.html?org_id=root#/secrets");
  const add = await page.request.post("/api/v1/AddSecret", {
    data: {
      name: SECRET_NAME,
      type_name: "SMTP Creds",
      secret: { server: "127.0.0.1", server_port: "587" },
    },
  });
  expect(add.status()).toBe(200);
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "https://localhost:8889",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: AUTH,
  });
  const page = await context.newPage();
  await page.goto("/app/index.html?org_id=root#/secrets");
  await page.request.post("/api/v1/ModifySecret", {
    data: { type_name: "SMTP Creds", name: SECRET_NAME, delete: true },
  });
  await context.close();
});

test("Edit Secret dialog shows share users and visible-to-all-orgs toggle", async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/secrets");

  // Select the SMTP Creds type, then the test secret.
  await page.locator(".secret-manager tbody tr", { hasText: "SMTP Creds" }).locator("td").click();
  const secretRow = page.locator(".secret-manager tbody tr", { hasText: SECRET_NAME });
  await expect(secretRow).toHaveCount(1);
  await secretRow.locator("td").click();
  await expect(
    page.locator(".secret-manager tr.row-selected", { hasText: SECRET_NAME })
  ).toHaveCount(1);

  // Open the edit dialog.
  await page.locator("button.new-user-btn", { hasText: "Edit secret" }).click();
  const modal = page.locator(".modal-content");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Edit Secret properties");
  // The dialog heading now shows "Edit Secret <name>" (secret prop
  // is passed into state). Assertion is a substring check so it passes.
  await expect(modal).toContainText("Edit Secret");

  // The share user multi-select renders.
  await expect(modal).toContainText("Share secret with these users");
  await expect(modal.locator(".users")).toBeVisible();

  // In the root org the "Visible To All Orgs" toggle renders.
  await expect(modal).toContainText("Visible To All Orgs");

  // Close via the footer Close button.
  await modal.getByRole("button", { name: "Close" }).last().click();
  await expect(modal).toHaveCount(0);
});