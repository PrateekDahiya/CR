/**
 * frontend/tests/shell.spec.ts — Playwright smoke tests for the Phase 4 shell.
 *
 * Chromium only, headless by default. Run:
 *   npx playwright test --project=chromium
 * (see frontend/tests/README.md; requires `npx playwright install --with-deps chromium` once)
 *
 * Contract with sibling agents (MEMORY#16):
 *  - "/"        : h1 "CR Clone" + buttons Play / Lobby / Deck (owned by app-shell agent)
 *  - "/deck"    : deck builder exposing exactly 8 [data-testid="card-slot"] nodes
 *                 (owned by deck agent; pool cards must use a different test id)
 *  - "/lobby"   : lobby form with a visible player-id text input
 *                 [data-testid="player-id-input"] (fallback: any visible text input)
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  "http://localhost:3000";

test.describe("CR Clone shell (chromium)", () => {
  test("home / loads title CR Clone + 3 nav links", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page).toHaveTitle(/CR Clone/);
    await expect(page.getByRole("heading", { name: /CR Clone/i })).toBeVisible();
    // ISS-F4-004 (additive fix): home nav items are Next.js Links
    // (role="link", data-testid nav-play/nav-lobby/nav-deck), not <button>.
    // Assert stable testids first, then link roles (Deck matches 2 links —
    // top nav + main card — so scope Deck to its testid).
    await expect(page.getByTestId("nav-play")).toBeVisible();
    await expect(page.getByTestId("nav-lobby")).toBeVisible();
    await expect(page.getByTestId("nav-deck")).toBeVisible();
    await expect(page.getByRole("link", { name: /Play vs AI/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Play 1v1/i })).toBeVisible();
    await expect(page.getByTestId("nav-deck")).toContainText(/Deck/i);
  });

  test("deck /deck renders 8 slots", async ({ page }) => {
    await page.goto(`${BASE}/deck`);
    await expect(page).toHaveTitle(/CR Clone/);
    const slots = page.locator('[data-testid="card-slot"]');
    await expect(slots).toHaveCount(8);
    for (let i = 0; i < 8; i += 1) {
      await expect(slots.nth(i)).toBeVisible();
    }
  });

  test("lobby /lobby shows player input", async ({ page }) => {
    await page.goto(`${BASE}/lobby`);
    await expect(page).toHaveTitle(/CR Clone/);
    const preferred = page.locator('[data-testid="player-id-input"]');
    if ((await preferred.count()) > 0) {
      await expect(preferred.first()).toBeVisible();
    } else {
      // Fallback contract: any visible text input on the lobby page.
      const fallback = page.locator(
        'input[type="text"], input:not([type]), input[placeholder*="player" i], input[name*="player" i]',
      );
      await expect(fallback.first()).toBeVisible();
    }
  });
});
