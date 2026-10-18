/**
 * frontend/tests/battle.spec.ts — Playwright smoke tests for the Phase 5 battle client.
 *
 * Chromium only, headless by default. Run (frontend must be serving):
 *   npx playwright test --project=chromium tests/battle.spec.ts
 * (requires `npx playwright install chromium` once; see tests/README.md)
 *
 * Contract (MEMORY#17 + #18, docs/UI_REFERENCE.md §8):
 *  - `/battle` renders portrait arena canvas + elixir bar + 4-card hand + timer
 *    WITHOUT a backend running (offline idle state shows the gold BATTLE button).
 *  - Tap-to-deploy wiring: tap card → selected glow, tap arena → deploy attempt
 *    (offline: surfaces the "not in a match" notice instead of crashing).
 *  - Screenshots to `docs/screenshots/phase-5-battle-{mobile,desktop}.png`
 *    at 390x844 + 1280x720 for the UI-reference side-by-side check.
 *
 * Dual-contract note (ISS-F5-002, ISS-P5-S1/S2/S3 — merger transition):
 *  assertions accept BOTH fallback and sibling testids so the spec passes
 *  pre/post swap: battle-canvas OR arena-canvas (+ arena-canvas-wrap),
 *  card-hand x4 OR card-hand-0..3, next-card OR card-next,
 *  elixir-pip-filled/empty OR elixir-pip-0..9 (total 10 via ^elixir-pip).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  "http://localhost:3000";

const DECK = [
  "knight",
  "archers",
  "musketeer",
  "baby-dragon",
  "giant",
  "skeletons",
  "fireball",
  "cannon",
];

/** Next.js prerenders the page, so a click can land on dead SSR HTML. Wait for
 *  the client to mount (data-pid is only set in a mount effect) before clicking. */
async function waitHydrated(page: Page): Promise<void> {
  await expect(page.getByTestId("battle-page")).toHaveAttribute("data-pid", /\S+/, { timeout: 20000 });
}

async function seedAndGoto(page: Page, url: string) {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
      window.localStorage.setItem("cr-player-id", "spec-player");
    },
    { deck: DECK },
  );
  await page.goto(url);
}

/** Canvas in either contract: fallback battle-canvas OR sibling arena-canvas. */
function canvasLocator(page: Page): Locator {
  return page.locator('[data-testid="battle-canvas"], [data-testid="arena-canvas"]');
}

/** Canvas wrap OR canvas: battle-canvas OR arena-canvas-wrap (both exist pre/post). */
function canvasOrWrap(page: Page): Locator {
  return page.locator(
    '[data-testid="battle-canvas"], [data-testid="arena-canvas"], [data-testid="arena-canvas-wrap"]',
  );
}

/** Next preview: fallback next-card OR sibling card-next. */
function nextCardLocator(page: Page): Locator {
  return page.locator('[data-testid="next-card"], [data-testid="card-next"]');
}

/** Resolve a hand slot 0..3 in either contract (sibling card-hand-i wins, else fallback card-hand nth). */
async function handSlot(page: Page, i: number): Promise<Locator> {
  const sibling = page.getByTestId(`card-hand-${i}`);
  if ((await sibling.count()) > 0) return sibling;
  return page.getByTestId("card-hand").nth(i);
}

/** Assert 4-card hand in either contract (fallback x4 OR sibling 0..3). */
async function expectFourHands(page: Page): Promise<void> {
  const siblingSlots = page.locator(
    '[data-testid="card-hand-0"], [data-testid="card-hand-1"], [data-testid="card-hand-2"], [data-testid="card-hand-3"]',
  );
  if ((await siblingSlots.count()) === 4) {
    await expect(siblingSlots).toHaveCount(4);
  } else {
    await expect(page.getByTestId("card-hand")).toHaveCount(4);
  }
}

