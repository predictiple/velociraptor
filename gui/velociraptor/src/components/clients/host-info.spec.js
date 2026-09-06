/**
 * Behavioral spec for the Host Information view.
 *
 * Encodes what the host view DOES: show client details, switch between
 * Overview / VQL Drilldown / Shell modes, expose navigation to VFS and
 * Collected, and render quarantine/label controls.
 *
 * Runs against the live server with the single local client
 * C.9e12b994f5c41ab6. Deliberately avoids destructive actions
 * (interrogate, quarantine, label changes, metadata writes) so the test
 * never mutates the client.
 *
 * Run with: npx playwright test src/components/clients/host-info.spec.js
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

test.beforeEach(async ({ page }) => {
  // The app redirects to #/welcome when the URL lacks ?org_id= (see
  // user.jsx updateTraits), so include it to deep-link directly.
  await page.goto(`/app/index.html?org_id=root#/host/${CLIENT_ID}`);
  // The client summary (top bar) renders once the client record loads.
  await expect(page.locator(".client-summary")).toBeVisible();
});

test.describe("Host Information view", () => {
  test("shows the client identity in the top summary bar", async ({ page }) => {
    // The summary shows the FQDN as a link back to this host.
    const name = page.locator(".client-summary .client-name");
    await expect(name).toHaveText("1oca1host");
    await expect(name).toHaveAttribute("href", `#/host/${CLIENT_ID}`);
  });

  test("overview mode shows client details", async ({ page }) => {
    // Overview is the default mode: a dashboard row with a details card.
    await expect(page.locator(".dashboard")).toBeVisible();
    // Key fields are present.
    await expect(page.getByText("Client ID")).toBeVisible();
    await expect(page.getByText(CLIENT_ID)).toBeVisible();
    await expect(page.getByText("Operating System")).toBeVisible();
    await expect(page.getByText("linux", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Hostname")).toBeVisible();
    await expect(page.getByText("1oca1host").first()).toBeVisible();
  });

  test("toolbar exposes Interrogate, VFS, Collected and Add Label actions", async ({ page }) => {
    // Interrogate button.
    await expect(page.getByRole("button", { name: /interrogate/i })).toBeVisible();
    // VFS / Collected are <Link role="button"> so they expose as buttons.
    await expect(page.getByRole("button", { name: /vfs/i })).toHaveAttribute(
      "href", `#/vfs/${CLIENT_ID}/`);
    await expect(page.getByRole("button", { name: /collected/i })).toHaveAttribute(
      "href", `#/collected/${CLIENT_ID}`);
    // Add Label button (icon-only, tooltip text is hidden).
    await expect(page.locator('svg[data-icon="tags"]')).toBeVisible();
  });

  test("mode switch: VQL Drilldown shows the report viewer", async ({ page }) => {
    await page.getByRole("button", { name: /vql drilldown/i }).click();
    // The detailed mode renders a report viewer for the client.
    await expect(page.locator(".client-details.dashboard")).toBeVisible();
    // The report viewer area exists and has content for this client.
    await expect(page.locator(".client-details.dashboard")).not.toBeEmpty();
  });

  test("mode switch: Shell shows the shell viewer", async ({ page }) => {
    await page.getByRole("button", { name: /shell/i }).click();
    await expect(page.locator(".client-details.shell")).toBeVisible();
  });

  test("mode buttons toggle active state", async ({ page }) => {
    const overview = page.getByRole("button", { name: /overview/i });
    const drilldown = page.getByRole("button", { name: /vql drilldown/i });
    const shell = page.getByRole("button", { name: /shell/i });

    // Overview is active by default.
    await expect(overview).toHaveClass(/active/);
    await expect(drilldown).not.toHaveClass(/active/);

    await drilldown.click();
    await expect(drilldown).toHaveClass(/active/);
    await expect(overview).not.toHaveClass(/active/);

    await shell.click();
    await expect(shell).toHaveClass(/active/);
    await expect(drilldown).not.toHaveClass(/active/);
  });

  test("quarantine button is present for this client", async ({ page }) => {
    // The client is not quarantined, so the Quarantine Host button shows
    // (suitcase-medical icon; the tooltip text is hidden until hover). It
    // may be absent if the server disables it via traits.
    const quarantine = page.locator('svg[data-icon="suitcase-medical"]');
    const unquarantine = page.locator('svg[data-icon="virus-slash"]');
    const count = await quarantine.count() + await unquarantine.count();
    // Either one of them should exist (never both).
    expect(count).toBe(1);
  });

  test("sidebar Host Information link navigates to this client", async ({ page }) => {
    await page.locator("button.hamburger").click();
    const link = page.getByRole("link", { name: "Host Information" });
    await expect(link).toHaveAttribute("href", `#/host/${CLIENT_ID}`);
  });
});