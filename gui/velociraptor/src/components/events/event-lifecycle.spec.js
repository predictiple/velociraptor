/**
 * Behavioral spec for the Server Event Monitoring wizard lifecycle.
 *
 * The full journey: open the wizard, add a monitoring artifact
 * (Server.Monitoring.ClientCount), launch (auto-submits — the Launch step
 * fires immediately when the artifacts need no tools), verify the server
 * monitoring state via the API, then open the wizard again, remove the
 * artifact, launch, and verify the state is restored to the original two
 * artifacts.
 *
 * The test is self-healing: afterEach restores the baseline monitoring state
 * via the API if the test fails midway, so a broken run cannot leave the
 * server collecting an extra artifact.
 *
 * Run with: npx playwright test src/components/events/event-lifecycle.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

const BASELINE = {
  artifacts: ["Server.Monitor.Health", "Server.Monitoring.RSSFeeds"],
  specs: [
    { artifact: "Server.Monitor.Health", parameters: {} },
    { artifact: "Server.Monitoring.RSSFeeds", parameters: {} },
  ],
};

const monitoringArtifacts = async (request) => {
  const resp = await request.get("/api/v1/GetServerMonitoringState");
  const state = await resp.json();
  return state.artifacts || [];
};

const availableEventArtifacts = async (request, csrf) => {
  const resp = await request.post("/api/v1/ListAvailableEventResults", {
    headers: {
      "X-CSRF-Token": csrf,
      Referer: "https://localhost:8889/app/index.html",
    },
    data: { client_id: "server" },
  });
  const state = await resp.json();
  return (state.logs || []).map((l) => l.artifact);
};

const deleteClientCountEvents = async (request, csrf) => {
  await request.post("/api/v1/CollectArtifact", {
    headers: {
      "X-CSRF-Token": csrf,
      Referer: "https://localhost:8889/app/index.html",
    },
    data: {
      client_id: "server",
      allow_custom_overrides: true,
      artifacts: ["Server.Utils.DeleteEvents"],
      specs: [
        {
          artifact: "Server.Utils.DeleteEvents",
          parameters: {
            env: [
              { key: "Artifact", value: "Server.Monitoring.ClientCount" },
              { key: "ClientId", value: "server" },
              { key: "StartTime", value: "2000-01-01T00:00:00Z" },
              { key: "EndTime", value: "2100-01-01T00:00:00Z" },
              { key: "ReallyDoIt", value: "Y" },
            ],
          },
        },
      ],
      max_upload_bytes: 1048576000,
    },
  });
};

test.afterEach(async ({ page }) => {
  const csrf = await page.evaluate(() => window.CsrfToken);

  // 1. Restore the baseline monitoring table FIRST so the collector stops
  //    writing Server.Monitoring.ClientCount rows/logs before we delete them.
  const names = await monitoringArtifacts(page.request);
  const baseline = BASELINE.artifacts;
  if (names.length !== baseline.length || !baseline.every((n) => names.includes(n))) {
    await page.request.post("/api/v1/SetServerMonitoringState", {
      headers: {
        "X-CSRF-Token": csrf,
        Referer: "https://localhost:8889/app/index.html",
      },
      data: BASELINE,
    });
    // Wait for the table change to propagate so the collector stops writing.
    await expect
      .poll(async () => monitoringArtifacts(page.request))
      .toEqual(["Server.Monitor.Health", "Server.Monitoring.RSSFeeds"]);
    await page.waitForTimeout(3000);
  }

  // 2. Delete any event rows/logs the test collected for
  //    Server.Monitoring.ClientCount so the available-artifacts list does not
  //    grow. DeleteEvents removes both row and log files; retry until the
  //    artifact disappears from the list (the delete flow is async).
  await expect
    .poll(
      async () => {
        await deleteClientCountEvents(page.request, csrf);
        await page.waitForTimeout(4000);
        return (await availableEventArtifacts(page.request, csrf)).includes(
          "Server.Monitoring.ClientCount"
        );
      },
      { timeout: 30000 }
    )
    .toBe(false);
});

const STEP_INDEX = { "Select Artifacts": 0, "Configure Parameters": 1, Review: 2, Launch: 3 };

const stepWrapper = (page, idx) => page.locator(".modal-footer").nth(idx).locator("xpath=..");

const activeStepIndex = (page) =>
  page.evaluate(() => {
    const footers = document.querySelectorAll(".modal-footer");
    for (let i = 0; i < footers.length; i++) {
      if (getComputedStyle(footers[i].parentElement).position === "relative") return i;
    }
    return -1;
  });

const gotoWizardStep = async (page, name, { wait = true } = {}) => {
  const currentIdx = await activeStepIndex(page);
  await page
    .locator(".modal-footer")
    .nth(currentIdx)
    .locator("a.page-link", { hasText: name })
    .click();
  if (wait) {
    await expect(stepWrapper(page, STEP_INDEX[name])).toHaveCSS("position", "relative");
  }
};

const openWizard = async (page) => {
  await page
    .locator(".artifact-toolbar button", { hasText: "Update server monitoring tables" })
    .click();
  // Wait for the async table load (the initial "..." search populates rows).
  await expect(page.locator(".new-artifact-search-table tbody tr").first()).toBeVisible();
};

test("event monitoring lifecycle: add an artifact, verify, remove it", async ({ page }) => {
  await page.goto("/app/index.html?org_id=root#/events/server");
  await expect(page.locator(".artifact-toolbar button").first()).toBeVisible();

  // --- Add Server.Monitoring.ClientCount ---
  await openWizard(page);
  await page.getByPlaceholder("Search for artifacts...").fill("ClientCount");
  await expect(
    page.locator(".new-artifact-search-table tbody tr", { hasText: "Server.Monitoring.ClientCount" })
  ).toHaveCount(1);

  // Not yet selected — click to add it.
  await page
    .locator(".new-artifact-search-table tbody tr", { hasText: "Server.Monitoring.ClientCount" })
    .locator("button")
    .click();
  // The filtered result row is now marked selected.
  await expect(
    page.locator(".new-artifact-search-table tbody tr.row-selected", {
      hasText: "Server.Monitoring.ClientCount",
    })
  ).toHaveCount(1);

  // Review shows the new artifact in the request.
  await gotoWizardStep(page, "Review");
  await expect(stepWrapper(page, 2)).toContainText("Server.Monitoring.ClientCount");

  // Launch auto-submits (no tools needed) and closes the wizard.
  await gotoWizardStep(page, "Launch", { wait: false });
  await expect(page.locator(".modal")).toHaveCount(0);

  // The server monitoring state now includes the new artifact.
  await expect
    .poll(async () => monitoringArtifacts(page.request))
    .toContain("Server.Monitoring.ClientCount");

  // --- Remove it again ---
  await openWizard(page);
  await page.getByPlaceholder("Search for artifacts...").fill("ClientCount");
  await expect(
    page.locator(".new-artifact-search-table tbody tr", { hasText: "Server.Monitoring.ClientCount" })
  ).toHaveCount(1);

  // Now selected — click to remove it.
  await page
    .locator(".new-artifact-search-table tbody tr", { hasText: "Server.Monitoring.ClientCount" })
    .locator("button")
    .click();
  // The filtered result row is no longer selected.
  await expect(
    page.locator(".new-artifact-search-table tbody tr.row-selected", {
      hasText: "Server.Monitoring.ClientCount",
    })
  ).toHaveCount(0);

  await gotoWizardStep(page, "Review");
  await expect(stepWrapper(page, 2)).not.toContainText("Server.Monitoring.ClientCount");

  await gotoWizardStep(page, "Launch", { wait: false });
  await expect(page.locator(".modal")).toHaveCount(0);

  // Back to the original two artifacts.
  await expect
    .poll(async () => monitoringArtifacts(page.request))
    .toEqual(["Server.Monitor.Health", "Server.Monitoring.RSSFeeds"]);
});