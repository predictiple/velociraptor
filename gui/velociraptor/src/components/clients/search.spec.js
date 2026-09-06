/**
 * Behavioral spec for the global client search box (top toolbar).
 *
 * Encodes what the client search DOES: render the search bar, show
 * suggestions as the user types, navigate to the client list on
 * selection/submit, offer search presets (Show All / Recent Hosts /
 * Labeled Hosts / Unlabeled Hosts), and open a client's host info when a
 * result row is clicked.
 *
 * Runs against the live server. Non-destructive.
 *
 * Run with: npx playwright test src/components/clients/search.spec.js
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

test.describe("Global client search", () => {
  test("search bar renders with the client-search placeholder", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");

    const searchBar = page.locator("#client-search-bar");
    await expect(searchBar).toBeVisible();
    await expect(searchBar).toHaveAttribute("placeholder", "Search clients");
    await expect(page.locator("#client_query_submit")).toBeVisible();
  });

  test("typing shows suggestions and selecting navigates to the client list", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");

    await page.locator("#client-search-bar").fill("1oca1host");
    const suggestion = page.locator(".search-suggestions", { hasText: "1oca1host" });
    await expect(suggestion.first()).toBeVisible();

    await suggestion.first().click();
    await expect(page).toHaveURL(/#\/search\/host:1oca1host/);

    // The client list renders the matching clients.
    const table = page.locator("table.paged-table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await expect(table.locator("thead")).toContainText("Client ID");
    await expect(table.locator("thead")).toContainText("Hostname");
    await expect(table.locator("tbody")).toContainText(CLIENT_ID);
  });

  test("dropdown offers search presets and Show All lists every client", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");

    // Open the preset dropdown next to the search bar.
    await page.locator("#client_query_submit + div .dropdown-toggle").click();
    const items = page.locator(".dropdown-menu .dropdown-item");
    await expect(items).toContainText([
      "Show All",
      "Recent Hosts",
      "Labeled Hosts",
      "Unlabeled Hosts",
      "Create Notebook",
    ]);

    // Show All navigates to the full client list.
    await page.locator("#show-hosts-btn").click();
    await expect(page).toHaveURL(/#\/search\/all/);
    const table = page.locator("table.paged-table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await expect(table.locator("tbody")).toContainText(CLIENT_ID);
  });

  test("clicking a client row opens its host information", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/search/all");

    // The Client ID cell contains a link button that opens the host info.
    const clientLink = page.locator("button.client-link", { hasText: CLIENT_ID });
    await expect(clientLink).toBeVisible();
    await clientLink.click();

    // Selecting a client navigates to its host info page.
    await expect(page).toHaveURL(new RegExp(`#/host/${CLIENT_ID}`));
  });
});