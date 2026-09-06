/**
 * Behavioral spec for the Server Artifacts collection action toolbar.
 *
 * Encodes what the flow action buttons DO once a collection is selected:
 * Copy opens the New Collection wizard prefilled, Save opens the
 * "Save this collection to your Favorites" dialog, Cancel is only enabled
 * for unfinished flows, and "Show only my collections" filters by creator.
 *
 * A single FINISHED server collection (Server.Information.Users — read-only,
 * fast) is created via the API in beforeAll and deleted in afterAll, so the
 * tests are deterministic and self-cleaning. Nothing here actually cancels,
 * copies, or saves a collection.
 *
 * Run with: npx playwright test src/components/flows/flows-actions.spec.js
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

let flowId;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "https://localhost:8889",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: AUTH,
  });
  const page = await context.newPage();
  await page.goto("/app/index.html?org_id=root#/collected/server");

  // Launch a fast read-only server collection.
  const launch = await page.request.post("/api/v1/CollectArtifact", {
    data: {
      client_id: "server",
      artifacts: ["Server.Information.Users"],
      specs: [{ artifact: "Server.Information.Users", parameters: { env: [] } }],
    },
  });
  expect(launch.status()).toBe(200);
  flowId = (await launch.json()).flow_id;
  expect(flowId).toMatch(/^F\./);

  // Wait for it to finish (read-only server artifact, usually < 5s).
  await expect
    .poll(async () => {
      const resp = await page.request.get(
        `/api/v1/GetFlowDetails?client_id=server&flow_id=${flowId}`);
      if (resp.status() !== 200) return "?";
      const body = await resp.json();
      return body.context && body.context.state;
    }, { timeout: 30000 })
    .toBe("FINISHED");

  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "https://localhost:8889",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: AUTH,
  });
  const page = await context.newPage();
  await page.goto("/app/index.html?org_id=root#/collected/server");
  await page.request.post("/api/v1/CollectArtifact", {
    data: {
      client_id: "server",
      artifacts: ["Server.Utils.DeleteFlow"],
      specs: [{
        artifact: "Server.Utils.DeleteFlow",
        parameters: {
          env: [
            { key: "FlowIds", value: JSON.stringify([flowId]) },
            { key: "ClientId", value: "server" },
            { key: "Sync", value: "Y" },
            { key: "ReallyDoIt", value: "Y" },
          ],
        },
      }],
    },
  });
  await context.close();
});

// Select the test flow in the list and wait for the inspector to load it.
async function selectFlow(page) {
  await page.goto("/app/index.html?org_id=root#/collected/server");
  await expect(page.locator("nav.flow-toolbar")).toBeVisible();
  const row = page.locator("table.paged-table tbody tr", { hasText: flowId });
  await expect(row).toHaveCount(1);
  await row.locator("td").first().click();
  await expect(page.locator("dt", { hasText: "Flow ID" })).toBeVisible();
}

test.describe.serial("Collection action toolbar", () => {
  test("Copy Collection opens the wizard prefilled with the flow request", async ({ page }) => {
    await selectFlow(page);
    await page.getByRole("button", { name: "Copy Collection" }).click();

    // The New Collection wizard opens on the Select Artifacts step.
    await expect(page.getByText("New Collection: Select Artifacts to collect")).toBeVisible();
    // The copied artifact is listed in the selection.
    await expect(page.locator(".modal-body").first()).toContainText("Server.Information.Users");

    // Close without creating anything (header X).
    await page.locator(".modal-header button[aria-label='Close']").first().click();
    await expect(page.getByText("New Collection: Select Artifacts to collect")).toHaveCount(0);
  });

  test("Save Collection opens the favorites dialog", async ({ page }) => {
    await selectFlow(page);
    await page.getByRole("button", { name: "Save Collection" }).click();

    await expect(page.getByText("Save this collection to your Favorites")).toBeVisible();
    // Name and Description fields render.
    await expect(page.getByPlaceholder("New Favorite name")).toBeVisible();
    await expect(page.getByPlaceholder("Describe this favorite")).toBeVisible();

    await page.locator(".modal-footer button", { hasText: "Close" }).click();
    await expect(page.getByText("Save this collection to your Favorites")).toHaveCount(0);
  });

  test("Cancel Artifact Collection is disabled for a finished flow", async ({ page }) => {
    await selectFlow(page);
    // The flow is FINISHED, so Cancel must be disabled.
    await expect(page.getByRole("button", { name: "Cancel Artifact Collection" })).toBeDisabled();
  });

  test("Show only my collections filters by creator", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/collected/server");
    await expect(page.locator("nav.flow-toolbar")).toBeVisible();

    // NOTE: the button's sr-only text is "Show only my hunts" (copy-paste
    // bug in flows-list.jsx) — the tooltip says "Show only my collections".
    // We freeze the actual accessible name.
    await page.getByRole("button", { name: "Show only my hunts" }).click();
    await expect(page.locator(".transform-viewer")).toContainText(/Creator\s*\(\s*admin\s*\)/);

    // The toggle flips to "Show all collections" — click it to clear.
    await page.getByRole("button", { name: "Show all hunts" }).click();
    await expect(page.locator(".transform-viewer")).toHaveCount(0);
  });
});