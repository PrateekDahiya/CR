import { defineConfig, devices } from "@playwright/test";

/**
 * frontend/playwright.config.ts — minimal Chromium-only config (Phase 4 shell).
 * Fixes ISS-F4-005 / ISS-N4-001: `npm run test:e2e` references --project=chromium.
 * Manual webServer: run `npm run dev` (:3000) separately; no auto webServer here.
 *
 * Auth: the app requires an account (register/login). tests/fixtures.ts seeds a
 * UNIQUE signed-in playerId per test, so backend state cannot leak between
 * tests. No global storageState here on purpose (it would pin one account).
 */
export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
