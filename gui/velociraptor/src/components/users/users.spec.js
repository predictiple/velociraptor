/**
 * Behavioral spec for the Users view (/users).
 *
 * Encodes what the users/orgs management view DOES: render the user list,
 * show empty states, select a user to reveal their orgs, select an org to
 * load the ACL viewer (Roles / Effective Permissions cards), enforce the
 * org_admin-only-on-root rule, filter lists, and open the Add User dialog.
 *
 * Runs against the live server. Non-destructive — never creates users,
 * changes roles, or assigns orgs here; the full create/toggle/remove journey
 * lives in user-lifecycle.spec.js.
 *
 * Run with: npx playwright test src/components/users/users.spec.js
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
  await page.goto("/app/index.html?org_id=root#/users");
});

test.describe("Users view", () => {
  test("users tab renders the user list with status column", async ({ page }) => {
    const rows = page.locator(".user-list tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("admin");
    await expect(rows.nth(1)).toContainText("opencode");
    // Each row has a status cell (online/offline indicator) before the name.
    await expect(page.locator(".user-list tbody tr td.user-status")).toHaveCount(2);
  });

  test("empty states before any selection", async ({ page }) => {
    // The org list prompts to select a user first.
    await expect(page.locator(".org-list tbody")).toContainText("Please Select a User");
    // The ACL viewer renders nothing until a user is selected.
    await expect(page.locator(".permission-viewer")).toHaveCount(0);
  });

  test("selecting a user populates their orgs and prompts for an org", async ({ page }) => {
    await page.locator(".user-list tbody tr", { hasText: "admin" }).locator("td").nth(1).click();
    await expect(page.locator(".user-list tr.row-selected")).toHaveCount(1);
    await expect(page.locator(".user-list tr.row-selected")).toContainText("admin");

    // The org list now shows the user's orgs.
    const orgs = page.locator(".org-list tbody tr td");
    await expect(orgs).toHaveCount(2);
    await expect(orgs.nth(0)).toContainText("ACME Inc");
    await expect(orgs.nth(1)).toContainText("<root>");

    // The ACL viewer prompts for an org selection.
    await expect(page.locator(".users-search-panel .row > .col-sm-4").nth(2)).toContainText(
      "Please Select an Org"
    );
  });

  test("selecting an org loads the ACL viewer with roles and effective permissions", async ({
    page,
  }) => {
    await page.locator(".user-list tbody tr", { hasText: "admin" }).locator("td").nth(1).click();
    await page.locator(".org-list tbody tr", { hasText: "<root>" }).locator("td").click();

    await expect(page.locator(".org-list tr.row-selected")).toContainText("<root>");
    await expect(page.locator(".permission-viewer .card-header").first()).toContainText(
      "Roles - admin @ <root>"
    );

    // All 7 roles render as toggles; administrator is checked for admin.
    const roleSwitches = page.locator(".permission-viewer .card").first().locator(".form-switch input");
    await expect(roleSwitches).toHaveCount(7);
    await expect(page.locator("#Role_administrator")).toBeChecked();
    await expect(page.locator("#Role_reader")).not.toBeChecked();

    // Effective Permissions card: effective perms are checked and disabled.
    await expect(page.locator(".permission-viewer .card-header").nth(1)).toContainText(
      "Effective Permissions"
    );
    await expect(page.locator("#Perm2_ANY_QUERY")).toBeChecked();
    await expect(page.locator("#Perm2_ANY_QUERY")).toBeDisabled();
    // A permission NOT in the effective set stays enabled and unchecked.
    await expect(page.locator("#Perm2_DATASTORE_ACCESS")).not.toBeChecked();
    await expect(page.locator("#Perm2_DATASTORE_ACCESS")).toBeEnabled();
  });

  test("org_admin role and ORG_ADMIN permission are disabled in a non-root org", async ({
    page,
  }) => {
    await page.locator(".user-list tbody tr", { hasText: "admin" }).locator("td").nth(1).click();
    await page.locator(".org-list tbody tr", { hasText: "ACME Inc" }).locator("td").click();

    await expect(page.locator(".permission-viewer .card-header").first()).toContainText(
      "Roles - admin @ ACME Inc"
    );
    // org_admin role toggle is disabled outside the root org.
    await expect(page.locator("#Role_org_admin")).toBeDisabled();
    // ORG_ADMIN permission is disabled outside the root org.
    await expect(page.locator("#Perm2_ORG_ADMIN")).toBeDisabled();
    // Other roles remain usable.
    await expect(page.locator("#Role_administrator")).toBeEnabled();
  });

  test("orgs tab lists orgs and their users", async ({ page }) => {
    await page.locator(".users-search-panel .nav button", { hasText: "Orgs" }).click();
    await expect(page).toHaveURL(/#\/users\/orgs/);

    const orgs = page.locator(".org-list tbody tr td");
    await expect(orgs).toHaveCount(2);
    await expect(orgs.nth(0)).toContainText("<root>");
    await expect(orgs.nth(1)).toContainText("ACME Inc");

    // Selecting an org lists its users.
    await orgs.nth(0).click();
    await expect(page.locator(".org-list tr.row-selected")).toContainText("<root>");
    const users = page.locator(".user-list tbody tr");
    await expect(users).toHaveCount(2);
    await expect(users.nth(0)).toContainText("admin");
    await expect(users.nth(1)).toContainText("opencode");
  });

  test("user filter narrows the user list", async ({ page }) => {
    await page.getByPlaceholder("Users").fill("opencode");
    const rows = page.locator(".user-list tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("opencode");
  });

  test("org filter narrows the org list", async ({ page }) => {
    await page.locator(".user-list tbody tr", { hasText: "admin" }).locator("td").nth(1).click();
    await page.getByPlaceholder("Orgs").fill("ACME");
    const orgs = page.locator(".org-list tbody tr td");
    await expect(orgs).toHaveCount(1);
    await expect(orgs.nth(0)).toContainText("ACME Inc");
  });

  test("toolbar buttons are disabled without a selected user", async ({ page }) => {
    // Update User Password and Assign user to Orgs require a selection.
    await expect(
      page.locator("button.new-user-btn", { hasText: "Update User Password" })
    ).toBeDisabled();
    await expect(
      page.locator("button.new-user-btn", { hasText: "Assign user to Orgs" })
    ).toBeDisabled();
    // Add a new user is always available.
    await expect(page.locator("button.new-user-btn", { hasText: "Add a new user" })).toBeEnabled();
  });

  test("Add User dialog opens with username input", async ({ page }) => {
    await page.locator("button.new-user-btn", { hasText: "Add a new user" }).click();
    // The modal title is "Add a new  User" (double space in the i18n key);
    // getByText normalizes whitespace so scope to the modal title.
    await expect(page.locator(".modal-title", { hasText: "Add a new" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter a username")).toBeVisible();
    await expect(page.getByRole("button", { name: "Do it!" })).toBeVisible();
    // The modal has both a header X (aria-label "Close") and a footer
    // "Close" button — scope to the footer.
    await expect(page.locator(".modal-footer button", { hasText: "Close" })).toBeVisible();
  });
});