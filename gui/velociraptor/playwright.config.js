// Playwright config for Velociraptor GUI behavioral specs.
//
// These specs encode what the GUI DOES (not how it looks) and run against a
// live Velociraptor instance. They act as an executable specification for
// preserving functionality during a GUI redesign.
//
// Defaults target the local dev instance (https://localhost:8889) with the
// standard admin:password credentials. Override via env vars:
//   VELO_URL, VELO_USER, VELO_PASS
//
// By default we use the system-installed Brave (what the user actually runs),
// avoiding any Playwright browser downloads. To use Playwright's bundled
// Chromium instead (requires `npx playwright install chromium`):
//   PLAYWRIGHT_BROWSER=chromium npx playwright test
import { defineConfig, devices } from "@playwright/test";

const VELO_URL = process.env.VELO_URL || "https://localhost:8889";
const VELO_USER = process.env.VELO_USER || "admin";
const VELO_PASS = process.env.VELO_PASS || "password";

// Default: system Brave at /opt/brave.com/brave/brave. Override with
// PLAYWRIGHT_BROWSER=chromium to use Playwright's bundled Chromium.
const useBrave = process.env.PLAYWRIGHT_BROWSER !== "chromium";

export default defineConfig({
  testDir: "./src",
  // Only run Playwright specs, not Jest unit tests (*.test.jsx).
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: VELO_URL,
    // Velociraptor uses a self-signed cert on the local dev instance.
    ignoreHTTPSErrors: true,
    // Velociraptor uses HTTP Basic Auth on /app/index.html (not a login form).
    extraHTTPHeaders: {
      Authorization:
        "Basic " + Buffer.from(`${VELO_USER}:${VELO_PASS}`).toString("base64"),
    },
    // Docs screenshot conventions: 1280x960 preferred, 1600x1200 for wide tables.
    viewport: { width: 1280, height: 960 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: useBrave
        ? {
            browserName: "chromium",
            channel: undefined,
            launchOptions: { executablePath: "/opt/brave.com/brave/brave" },
          }
        : { ...devices["Desktop Chrome"] },
    },
  ],
});