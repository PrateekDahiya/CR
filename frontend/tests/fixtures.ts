/**
 * Shared Playwright fixtures.
 *
 * The app now requires an account, so every test context must be signed in.
 * This fixture seeds a UNIQUE playerId per test (so backend state — decks,
 * coins, matches — cannot leak between tests). Specs that seed their own id
 * (via addInitScript) still win, because their script is registered after this
 * one and overwrites the value.
 */
import { test as base, expect } from "@playwright/test";

let seq = 0;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    seq += 1;
    const safe = testInfo.testId.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
    const id = `e2e-${safe}-${seq}-${Date.now().toString(36)}`;
    // Signed in by default so protected routes render. Specs that seed their own
    // id register their script AFTER this one, so theirs wins (same key).
    await page.addInitScript((pid: string) => {
      try {
        window.localStorage.setItem("cr-player-id", pid);
        window.localStorage.setItem("cr-name", pid);
      } catch {
        // storage unavailable
      }
    }, id);
    await use(page);
  },
});

export { expect };
