/**
 * End-to-end lifecycle spec for Secrets.
 *
 * Creates a real secret on the live server via the Add Secret dialog, verifies
 * it appears in the secret list, opens edit properties, deletes the secret,
 * and verifies it is removed.
 *
 * Run with: npx playwright test src/components/secrets/secret-lifecycle.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const TEST_SECRET = "e2e_test_smtp_secret";

test("secret lifecycle: add, inspect, delete", async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/secrets");

  // Select SMTP Creds type
  await page.locator(".secret-manager tbody tr", { hasText: "SMTP Creds" }).locator("td").click();
  await expect(page.locator(".secret-manager tr.row-selected")).toContainText("SMTP Creds");

  // Open Add Secret dialog
  await page.locator("button.new-user-btn", { hasText: "Add new secret" }).click();
  const modal = page.locator(".modal-content");
  await expect(modal).toBeVisible();

  // Fill secret name
  await modal.getByPlaceholder("The name of the secret to add").fill(TEST_SECRET);

  // Fill required SMTP fields in the DictEditor table or form inputs
  // DictEditor renders key/value rows. Let's fill server and server_port if present.
  // Actually, SMTP Creds template has server: 127.0.0.1 and server_port: 587 by default.
  // Let's click "Do it!" to add.
  await modal.getByRole("button", { name: "Do it!" }).click();
  await expect(modal).toHaveCount(0);

  // Verify secret appears in the secret names table
  const secretRow = page.locator(".secret-manager tbody tr", { hasText: TEST_SECRET });
  await expect(secretRow).toHaveCount(1);

  // Select the secret to enable edit/delete buttons
  await secretRow.locator("td").click();
  await expect(page.locator(".secret-manager tr.row-selected", { hasText: TEST_SECRET })).toHaveCount(1);

  // Edit secret properties
  await page.locator("button.new-user-btn", { hasText: "Edit secret" }).click();
  const editModal = page.locator(".modal-content");
  await expect(editModal).toBeVisible();
  await expect(editModal).toContainText("Edit Secret");
  await editModal.getByRole("button", { name: "Close" }).last().click();
  await expect(editModal).toHaveCount(0);

  // Delete secret
  await page.locator("button.new-user-btn", { hasText: "Delete secret" }).click();
  const deleteModal = page.locator(".modal-content");
  await expect(deleteModal).toBeVisible();
  await expect(deleteModal).toContainText(TEST_SECRET);
  await deleteModal.getByRole("button", { name: "Do it!" }).click();
  await expect(deleteModal).toHaveCount(0);

  // Verify secret is deleted via API
  const csrf = await page.evaluate(() => window.CsrfToken);
  const resp = await page.request.get("/api/v1/GetSecretDefinitions", {
    headers: { "X-CSRF-Token": csrf, Referer: "https://localhost:8889/app/index.html" },
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  const smtpDef = (body.items || []).find((i) => i.type_name === "SMTP Creds");
  const names = smtpDef ? smtpDef.secret_names || [] : [];
  expect(names).not.toContain(TEST_SECRET);
});
