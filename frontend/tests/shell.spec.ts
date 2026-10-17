/**
 * frontend/tests/shell.spec.ts — Playwright smoke tests (Phase 11 exact-UI).
 * Chromium only, headless. Run: npx playwright test --project=chromium
 * (see frontend/tests/README.md).
 *
 * Coverage (MEMORY#18/#23):
 *  - "/"        : CR Clone title, top bar + 5-tab bottom nav, Battle button
 *  - "/decks"   : new exact-CR Decks tab with deck grid + tabs (6/7/8/9/10)
 *  - "/collection" : 12+ cards from /content/catalog with rarity/cost filters
 *  - "/deck"    : legacy Deck Builder kept for /deck link from /decks
 *  - "/lobby"   : player-id input still visible
 *  - "/shop"    : Daily Deals + Trader
 *  - "/social"  : Leaderboard + Clan tabs
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test.describe("CR Clone shell (chromium, Phase 11 exact-UI)", () => {
  test("home / has top bar + 6-tab bottom nav + Battle button", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page).toHaveTitle(/CR Clone/);
    await expect(page.getByTestId("home-root")).toBeVisible();
    await expect(page.getByTestId("home-battle")).toBeVisible();
    await expect(page.getByTestId("topbar")).toBeVisible();
    await expect(page.getByTestId("topbar-cards")).toBeVisible();
    await expect(page.getByTestId("topbar-coins")).toBeVisible();
    await expect(page.getByTestId("topbar-gems")).toBeVisible();
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
    for (const t of ["cards", "collection", "battle", "shop", "social", "ranked"]) {
      await expect(page.getByTestId(`nav-tab-${t}`)).toBeVisible();
    }
    await expect(page.getByTestId("home-playing-deck")).toBeVisible();
    // BATTLE button opens the matchmaking loader.
    await page.getByTestId("home-battle").click();
    await expect(page.getByTestId("matchmaking-loader")).toBeVisible();
  });

  test("decks /decks has tabs 6/7/8/9/10 + grid + card-info overlay", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.getByTestId("deck-tabs")).toBeVisible();
    for (const n of [6, 7, 8, 9, 10]) {
      await expect(page.getByTestId(`deck-tab-${n}`)).toBeVisible();
    }
    await expect(page.getByTestId("deck-grid")).toBeVisible();
    const firstCard = page.locator('[data-testid^="deck-card-"]').first();
    await expect(firstCard).toBeVisible();
    // Card click opens the info overlay.
    await firstCard.click();
    await expect(page.getByTestId("card-info-overlay")).toBeVisible();
    await expect(page.getByTestId("card-info-name")).toBeVisible();
    await expect(page.getByTestId("card-info-rarity")).toBeVisible();
    await expect(page.getByTestId("card-info-type")).toBeVisible();
    // Close via the X button.
    await page.getByTestId("card-info-close").click();
    await expect(page.getByTestId("card-info-overlay")).toHaveCount(0);
  });

  test("deck /deck still has 8 card slots (legacy)", async ({ page }) => {
    await page.goto(`${BASE}/deck`);
    const slots = page.locator('[data-testid="card-slot"]');
    await expect(slots).toHaveCount(8);
  });

  test("collection /collection lists cards with filters", async ({ page }) => {
    await page.goto(`${BASE}/collection`);
    await expect(page.getByTestId("collection-grid")).toBeVisible({ timeout: 15000 });
    // Wait for catalog to load (Found: 108/N badge in the header).
    await expect(page.getByText(/Found:\s*108/)).toBeVisible({ timeout: 15000 });
    const count = await page.locator('[data-testid^="collection-card-"]').count();
    expect(count).toBeGreaterThanOrEqual(100);
    await expect(page.getByTestId("filter-rarity-rare")).toBeVisible();
    await expect(page.getByTestId("filter-cost-3")).toBeVisible();
    // Real card art: every <img> with /cards/ prefix should load (no broken state).
    const imgs = page.locator('.card-art img[src^="/cards/"]');
    const total = await imgs.count();
    const loaded = await imgs.evaluateAll((els: HTMLImageElement[]) =>
      els.filter((el) => el.naturalWidth > 0).length,
    );
    expect(total).toBeGreaterThanOrEqual(100);
    expect(loaded).toBe(total);
  });

  test("shop /shop has Daily Deals + Trader", async ({ page }) => {
    await page.goto(`${BASE}/shop`);
    await expect(page.getByTestId("shop-deals")).toBeVisible();
    await expect(page.getByTestId("shop-trader")).toBeVisible();
  });

  test("social /social has Leaderboard + Clan tabs", async ({ page }) => {
    await page.goto(`${BASE}/social`);
    await expect(page.getByTestId("social-tabs")).toBeVisible();
    await expect(page.getByTestId("social-leaderboard")).toBeVisible();
    await page.getByTestId("social-tab-clan").click();
    await expect(page.getByTestId("social-clan")).toBeVisible();
  });

  test("lobby /lobby still has player input", async ({ page }) => {
    await page.goto(`${BASE}/lobby`);
    const preferred = page.locator('[data-testid="player-id-input"]');
    if ((await preferred.count()) > 0) {
      await expect(preferred.first()).toBeVisible();
    } else {
      const fallback = page.locator('input[type="text"], input:not([type])');
      await expect(fallback.first()).toBeVisible();
    }
  });
});