test.describe("CR Clone battle /battle (chromium)", () => {
  test("renders canvas + elixir bar + 4-card hand + timer", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/battle`);
    await expect(page).toHaveTitle(/CR Clone/);
    await expect(page.getByTestId("battle-page")).toBeVisible();
    await expect(canvasLocator(page)).toBeVisible();
    await expect(canvasOrWrap(page).first()).toBeVisible();
    await expect(page.getByTestId("elixir-bar")).toBeVisible();
    await expect(page.getByTestId("battle-timer")).toBeVisible();
    await expectFourHands(page);
    await expect(nextCardLocator(page)).toBeVisible();
    // Offline idle state offers the gold BATTLE entry (Supercell ref).
    await expect(page.getByTestId("battle-join")).toBeVisible();
    // Hand cards use the same shared card component as My Deck / Collection.
    const handArt = await page.locator('[data-testid^="card-hand-"] .card-art').count();
    expect(handArt).toBe(4);
  });

  test("tap-to-deploy: card select then arena tap attempts deploy", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/battle`);
    await expectFourHands(page);

    // Tap the first card → selected glow (fallback data-selected OR sibling aria-pressed).
    const slot0 = await handSlot(page, 0);
    await slot0.click();
    const dataSel = await slot0.getAttribute("data-selected");
    const ariaPressed = await slot0.getAttribute("aria-pressed");
    expect(dataSel === "true" || ariaPressed === "true").toBeTruthy();

    // Tap own half of the arena canvas → offline deploy notice, no crash.
    // NOTE (live 2026-10-17): in idle phase the gold-BATTLE overlay covers the
    // canvas, so hit-tested clicks (page.mouse / force:true) land on the
    // overlay and no tile fires. Dispatch a real bubbling MouseEvent on the
    // canvas itself with own-half coords — React onClick → onTileClick runs
    // exactly as a user tap does in-match; app code untouched.
    // y ≈ 75% height = own (bottom/blue) half per GAME_DESIGN §5.3.
    await canvasLocator(page).evaluate(
      (el, frac) => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: r.left + r.width * frac.x,
            clientY: r.top + r.height * frac.y,
          }),
        );
      },
      { x: 0.5, y: 0.75 },
    );
    await expect(page.getByTestId("battle-error")).toBeVisible();
  });

  test("screenshots 390x844 + 1280x720 to docs/screenshots", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/battle`);
    await expect(canvasLocator(page)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    // NOTE (live 2026-10-17): cwd is frontend/ when vitest/playwright runs,
    // so repo-relative docs/ needs the ../ prefix (was writing to
    // frontend/docs/screenshots/ before this additive fix).
    await page.screenshot({ path: "../docs/screenshots/phase-5-battle-mobile.png" });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: "../docs/screenshots/phase-5-battle-desktop.png" });

    // Checklist guard (UI_REFERENCE §8): portrait arena + timer + pips + hand.
    await expect(page.getByTestId("battle-timer")).toBeVisible();
    await expect(page.getByTestId("elixir-bar")).toBeVisible();
    await expectFourHands(page);
  });

  test("live AI match: bot opponent, player can deploy, no BAD_DECK", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/battle`);
    await expect(page.getByTestId("battle-join")).toBeVisible();
    await waitHydrated(page);

    // Single viewport: the battle screen never scrolls (even before the match).
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      client: document.documentElement.clientHeight,
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 2);

    // Real server-side room: BATTLE searches, then adopts a real match id (queued
    // human immediately, or the AI fallback after 5s).
    await page.getByTestId("battle-join").click();
    await expect(page.getByTestId("battle-page")).toHaveAttribute("data-match", /\S+/, {
      timeout: 25000,
    });
    // Let the first state:update land before deploying.
    await page.waitForTimeout(600);

    // Player deploy: select a card, tap own half -> accepted by the server.
    await page.getByTestId("card-hand-0").click();
    await canvasLocator(page).evaluate((el, frac) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width * frac.x,
          clientY: r.top + r.height * frac.y,
        }),
      );
    }, { x: 0.3, y: 0.8 });
    await page.waitForTimeout(800);
    // count() does not auto-wait: absent notice = clean deploy.
    const errLoc = page.getByTestId("battle-error");
    const notice = (await errLoc.count()) > 0 ? ((await errLoc.textContent()) ?? "") : "";
    expect(notice).not.toContain("Not in a match");
    expect(notice).not.toContain("BAD_DECK");
    expect(notice).not.toContain("unknown card id");
  });

  test("deployed units use the real card art (no dummy emoji only)", async ({ page }) => {
    const artRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/cards/") && url.endsWith(".png")) artRequests.push(url);
    });
    await seedAndGoto(page, `${BASE}/battle`);
    await expect(page.getByTestId("battle-join")).toBeVisible();
    await waitHydrated(page);
    await page.getByTestId("battle-join").click();
    await expect(page.getByTestId("battle-page")).toHaveAttribute("data-match", /\S+/, { timeout: 25000 });

    // Deploy a card and let the bot answer: both sides must request card PNGs
    // for the arena to draw real art instead of placeholder glyphs.
    await page.getByTestId("card-hand-0").click();
    await canvasLocator(page).evaluate((el, frac) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width * frac.x,
          clientY: r.top + r.height * frac.y,
        }),
      );
    }, { x: 0.3, y: 0.8 });

    await expect
      .poll(() => artRequests.length, { timeout: 20000 })
      .toBeGreaterThan(0);
  });

  test("battle-canvas render check with elixir pips count 10", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/battle`);
    // Canvas visible in either contract (battle-canvas OR arena-canvas + wrap).
    await expect(canvasLocator(page)).toBeVisible();
    await expect(canvasOrWrap(page).first()).toBeVisible();
    // Elixir pips: 10 total in either naming scheme (filled/empty OR pip-0..9).
    await expect(page.locator('[data-testid^="elixir-pip"]')).toHaveCount(10);
    await expect(page.getByTestId("elixir-bar")).toBeVisible();
    await expect(page.getByTestId("battle-timer")).toBeVisible();
    await expectFourHands(page);
    await expect(nextCardLocator(page)).toBeVisible();
  });
});
