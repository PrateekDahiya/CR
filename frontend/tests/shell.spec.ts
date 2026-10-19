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
import { test, expect } from "./fixtures";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test.describe("CR Clone shell (chromium, Phase 11 exact-UI)", () => {
  test("home / has top bar + 5-tab bottom nav + Battle button", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page).toHaveTitle(/CR Clone/);
    await expect(page.getByTestId("home-root")).toBeVisible();
    await expect(page.getByTestId("home-battle")).toBeVisible();
    await expect(page.getByTestId("topbar")).toBeVisible();
    await expect(page.getByTestId("topbar-cards")).toBeVisible();
    await expect(page.getByTestId("topbar-coins")).toBeVisible();
    await expect(page.getByTestId("topbar-gems")).toBeVisible();
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
    for (const t of ["shop", "cards", "battle", "social", "ranked"]) {
      await expect(page.getByTestId(`nav-tab-${t}`)).toBeVisible();
    }
    await expect(page.getByTestId("home-deck-stack")).toBeVisible();
    // BATTLE button opens the matchmaking loader.
    await page.getByTestId("home-battle").click();
    await expect(page.getByTestId("matchmaking-loader")).toBeVisible();
  });

  test("bottom-nav Battle tab opens the home page (not /battle)", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page).toHaveURL(/\/decks$/);
    await page.getByTestId("nav-tab-battle").click();
    await expect(page).toHaveURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/$`));
    await expect(page.getByTestId("home-root")).toBeVisible();
    await expect(page.getByTestId("home-battle")).toBeVisible();
  });

  test("decks /decks has Deck/Collection tabs + grid + card-info overlay", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.getByTestId("deck-tabs")).toBeVisible();
    await expect(page.getByTestId("deck-tab-deck")).toBeVisible();
    await expect(page.getByTestId("deck-tab-collection")).toBeVisible();
    await expect(page.getByTestId("my-deck-strip")).toBeVisible();
    // 8 deck slots render as filled cards once /content/cards loads.
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    const firstCard = page.locator('[data-testid^="deck-card-"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page.getByTestId("card-info-overlay")).toBeVisible();
    await expect(page.getByTestId("card-info-name")).toBeVisible();
    await page.getByTestId("card-info-close").click();
    await expect(page.getByTestId("card-info-overlay")).toHaveCount(0);
    // Switch to Collection tab.
    await page.getByTestId("deck-tab-collection").click();
    await expect(page.getByTestId("collection-list")).toBeVisible();
    const collectionCard = page.locator('[data-testid^="collection-card-"]').first();
    await expect(collectionCard).toBeVisible();
    // Same card component as My Deck: identical CardArt chrome (level bar + elixir drop).
    const deckTile = page.locator('[data-testid^="deck-card-"]').first().locator(".card-art");
    const collectionTile = collectionCard.locator(".card-art");
    await expect(deckTile).toBeVisible();
    await expect(collectionTile).toBeVisible();
    // Same card component + same size as My Deck (rarity tints are the only diff).
    const chrome = (c: string) =>
      c.split(/\s+/).filter((t) => !/border-|from-|to-/.test(t)).join(" ");
    expect(chrome(await collectionTile.evaluate((el) => el.className))).toBe(
      chrome(await deckTile.evaluate((el) => el.className)),
    );
    await expect(collectionTile.locator('[data-testid="card-level"]')).toBeVisible();
    // Cost drops render on every non-0-elixir card (same chrome as My Deck).
    await expect
      .poll(
        async () =>
          page
            .locator(
              '[data-testid^="collection-card-"] [data-testid="card-cost"], [data-testid^="locked-card-"] [data-testid="card-cost"]',
            )
            .count(),
        { timeout: 15000 },
      )
      .toBeGreaterThan(100);
  });

  test("decks: Use on a full deck asks which slot to replace", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    await page.getByTestId("deck-tab-collection").click();
    const fresh = page.locator('[data-testid^="collection-card-"]:not([data-in-deck]):not([data-locked])').first();
    await expect(fresh).toBeVisible({ timeout: 15000 });
    const picked = (await fresh.getAttribute("data-testid"))!.replace("collection-card-", "");
    await fresh.click();
    await expect(page.getByTestId("card-info-overlay")).toBeVisible();
    await page.getByTestId("card-info-use").click();
    // Deck is full -> the user must choose the slot to replace.
    await expect(page.getByTestId("replace-picker")).toBeVisible();
    await page.getByTestId("replace-slot-2").click();
    await expect(page.getByTestId("replace-picker")).toHaveCount(0);
    await expect(page.getByTestId("deck-card-2")).toHaveAttribute("aria-label", new RegExp(picked, "i"));
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);
  });

  test("decks: Remove clears a card from My Deck (slot tap + collection tab)", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    // 1) Remove straight from a deck slot.
    await page.getByTestId("deck-card-0").click();
    await page.getByTestId("card-info-remove").click();
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(7);
    await expect(page.getByTestId("deck-empty-slot")).toHaveCount(1);
    // 2) Remove from the Collection tab; the card leaves the deck there too.
    await page.getByTestId("deck-tab-collection").click();
    const owned = page.locator('[data-testid^="collection-card-"][data-in-deck]').first();
    await expect(owned).toBeVisible({ timeout: 15000 });
    const name = (await owned.getAttribute("data-testid"))!.replace("collection-card-", "");
    await owned.click();
    await expect(page.getByTestId("card-info-overlay")).toBeVisible();
    await page.getByTestId("card-info-remove").click();
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(6);
    await expect(page.getByTestId("deck-empty-slot")).toHaveCount(2);
    await expect(page.locator(`[data-testid="collection-card-${name}"]`)).not.toHaveAttribute(
      "data-in-deck",
      "true",
    );
  });

  test("decks: Use fills the first free slot without asking", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    // Free slot 0, then add a card from the collection.
    await page.getByTestId("deck-card-0").click();
    await page.getByTestId("card-info-remove").click();
    await expect(page.getByTestId("deck-empty-slot")).toHaveCount(1);
    await page.getByTestId("deck-tab-collection").click();
    const fresh = page.locator('[data-testid^="collection-card-"]:not([data-in-deck]):not([data-locked])').first();
    const picked = (await fresh.getAttribute("data-testid"))!.replace("collection-card-", "");
    await fresh.click();
    await page.getByTestId("card-info-use").click();
    await expect(page.getByTestId("replace-picker")).toHaveCount(0);
    await expect(page.getByTestId("deck-card-0")).toHaveAttribute("aria-label", new RegExp(picked, "i"));
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);
  });

  test("decks: every edit closes the overlay and shows a toast", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    // A card already in the deck must NOT offer "Use" (only Remove).
    await page.getByTestId("deck-card-0").click();
    await expect(page.getByTestId("card-info-overlay")).toBeVisible();
    await expect(page.getByTestId("card-info-use")).toHaveCount(0);
    await expect(page.getByTestId("card-info-remove")).toBeVisible();
    await page.getByTestId("card-info-remove").click();
    await expect(page.getByTestId("card-info-overlay")).toHaveCount(0);
    await expect(page.getByTestId("deck-toast")).toBeVisible();
    // Now add a fresh card: the deck has a free slot so it lands directly.
    await page.getByTestId("deck-tab-collection").click();
    const fresh = page.locator('[data-testid^="collection-card-"]:not([data-in-deck]):not([data-locked])').first();
    const picked = (await fresh.getAttribute("data-testid"))!.replace("collection-card-", "");
    await fresh.click();
    await page.getByTestId("card-info-use").click();
    await expect(page.getByTestId("card-info-overlay")).toHaveCount(0);
    await expect(page.getByTestId("deck-card-0")).toHaveAttribute("aria-label", new RegExp(picked, "i"));
    // The whole screen is interactive again after the edit.
    await page.getByTestId("deck-tab-collection").click();
    await expect(page.getByTestId("collection-list")).toBeVisible();
  });

  test("decks: locked cards are separated and cannot be used", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    await page.getByTestId("deck-tab-collection").click();
    await expect(page.getByTestId("collection-list")).toBeVisible({ timeout: 15000 });
    // Locked cards remain visible in their own, dimmed section.
    const locked = page.locator('[data-testid^="locked-card-mega-knight"]');
    await expect(locked).toBeVisible();
    await expect(locked).toHaveAttribute("data-locked", "true");
    // Opening a locked card offers no Use action.
    await locked.click();
    await expect(page.getByTestId("card-info-overlay")).toBeVisible();
    await expect(page.getByTestId("card-info-use")).toHaveCount(0);
    await page.getByTestId("card-info-close").click();
  });

  test("collection /collection can add and remove cards in My Deck", async ({ page }) => {
    await page.goto(`${BASE}/collection`);
    await expect(page.getByTestId("collection-grid")).toBeVisible({ timeout: 15000 });
    const fresh = page.locator('[data-testid^="collection-card-"]:not([data-in-deck]):not([data-locked])').first();
    await expect(fresh).toBeVisible();
    const picked = (await fresh.getAttribute("data-testid"))!.replace("collection-card-", "");
    // Deck is full -> the picker appears and the chosen slot is replaced.
    await fresh.click();
    await expect(page.getByTestId("card-info-overlay")).toBeVisible();
    await page.getByTestId("card-info-use").click();
    await expect(page.getByTestId("replace-picker")).toBeVisible();
    await page.getByTestId("replace-slot-0").click();
    await expect(page.getByTestId("deck-toast")).toBeVisible();
    await expect(page.locator(`[data-testid="collection-card-${picked}"][data-in-deck]`)).toBeVisible();
    // Remove it again from the same popup.
    await page.locator(`[data-testid="collection-card-${picked}"]`).click();
    await page.getByTestId("card-info-remove").click();
    await expect(page.getByTestId("card-info-overlay")).toHaveCount(0);
    await expect(page.locator(`[data-testid="collection-card-${picked}"][data-in-deck]`)).toHaveCount(0);
  });

  test("deck /deck redirects to /decks", async ({ page }) => {
    await page.goto(`${BASE}/deck`);
    await expect(page).toHaveURL(/\/decks$/);
    await expect(page.getByTestId("my-deck-strip")).toBeVisible();
  });

  test("collection /collection lists cards with filters", async ({ page }) => {
    await page.goto(`${BASE}/collection`);
    await expect(page.getByTestId("collection-grid")).toBeVisible({ timeout: 15000 });
    // Wait for catalog to load (Found: 108/N badge in the header).
    await expect(page.getByText(/Found:\s*108/)).toBeVisible({ timeout: 15000 });
    const count = await page
      .locator('[data-testid^="collection-card-"], [data-testid^="locked-card-"]')
      .count();
    expect(count).toBeGreaterThanOrEqual(100);
    await expect(page.getByTestId("filter-rarity-rare")).toBeVisible();
    await expect(page.getByTestId("filter-cost-3")).toBeVisible();
    // Collection uses the exact same card component as My Deck (CardTile -> CardArt).
    const tile = page.locator('[data-testid^="collection-card-"]').first();
    await expect(tile.locator(".card-art")).toBeVisible();
    await expect(tile.locator('[data-testid="card-level"]')).toBeVisible();
    // Real card art: the /cards/*.png images decode (no broken art).
    const imgs = page.locator('.card-art img[src^="/cards/"]');
    const total = await imgs.count();
    expect(total).toBeGreaterThanOrEqual(100);
    await expect
      .poll(
        async () =>
          imgs.evaluateAll((els: HTMLImageElement[]) => els.filter((el) => el.naturalWidth > 0).length),
        { timeout: 20000 },
      )
      .toBeGreaterThanOrEqual(Math.floor(total * 0.95));
  });

  test("shop /shop has Daily Deals + Trader", async ({ page }) => {
    await page.goto(`${BASE}/shop`);
    await expect(page.getByTestId("shop-deals")).toBeVisible();
    await expect(page.getByTestId("shop-trader")).toBeVisible();
  });

  test("economy: player name, trophies, coins, gems in the top bar", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.getByTestId("topbar-player")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("topbar-name")).toHaveText(/\S+/);
    await expect(page.getByTestId("topbar-trophies")).toContainText("🏆");
    // Rename through the top bar.
    await page.getByTestId("topbar-player").click();
    await page.getByTestId("topbar-name-input").fill("Arena King");
    await page.getByTestId("topbar-name-save").click();
    await expect(page.getByTestId("topbar-name")).toHaveText("Arena King", { timeout: 15000 });
  });

  test("shop: buying a coin bundle spends gems and adds coins", async ({ page }) => {
    await page.goto(`${BASE}/shop`);
    await expect(page.getByTestId("shop-coins")).toBeVisible({ timeout: 15000 });
    const coinsBefore = Number(((await page.getByTestId("shop-coins").textContent()) ?? "").replace(/[^\d]/g, ""));
    // Starter wallet has 20 gems; the 500-coin bundle costs 5 gems.
    const buy = page.getByTestId("bundle-buy-coins-500");
    await expect(buy).toBeEnabled();
    await buy.click();
    await expect
      .poll(async () => {
        const text = (await page.getByTestId("shop-coins").textContent()) ?? "";
        return Number(text.replace(/[^\d]/g, ""));
      }, { timeout: 15000 })
      .toBeGreaterThan(coinsBefore);
  });

  test("decks: multiple decks, select the deck used for battle", async ({ page }) => {
    await page.goto(`${BASE}/decks`);
    await expect(page.getByTestId("deck-list")).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid^="deck-chip-"]')).toHaveCount(1);
    await page.getByTestId("deck-new").click();
    await expect(page.locator('[data-testid^="deck-chip-"]')).toHaveCount(2, { timeout: 15000 });
    // The newest deck is auto-selected.
    const chips = page.locator('[data-testid^="deck-chip-"]');
    const second = chips.nth(1);
    await expect(second).toContainText("✓");
    // Selecting the first deck moves the check.
    await page.locator('[data-testid^="deck-select-"]').first().click();
    await expect(chips.first()).toContainText("✓", { timeout: 15000 });
  });

  test("player table /leaderboard lists rank, name, trophies and record", async ({ page }) => {
    await page.goto(`${BASE}/leaderboard`);
    await expect(page.getByTestId("player-table")).toBeVisible({ timeout: 15000 });
    const row = page.locator('[data-testid^="leaderboard-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("%");
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
