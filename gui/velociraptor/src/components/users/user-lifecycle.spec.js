/**
 * End-to-end lifecycle spec for Users.
 *
 * Creates a real user on the live server via the Add User dialog, verifies
 * they appear in the user list, opens their ACL viewer, toggles a role on
 * and off, then removes all roles (which deletes the user from the org) and
 * verifies they are gone.
 *
 * This is the only users spec that mutates server state; it always cleans up
 * after itself (the user is removed at the end).
 *
 * Run with: npx playwright test src/components/users/user-lifecycle.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const TEST_USER = "e2e_test_user";

test("user lifecycle: create, toggle roles, remove", async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/users");

  // --- Create the user via the Add User dialog ---
  await page.locator("button.new-user-btn", { hasText: "Add a new user" }).click();
  await page.getByPlaceholder("Enter a username").fill(TEST_USER);
  await page.getByRole("button", { name: "Do it!" }).click();

  // The dialog closes and the user appears in the list (poll refreshes).
  await expect(page.locator(".modal-title", { hasText: "Add a new" })).toHaveCount(0);
  const userRow = page.locator(".user-list tbody tr", { hasText: TEST_USER });
  await expect(userRow).toHaveCount(1);

  // --- Open the user's ACL viewer ---
  await userRow.locator("td").nth(1).click();
  await expect(page.locator(".user-list tr.row-selected")).toContainText(TEST_USER);
  await expect(page.locator(".org-list tbody tr td", { hasText: "<root>" })).toHaveCount(1);
  await page.locator(".org-list tbody tr", { hasText: "<root>" }).locator("td").click();

  // New users get the reader role by default.
  await expect(page.locator(".permission-viewer .card-header").first()).toContainText(
    `Roles - ${TEST_USER} @ <root>`
  );
  await expect(page.locator("#Role_reader")).toBeChecked();

  // --- Toggle the analyst role on, then off ---
  // NOTE: use click() + expect(), not check()/uncheck(). setACL() resets
  // the ACL to {} ("Loading ACLs") while the SetUserRoles POST is in flight,
  // which detaches the switches from the DOM; check()/uncheck() fail on the
  // detached element, while expect().toBeChecked() re-queries the DOM.
  await page.locator("#Role_analyst").click();
  await expect(page.locator("#Role_analyst")).toBeChecked();

  await page.locator("#Role_analyst").click();
  await expect(page.locator("#Role_analyst")).not.toBeChecked();

  // --- Remove the last role: confirm dialog appears ---
  await page.locator("#Role_reader").click();
  await expect(page.getByText(`You are about to remove user ${TEST_USER} from Org <root>`)).toBeVisible();
  await page.getByRole("button", { name: "Do it!" }).click();

  // The dialog closes and the user is removed from the org (and thus the
  // global user list). Verify via the API to avoid the list-refresh race.
  await expect(page.getByText(`You are about to remove user ${TEST_USER} from Org <root>`)).toHaveCount(0);
  const resp = await page.request.get("/api/v1/GetGlobalUsers");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  const names = (body.users || []).map((u) => u.name);
  expect(names).not.toContain(TEST_USER);
});