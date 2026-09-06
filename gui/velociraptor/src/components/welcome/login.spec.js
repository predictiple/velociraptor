/**
 * Behavioral spec for the Basic Auth / login flow and logoff.
 *
 * Encodes what authentication DOES: the GUI requires HTTP Basic Auth
 * (401 + WWW-Authenticate without credentials), loads with valid
 * credentials, and the logoff button initiates the logoff flow (the
 * server answers the logoff URL with 401 to force the browser to
 * re-authenticate).
 *
 * Runs against the live server. Non-destructive.
 *
 * Run with: npx playwright test src/components/welcome/login.spec.js
 */
import { test, expect } from "@playwright/test";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

test.describe("Basic auth", () => {
  // No credentials: the GUI must challenge for Basic Auth.
  test.use({ extraHTTPHeaders: {} });

  test("app requires basic auth without credentials", async ({ page }) => {
    const responses = [];
    page.on("response", (r) => {
      if (r.url().includes("/app/index.html")) {
        responses.push(r);
      }
    });

    // The browser cannot show the native auth dialog headless, so the
    // navigation fails — capture the server's challenge instead.
    await page.goto("/app/index.html?org_id=root#/dashboard").catch(() => {});

    const challenge = responses.find((r) => r.url().includes("/app/index.html"));
    expect(challenge).toBeTruthy();
    expect(challenge.status()).toBe(401);
    expect(challenge.headers()["www-authenticate"]).toContain("Basic");
  });
});

test.describe("Authenticated session", () => {
  test("app loads with valid credentials", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");

    // The app shell renders: sidebar and content area.
    await expect(page.locator("button.hamburger")).toBeVisible();
    await expect(page.locator("#content")).toBeVisible();
  });

  test("logoff button initiates the logoff flow", async ({ page }) => {
    await page.goto("/app/index.html?org_id=root#/dashboard");

    // The logoff button links to the logoff endpoint with the username.
    const logoffBtn = page.locator(".user-label a[href*='logoff']");
    await expect(logoffBtn).toBeVisible();
    await expect(logoffBtn).toHaveAttribute(
      "href", /\/app\/logoff\.html\?username=admin/);

    // Clicking it requests the logoff URL; the server answers 401 to
    // force the browser to re-authenticate.
    const responses = [];
    page.on("response", (r) => {
      if (r.url().includes("/app/logoff.html")) {
        responses.push(r);
      }
    });
    await logoffBtn.click();
    await expect.poll(() => responses.length).toBeGreaterThan(0);
    expect(responses[0].status()).toBe(401);
  });
});