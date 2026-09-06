/**
 * Behavioral spec for the Server Events view (/events/server).
 *
 * Encodes what the server event monitoring page DOES: list available event
 * artifacts, render the event table (Raw Data / Logs modes), toggle columns,
 * change page size, offer CSV/JSON downloads, show the raw monitoring table
 * JSON, drive the Server Event Monitoring wizard (without launching), and
 * render per-artifact notebooks in Notebook mode.
 *
 * Runs against the live server. Non-destructive — never launches the wizard
 * (Launch auto-submits), never deletes events, never confirms notebook
 * deletion. The one side effect is Notebook mode auto-creating the event
 * notebook (N.E.<artifact>-server); afterAll cleans it up via the API.
 * The full add/remove monitoring-artifact journey lives in
 * event-lifecycle.spec.js.
 *
 * Run with: npx playwright test src/components/events/events.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

// The event notebook is auto-created by Notebook mode; remove it afterwards.
test.afterAll(async ({ browser }) => {
  // Delete the auto-created notebook via context.request (shares the
  // context's cookies + Basic auth).
  const context = await browser.newContext({
    extraHTTPHeaders: {
      Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
    },
  });
  const page = await context.newPage();
  await page.goto("/app/index.html");
  await context.request.post("/api/v1/DeleteNotebook", {
    data: { notebook_id: "N.E.Server.Audit.Logs-server" },
  });
  await context.close();
});

const modeToggle = (page) =>
  page.locator(".artifact-toolbar .float-right .dropdown-toggle");

const setMode = async (page, mode) => {
  await modeToggle(page).click();
  await page
    .locator(".artifact-toolbar .float-right .dropdown-menu .dropdown-item", {
      hasText: mode,
    })
    .click();
};

// Artifact names containing "/" (e.g. Server.Monitor.Health/Prometheus) cannot
// be deep-linked — the router treats the slash as the :time param — so select
// them via the dropdown instead.
const selectArtifact = async (page, name) => {
  await page.locator(".event-artifacts").click();
  await page.locator(".velo__option", { hasText: name }).click();
};

test.describe("Server Events view", () => {
  test("artifact selector lists available event artifacts with nothing selected", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server");

    // The select is empty (placeholder) — no artifact selected yet.
    await expect(page.locator(".event-artifacts .velo__placeholder")).toHaveText(
      "Select artifact"
    );

    // Open the selector: all server event results are listed. (The exact
    // count can grow as the server collects new event types, so assert the
    // known set is present.)
    await page.locator(".event-artifacts").click();
    const options = page.locator(".velo__option");
    await expect(options).toContainText([
      "Server.Audit.Logs",
      "Server.Internal.ArtifactModification",
      "Server.Internal.ClientDelete",
      "Server.Monitor.Health/Prometheus",
      "Server.Monitoring.RSSFeeds",
      "System.Hunt.Creation",
    ]);

    // Nothing selected → no timeline, no table.
    await expect(page.locator(".react-calendar-timeline")).toHaveCount(0);
    await expect(page.locator(".event-report-viewer .paged-table")).toHaveCount(0);
  });

  test("deep link to an artifact renders the event table", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/events/server/Server.Audit.Logs");

    // The select shows the selected artifact.
    await expect(page.locator(".event-artifacts .velo__single-value")).toHaveText(
      "Server.Audit.Logs"
    );

    // Timeline renders with the three groups.
    await expect(page.locator(".react-calendar-timeline")).toHaveCount(1);

    // Table headers: Server Time + the artifact's columns.
    const headers = page.locator(".event-report-viewer .paged-table thead th");
    await expect(headers).toHaveCount(4);
    await expect(headers.nth(0)).toHaveText("Server Time");
    await expect(headers.nth(1)).toHaveText("operation");
    await expect(headers.nth(2)).toHaveText("principal");
    await expect(headers.nth(3)).toHaveText("details");

    // Default page size is 10 rows.
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(10);
  });

  test("selecting an artifact via the dropdown updates the URL and renders its table", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server");

    await page.locator(".event-artifacts").click();
    await page
      .locator(".velo__option", { hasText: "Server.Monitor.Health/Prometheus" })
      .click();

    // URL gains the artifact path (the slash is part of the artifact name).
    await expect(page).toHaveURL(
      /#\/events\/server\/Server\.Monitor\.Health\/Prometheus/
    );
    await expect(page.locator(".event-artifacts .velo__single-value")).toHaveText(
      "Server.Monitor.Health/Prometheus"
    );

    // Health/Prometheus columns render.
    const headers = page.locator(".event-report-viewer .paged-table thead th");
    await expect(headers.nth(0)).toHaveText("Server Time");
    await expect(headers).toContainText(["TotalFrontends", "CPUPercent", "MemoryUse"]);
  });

  test("column toggle hides and restores a column", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/events/server/Server.Audit.Logs");
    await expect(page.locator(".event-report-viewer .paged-table thead th")).toHaveCount(4);

    // The column toggle is the first dropdown in the toolbar's left group.
    const colDropdown = page
      .locator(".artifact-toolbar .btn-group")
      .first()
      .locator(".dropdown")
      .first();
    await colDropdown.locator(".dropdown-toggle").click();

    // Toggle "details" off. The column-toggle menu stays open after a select
    // (controlled `show` in ColumnToggle), so no need to reopen it.
    await colDropdown.locator(".dropdown-menu .dropdown-item", { hasText: "details" }).click();
    await expect(page.locator(".event-report-viewer .paged-table thead th")).toHaveCount(3);
    await expect(page.locator(".event-report-viewer .paged-table thead th").nth(0)).toHaveText(
      "Server Time"
    );
    await expect(page.locator(".event-report-viewer .paged-table thead th").nth(1)).toHaveText(
      "operation"
    );
    await expect(page.locator(".event-report-viewer .paged-table thead th").nth(2)).toHaveText(
      "principal"
    );

    // Toggle it back on.
    await colDropdown.locator(".dropdown-menu .dropdown-item", { hasText: "details" }).click();
    await expect(page.locator(".event-report-viewer .paged-table thead th")).toHaveCount(4);
  });

  test("page size selector changes the row count", async ({ page }) => {
    // Health/Prometheus has 27 timestamps — enough for a 20-row page.
    // (Cannot deep-link: the "/" in the name is parsed as the :time param.)
    await page.goto("/app/index.html?org_id=root#/events/server");
    await selectArtifact(page, "Server.Monitor.Health/Prometheus");
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(10);

    await page.locator("#row_count_selector").click();
    await page.locator(".page-size-dropdown .dropdown-menu .dropdown-item", { hasText: "20" }).click();

    await expect(page.locator("#row_count_selector")).toHaveText("20");
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(20);
  });

  test("download dropdown offers CSV and JSON with the visible time range", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server/Server.Audit.Logs");
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(10);

    // Download dropdown is the third dropdown in the left toolbar group
    // (after column toggle and page size).
    const dlDropdown = page
      .locator(".artifact-toolbar .btn-group")
      .first()
      .locator(".dropdown")
      .nth(2);
    await dlDropdown.locator(".dropdown-toggle").click();

    const csv = dlDropdown.locator(".dropdown-menu .dropdown-item", { hasText: "CSV" });
    const json = dlDropdown.locator(".dropdown-menu .dropdown-item", { hasText: "JSON" });
    await expect(csv).toHaveCount(1);
    await expect(json).toHaveCount(1);

    // Both link to the DownloadTable endpoint with the right format.
    await expect(csv).toHaveAttribute("href", /DownloadTable.*download_format=csv/);
    await expect(json).toHaveAttribute("href", /DownloadTable.*download_format=json/);

    // The visible time range is shown under the format name.
    await expect(csv).toContainText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
  });

  test("Logs mode shows the artifact log stream", async ({ page }) => {
    // Health/Prometheus has logs; Server.Audit.Logs does not.
    await page.goto("/app/index.html?org_id=root#/events/server");
    await selectArtifact(page, "Server.Monitor.Health/Prometheus");
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(10);

    await setMode(page, "Logs");
    await expect(modeToggle(page)).toHaveText("Logs");

    // Log tables use Timestamp/Level/Message columns.
    const headers = page.locator(".event-report-viewer .paged-table thead th");
    await expect(headers.nth(0)).toHaveText("Server Time");
    await expect(headers).toContainText(["Level", "Message"]);
    await expect(page.locator(".event-report-viewer .paged-table tbody tr").first()).toContainText(
      "Server.Monitor.Health/Prometheus"
    );
  });

  test("Notebook mode without an artifact prompts to select one", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/events/server");
    await setMode(page, "Notebook");
    await expect(modeToggle(page)).toHaveText("Notebook");
    await expect(page.locator(".event-report-viewer")).toContainText(
      "Please select an artifact to view above."
    );
  });

  test("Notebook mode with an artifact shows the event notebook and its toolbar", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server/Server.Audit.Logs");
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(10);

    await setMode(page, "Notebook");

    // Notebook-specific toolbar buttons appear.
    await expect(
      page.locator(".artifact-toolbar button", { hasText: "Edit Notebook" })
    ).toHaveCount(1);
    await expect(
      page.locator(".artifact-toolbar button", { hasText: "Delete Notebook" })
    ).toHaveCount(1);

    // The auto-created event notebook renders a VQL cell with the event query.
    await expect(page.locator(".event-report-viewer .notebook-cell")).toHaveCount(1);
    await expect(page.locator(".event-report-viewer")).toContainText(
      "Events from Server.Audit.Logs"
    );
  });

  test("raw monitoring table JSON modal shows the current server monitoring state", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server");

    await page
      .locator(".artifact-toolbar button", { hasText: "Show server monitoring tables" })
      .click();

    await expect(page.locator(".modal-title")).toHaveText(
      "Raw Server Monitoring Table JSON"
    );
    const ace = page.locator(".modal .ace_text-layer");
    await expect(ace).toContainText("Server.Monitor.Health");
    await expect(ace).toContainText("Server.Monitoring.RSSFeeds");

    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.locator(".modal")).toHaveCount(0);
  });

  test("update wizard opens with the currently monitored artifacts selected", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server");

    await page
      .locator(".artifact-toolbar button", { hasText: "Update server monitoring tables" })
      .click();

    // Wizard title (step 1 of 4).
    await expect(page.locator(".modal-title").first()).toHaveText(
      "Server Event Monitoring: Select artifacts to collect on the server"
    );

    // The two currently monitored artifacts are pre-selected.
    await expect(
      page.locator(".new-artifact-search-table tbody tr.row-selected")
    ).toHaveCount(2);

    // Close without launching.
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);
  });

  test("delete events dialog opens from the toolbar trash and can be dismissed", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server/Server.Audit.Logs");
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(10);

    // Trash button (raw data mode) opens the DeleteTimelineRanges dialog.
    await page.locator(".artifact-toolbar button svg.fa-trash").first().locator("xpath=..").click();
    await expect(page.locator(".modal-title")).toHaveText("Delete Events");
    await expect(page.locator(".modal-body")).toContainText(
      "Are you sure you want to delete all logs within the time range?"
    );
    await expect(page.locator(".modal-footer button", { hasText: "Kill it!" })).toHaveCount(1);

    // Dismiss — never confirm.
    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.locator(".modal")).toHaveCount(0);
  });

  test("delete notebook dialog opens in Notebook mode and can be dismissed", async ({
    page,
  }) => {
    await page.goto("/app/index.html?org_id=root#/events/server/Server.Audit.Logs");
    await expect(page.locator(".event-report-viewer .paged-table tbody tr")).toHaveCount(10);
    await setMode(page, "Notebook");

    await page.locator(".artifact-toolbar button", { hasText: "Delete Notebook" }).click();
    await expect(page.locator(".modal-title")).toHaveText("Permanently delete Notebook");
    await expect(page.locator(".modal-footer button", { hasText: "Yes do it!" })).toHaveCount(1);

    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.locator(".modal")).toHaveCount(0);
  });
});