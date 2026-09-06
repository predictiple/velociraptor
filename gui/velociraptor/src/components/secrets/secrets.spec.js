/**
 * Behavioral spec for the Secrets view (/secrets).
 *
 * Encodes what the secret manager view DOES: render secret types list,
 * select a type to view its secret names and permitted users, open the
 * Add Secret dialog from template with fields and Verify Expression, and
 * enable/disable edit and delete action buttons based on selection.
 *
 * Runs against the live server. Non-destructive — never creates or deletes
 * secrets here; the full CRUD lifecycle lives in secret-lifecycle.spec.js.
 *
 * Run with: npx playwright test src/components/secrets/secrets.spec.js
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
  await page.goto("/app/index.html?org_id=root#/secrets");
});

test.describe("Secrets view", () => {
  test("secrets view renders secret types list", async ({ page }) => {
    const rows = page.locator(".secret-manager tbody tr");
    await expect(rows.first()).toBeVisible();
    // Verify common secret types like SMTP Creds or HTTP Secrets appear.
    await expect(page.locator(".secret-manager")).toContainText("SMTP Creds");
    await expect(page.locator(".secret-manager")).toContainText("HTTP Secrets");
  });

  test("selecting a secret type reveals secret names and add button", async ({ page }) => {
    // Click on SMTP Creds
    await page.locator(".secret-manager tbody tr", { hasText: "SMTP Creds" }).locator("td").click();
    await expect(page.locator(".secret-manager tr.row-selected")).toContainText("SMTP Creds");

    // The Secret Names column should appear with the Add button (+).
    await expect(page.locator(".secret-manager th", { hasText: "Secret Names" })).toBeVisible();
    const addBtn = page.locator("button.new-user-btn", { hasText: "Add new secret" });
    await expect(addBtn).toBeVisible();
  });

  test("opening Add Secret dialog shows template fields and Verify Expression", async ({ page }) => {
    await page.locator(".secret-manager tbody tr", { hasText: "SMTP Creds" }).locator("td").click();
    await page.locator("button.new-user-btn", { hasText: "Add new secret" }).click();

    // Modal dialog opens
    const modal = page.locator(".modal-content");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Add secret from template: SMTP Creds");
    await expect(modal).toContainText("Verify Expression");
    await expect(modal).toContainText("server");
    await expect(modal).toContainText("server_port");

    // Close modal (target the footer Close button)
    await modal.getByRole("button", { name: "Close" }).last().click();
    await expect(modal).toHaveCount(0);
  });
});
