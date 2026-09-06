/**
 * Behavioral spec for the sidebar keyboard shortcuts (react-hotkeys).
 *
 * Encodes what the hotkeys DO: alt+d → dashboard, alt+a → artifacts,
 * alt+n → notebooks, alt+c → collected artifacts (requires a selected
 * client), ctrl+shift+/ → focus the client search bar.
 *
 * Runs against the live server. Non-destructive.
 *
 * Run with: npx playwright test src/components/sidebar/hotkeys.spec.js
 */
import { test, expect } from "@playwright/test";

const CLIENT_ID = "C.9e12b994f5c41ab6";

test.use({
  baseURL: "https://localhost:8889",
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: "Basic " + Buffer.from("admin:password").toString("base64"),
  },
});

// The hotkey handlers live in the sidebar (GlobalHotKeys), so the app
// shell must be fully loaded before a shortcut will fire.
async function loadApp(page, hash) {
  await page.goto(`/app/index.html?org_id=root#${hash}`);
  await expect(page.locator("button.hamburger")).toBeVisible();
  // Give the GlobalHotKeys component time to mount.
  await page.waitForTimeout(4000);
}

test("alt+d navigates to the dashboard", async ({ page }) => {
  await loadApp(page, "/welcome");
  await page.keyboard.press("Alt+d");
  await expect(page).toHaveURL(/#\/dashboard$/);
});

test("alt+a navigates to the artifact view", async ({ page }) => {
  await loadApp(page, "/welcome");
  await page.keyboard.press("Alt+a");
  await expect(page).toHaveURL(/#\/artifacts$/);
});

test("alt+n navigates to notebooks", async ({ page }) => {
  await loadApp(page, "/welcome");
  await page.keyboard.press("Alt+n");
  await expect(page).toHaveURL(/#\/notebooks$/);
});

test("alt+c navigates to collected artifacts for the selected client", async ({ page }) => {
  await loadApp(page, `/host/${CLIENT_ID}`);
  await page.keyboard.press("Alt+c");
  await expect(page).toHaveURL(new RegExp(`#\\/collected\\/${CLIENT_ID}$`));
});

test("ctrl+shift+/ focuses the client search bar", async ({ page }) => {
  await loadApp(page, "/welcome");
  await page.keyboard.press("Control+Shift+/");
  const focusedId = await page.evaluate(
    () => document.activeElement && document.activeElement.id);
  expect(focusedId).toBe("client-search-bar");
});