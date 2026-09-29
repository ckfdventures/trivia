import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests.
 *
 * These exercise what unit and socket-level tests cannot: real rendering, real pointer input,
 * and two players in two browser contexts seeing each other. The canvas in particular can only
 * be judged by drawing on one and reading the pixels back.
 *
 * Needs the API running on :8001 with MongoDB behind it. `npm run e2e` starts the web app
 * itself; the backend is left alone because it owns a database and a dev server should not be
 * torn down and rebuilt by a test run.
 */
const WEB = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Rooms are shared server state, so tests that create them must not interleave.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // A real pointer is the point of these tests; headless Chromium still delivers one.
    permissions: [],
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Only the web app. Reusing an already-running dev server keeps the loop fast locally.
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: WEB,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
