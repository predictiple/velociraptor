/**
 * Behavioral spec for the sidebar navigation (navigator).
 *
 * Encodes what the sidebar DOES: expand/collapse via the hamburger, render
 * all navigation links, disable client-dependent links when no client is
 * selected, and navigate to the correct view when a link is clicked.
 *
 * Runs against the live server. Non-destructive.
 *
 * Run with: npx playwright test src/components/sidebar/navigation.spec.js
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

// The sidebar is collapsed by default; expand it via the hamburger.
const expandSidebar = async (page) => {
  const nav = page.locator("nav.navigator");
  if (await nav.locator("a").count() === 0) {
    await page.locator("button.hamburger").click();
    await expect(nav.locator("a").first()).toBeVisible();
  }
};

// The sidebar collapses after a click; re-expand before the next link.
const clickNavLink = async (page, text) => {
  await expandSidebar(page);
  await page.locator("nav.navigator a", { hasText: text }).click();
};

test.describe("Sidebar navigation", () => {
  test("renders all navigation links", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");
    await expandSidebar(page);

    const nav = page.locator("nav.navigator");
    await expect(nav.locator("a", { hasText: "Home" })).toHaveAttribute("href", "#/dashboard");
    await expect(nav.locator("a", { hasText: "Hunt Manager" })).toHaveAttribute("href", "#/hunts");
    await expect(nav.locator("a", { hasText: "View Artifacts" })).toHaveAttribute("href", "#/artifacts");
    await expect(nav.locator("a", { hasText: "Server Events" })).toHaveAttribute("href", "#/events/server");
    await expect(nav.locator("a", { hasText: "Server Artifacts" })).toHaveAttribute("href", "#/collected/server");
    await expect(nav.locator("a", { hasText: "Notebooks" })).toHaveAttribute("href", "#/notebooks");
    await expect(nav.locator("a", { hasText: "Users" })).toHaveAttribute("href", "#/users");
    await expect(nav.locator("a", { hasText: "Documentation" })).toHaveAttribute(
      "href", "https://docs.velociraptor.app/");
  });

  test("client-dependent links are disabled without a client", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");
    await expandSidebar(page);

    const nav = page.locator("nav.navigator");
    await expect(nav.locator("a", { hasText: "Host Information" })).toHaveAttribute("aria-hidden", "true");
    await expect(nav.locator("a", { hasText: "Virtual Filesystem" })).toHaveAttribute("aria-hidden", "true");
    await expect(nav.locator("a", { hasText: "Collected Artifacts" })).toHaveAttribute("aria-hidden", "true");
    await expect(nav.locator("a", { hasText: "Client Events" })).toHaveAttribute("aria-hidden", "true");
  });

  test("server-side links navigate to their views", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");

    await clickNavLink(page, "Home");
    await expect(page).toHaveURL(/#\/dashboard/);

    await clickNavLink(page, "Hunt Manager");
    await expect(page).toHaveURL(/#\/hunts$/);

    await clickNavLink(page, "View Artifacts");
    await expect(page).toHaveURL(/#\/artifacts$/);

    await clickNavLink(page, "Server Events");
    await expect(page).toHaveURL(/#\/events\/server$/);

    await clickNavLink(page, "Server Artifacts");
    await expect(page).toHaveURL(/#\/collected\/server$/);

    await clickNavLink(page, "Notebooks");
    await expect(page).toHaveURL(/#\/notebooks$/);

    await clickNavLink(page, "Users");
    await expect(page).toHaveURL(/#\/users$/);
  });

  test("with a client selected, client links navigate to the client's views", async ({
    page,
  }) => {
    // Navigating to a client route selects the client.
    await page.goto(`/app/index.html?org_id=root#/host/${CLIENT_ID}`);
    await expandSidebar(page);

    const nav = page.locator("nav.navigator");
    await expect(nav.locator("a", { hasText: "Host Information" })).toHaveAttribute(
      "href", `#/host/${CLIENT_ID}`);
    await expect(nav.locator("a", { hasText: "Virtual Filesystem" })).toHaveAttribute(
      "href", `#/vfs/${CLIENT_ID}/`);
    await expect(nav.locator("a", { hasText: "Collected Artifacts" })).toHaveAttribute(
      "href", `#/collected/${CLIENT_ID}`);
    await expect(nav.locator("a", { hasText: "Client Events" })).toHaveAttribute(
      "href", `#/events/${CLIENT_ID}`);

    // Clicking the client links navigates to the client's views.
    await clickNavLink(page, "Virtual Filesystem");
    await expect(page).toHaveURL(new RegExp(`#/vfs/${CLIENT_ID}/`));

    await clickNavLink(page, "Collected Artifacts");
    await expect(page).toHaveURL(new RegExp(`#/collected/${CLIENT_ID}`));

    await clickNavLink(page, "Client Events");
    await expect(page).toHaveURL(new RegExp(`#/events/${CLIENT_ID}`));

    await clickNavLink(page, "Host Information");
    await expect(page).toHaveURL(new RegExp(`#/host/${CLIENT_ID}`));
  });
});