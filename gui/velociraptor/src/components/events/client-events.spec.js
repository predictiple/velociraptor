/**
 * Behavioral spec for the Client Events view (/events/:client_id).
 *
 * Encodes what the client event monitoring page DOES differently from the
 * server view: list the client event artifacts (Generic.Client.Stats,
 * Server.Internal.ClientInfo, System.Flow.Completion), expose the
 * client-specific monitoring actions (Update client monitoring table /
 * Show client monitoring tables), and render the event table for a
 * selected artifact.
 *
 * Uses the live client C.9e12b994f5c41ab6 (1oca1host). Non-destructive —
 * never launches the wizard, never deletes events.
 *
 * Run with: npx playwright test src/components/events/client-events.spec.js
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

test.describe("Client Events view", () => {
  test("artifact selector lists available event artifacts with nothing selected", async ({
    page,
  }) => {
    await page.goto(`/app/index.html?org_id=root#/events/${CLIENT_ID}`);

    // The select is empty (placeholder) — no artifact selected yet.
    await expect(page.locator(".event-artifacts .velo__placeholder")).toHaveText(
      "Select artifact"
    );

    // Open the selector: the client event artifacts are listed.
    await page.locator(".event-artifacts").click();
    const options = page.locator(".velo__option");
    await expect(options).toContainText([
      "Generic.Client.Stats",
      "Server.Internal.ClientInfo",
      "System.Flow.Completion",
    ]);

    // Nothing selected → no timeline, no table.
    await expect(page.locator(".react-calendar-timeline")).toHaveCount(0);
    await expect(page.locator(".event-report-viewer .paged-table")).toHaveCount(0);
  });

  test("toolbar exposes client monitoring actions", async ({ page }) => {
    await page.goto(`/app/index.html?org_id=root#/events/${CLIENT_ID}`);

    // Client view: the wizard and monitoring-table buttons use the
    // client-specific labels (the server view says "server").
    await expect(
      page.locator(".artifact-toolbar button", { hasText: "Update client monitoring table" }),
    ).toBeVisible();
    await expect(
      page.locator(".artifact-toolbar button", { hasText: "Show client monitoring tables" }),
    ).toBeVisible();
    await expect(
      page.locator(".artifact-toolbar button", { hasText: "Update server monitoring tables" }),
    ).toHaveCount(0);
  });

  test("deep link to an artifact renders the event table", async ({ page }) => {
    await page.goto(
      `/app/index.html?org_id=root#/events/${CLIENT_ID}/Generic.Client.Stats`,
    );

    // The select shows the selected artifact.
    await expect(page.locator(".event-artifacts .velo__single-value")).toHaveText(
      "Generic.Client.Stats"
    );

    // The timeline and the event table render.
    await expect(page.locator(".react-calendar-timeline")).toBeVisible();
    const table = page.locator(".event-report-viewer .paged-table");
    await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 30000 });

    // The table carries the expected columns for this artifact.
    await expect(table.locator("thead")).toContainText("Server Time");
    await expect(table.locator("thead")).toContainText("CPU");
    await expect(table.locator("thead")).toContainText("RSS");
    await expect(table.locator("thead")).toContainText("ClientId");
  });

  test("selecting an artifact via the dropdown updates the URL and renders its table", async ({
    page,
  }) => {
    await page.goto(`/app/index.html?org_id=root#/events/${CLIENT_ID}`);

    // Select an artifact from the dropdown.
    await page.locator(".event-artifacts").click();
    await page.locator(".velo__option", { hasText: "Generic.Client.Stats" }).click();

    // The URL reflects the selection.
    await expect(page).toHaveURL(
      new RegExp(`#/events/${CLIENT_ID}/Generic\\.Client\\.Stats`),
    );

    // The event table renders rows.
    const table = page.locator(".event-report-viewer .paged-table");
    await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 30000 });
    await expect(table.locator("tbody")).toContainText(CLIENT_ID);
  });
});