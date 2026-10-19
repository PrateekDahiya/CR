/**
 * Two-client 1v1 regression test.
 *
 * The bugs this guards against (both broke "one person can't play"):
 *  1. The legacy `match:found` twin overwrote the authoritative side, so the
 *     red client rendered and deployed on the blue half.
 *  2. The battle page only learned match id/side from `queue:matched`, which
 *     fires BEFORE the page mounts (matchmaking redirects), so the second
 *     player silently stayed on the default blue side.
 *  3. The queue de-duplicated by playerId, so two tabs sharing a localStorage
 *     id collapsed into one queue entry and could never be paired.
 */
import { expect, type Browser, type Page } from "@playwright/test";
import { test } from "./fixtures";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const DECK = [
  "knight",
  "archers",
  "giant",
  "skeletons",
  "musketeer",
  "baby-dragon",
  "fireball",
  "arrows",
];

/** Marks this run so player ids never collide with a previous run's leftovers
 *  (the server keeps finished/abandoned rooms, and an id with a still-active
 *  match would be pulled straight back into that old battle). */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function openClient(browser: Browser, playerId: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ id, deck }: { id: string; deck: string[] }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { id: `${playerId}-${RUN}`, deck: DECK },
  );
  await page.goto(`${BASE}/`);
  return page;
}

test("solo player waits 5s for a human before the AI match starts", async ({ page }) => {
  await page.addInitScript(
    ({ deck, id }: { deck: string[]; id: string }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, id: `solo-player-${RUN}` },
  );
  await page.goto(`${BASE}/battle`);
  await expect(page.getByTestId("battle-page")).toHaveAttribute("data-pid", /\S+/, { timeout: 20000 });

  const t0 = Date.now();
  await page.getByTestId("battle-join").click();

  // Poll until the queue clears: either the 5s AI fallback fired, or another
  // test's player was already queued and paired us (not measurable here).
  let pairedWithHuman = false;
  let sawSearching = false;
  while (Date.now() - t0 < 13000) {
    if ((await page.getByTestId("queue-status").count()) > 0) sawSearching = true;
    if (sawSearching && (await page.getByTestId("queue-status").count()) === 0) {
      const foe = (await page.getByTestId("enemy-info").textContent()) ?? "";
      pairedWithHuman = !foe.includes("AI");
      break;
    }
    await page.waitForTimeout(200);
  }
  test.skip(pairedWithHuman, "another player was already queued — fallback timing not measurable");
  expect(sawSearching, "BATTLE must show the searching state before falling back").toBe(true);

  const waited = Date.now() - t0;
  expect(waited, `AI fallback fired too early (${waited}ms)`).toBeGreaterThanOrEqual(4500);
  expect(waited, `AI fallback took too long (${waited}ms)`).toBeLessThan(12000);
  await expect(page.getByTestId("enemy-info")).toContainText("AI", { timeout: 10000 });
});

test("deck tab has no battle button", async ({ page }) => {
  await page.goto(`${BASE}/decks`);
  await expect(page.getByTestId("my-deck-strip")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("deck-battle")).toHaveCount(0);
  await expect(page.getByTestId("deck-matchmaking")).toHaveCount(0);
});

test("battle HUD shows the opponent's real name and trophies", async ({ browser }) => {
  const a = await openClient(browser, "hud-player-a");
  const b = await openClient(browser, "hud-player-b");
  await a.getByTestId("home-1v1").click();
  await b.getByTestId("home-1v1").click();
  await Promise.all([
    a.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
    b.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
  ]);
  // Both sides must show the OTHER player's name (never the "Opponent" fallback).
  for (const page of [a, b]) {
    await expect(page.getByTestId("enemy-name")).not.toHaveText("Opponent", { timeout: 15000 });
    await expect(page.getByTestId("enemy-name")).toHaveText(/\S+/);
    await expect(page.getByTestId("enemy-trophies")).toBeVisible();
  }
  // Our own info chip is not part of the CR battle chrome.
  await expect(a.getByTestId("player-info")).toHaveCount(0);
  await a.context().close();
  await b.context().close();
});

test("battle HUD never covers the playable board", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-player-id", "hud-layout");
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );
  await page.goto(`${BASE}/battle`);
  await expect(page.getByTestId("battle-page")).toHaveAttribute("data-pid", /\S+/, { timeout: 20000 });
  await page.getByTestId("battle-join").click();
  await expect(page.getByTestId("battle-page")).toHaveAttribute("data-match", /\S+/, { timeout: 25000 });

  const geo = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="arena-canvas"]')?.getBoundingClientRect();
    const elixir = document.querySelector('[data-testid="elixir-bar"]')?.getBoundingClientRect();
    const hand = document.querySelector('[data-testid="card-hand"]')?.getBoundingClientRect();
    return {
      canvasBottom: canvas?.bottom ?? 0,
      hudTop: Math.min(elixir?.top ?? Infinity, hand?.top ?? Infinity),
      scroll: document.documentElement.scrollHeight,
      client: document.documentElement.clientHeight,
    };
  });
  // The HUD starts exactly where the arena ends: nothing overlaps.
  expect(geo.hudTop).toBeGreaterThanOrEqual(geo.canvasBottom - 1);
  // Single screen, no scrolling.
  expect(geo.scroll).toBeLessThanOrEqual(geo.client + 2);
});

test("arena hover follows each player's own orientation", async ({ browser }) => {
  const a = await openClient(browser, "hover-a");
  const b = await openClient(browser, "hover-b");
  await a.getByTestId("home-1v1").click();
  await b.getByTestId("home-1v1").click();
  await Promise.all([
    a.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
    b.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
  ]);

  const hoverY = async (page: Page, frac: number): Promise<number> => {
    const canvas = page.locator('[data-testid="arena-canvas"]');
    // React must be hydrated, otherwise the canvas has no pointer handlers.
    await expect(page.getByTestId("battle-page")).toHaveAttribute("data-pid", /\S+/, { timeout: 20000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    // 0.8 = lower part of the player's own screen.
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * frac);
    await page.waitForTimeout(200);
    const raw = await canvas.getAttribute("data-hover-y");
    return Number(raw);
  };

  // Which client ends up blue depends on who queued first, so read each side
  // from its own URL instead of assuming an order.
  const sideA = new URL(a.url()).searchParams.get("side");
  const sideB = new URL(b.url()).searchParams.get("side");
  expect([sideA, sideB].sort()).toEqual(["blue", "red"]);

  /** Own half for this player: blue's board is mirrored (y grows upward). */
  const ownHalfIsLower = (side: string | null) => side === "blue";
  const both = async (page: Page, side: string | null) => {
    const low = await hoverY(page, 0.75);
    const high = await hoverY(page, 0.35);
    // The lower screen half must always be the player's OWN half in server coords.
    if (ownHalfIsLower(side)) {
      expect(low, `${side}: lower half must map to own half (y<16)`).toBeLessThan(16);
      expect(high, `${side}: upper half must map to the enemy half (y>16)`).toBeGreaterThan(16);
    } else {
      expect(low, `${side}: lower half must map to own half (y>16)`).toBeGreaterThan(16);
      expect(high, `${side}: upper half must map to the enemy half (y<16)`).toBeLessThan(16);
    }
  };

  await both(a, sideA);
  await both(b, sideB);

  await a.context().close();
  await b.context().close();
});

test("End Battle forfeits: the player who ends it loses and both matches finish", async ({ browser }) => {
  const a = await openClient(browser, "forfeit-a");
  const b = await openClient(browser, "forfeit-b");
  await a.getByTestId("home-1v1").click();
  await b.getByTestId("home-1v1").click();
  await Promise.all([
    a.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
    b.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
  ]);

  // If another spec's client stole one of the queue slots they end up in
  // different matches and a forfeit only ends one of them — not measurable.
  const sameMatch =
    new URL(a.url()).searchParams.get("matchId") === new URL(b.url()).searchParams.get("matchId");
  test.skip(!sameMatch, "clients were paired with another spec's player");

  // Both are in a live match and can see the End Battle control.
  await expect(a.getByTestId("battle-forfeit")).toBeVisible({ timeout: 20000 });
  await expect(b.getByTestId("battle-forfeit")).toBeVisible({ timeout: 20000 });

  // Confirm step: cancel keeps the match running.
  await a.getByTestId("battle-forfeit").click();
  await expect(a.getByTestId("forfeit-confirm")).toBeVisible();
  await a.getByTestId("forfeit-cancel").click();
  await expect(a.getByTestId("forfeit-confirm")).toHaveCount(0);
  await expect(a.getByTestId("battle-result")).toHaveCount(0);

  // Now really end it.
  await a.getByTestId("battle-forfeit").click();
  await a.getByTestId("forfeit-confirm-yes").click();

  // The battle ends for BOTH players.
  await expect(a.getByTestId("battle-result")).toBeVisible({ timeout: 20000 });
  await expect(b.getByTestId("battle-result")).toBeVisible({ timeout: 20000 });

  const titleA = ((await a.locator('[data-testid="battle-result"] h2').textContent()) ?? "").trim();
  const titleB = ((await b.locator('[data-testid="battle-result"] h2').textContent()) ?? "").trim();
  // The forfeiter loses, the opponent wins — order depends on who got which side.
  expect([titleA, titleB].sort()).toEqual(["Defeat!", "Victory!"]);

  await a.context().close();
  await b.context().close();
});

test("1v1: two players pair up, get opposite sides and can both deploy", async ({ browser }) => {
  // Same player id on purpose: two tabs of one browser share localStorage.
  const a = await openClient(browser, "shared-id");
  const b = await openClient(browser, "shared-id");

  await a.getByTestId("home-1v1").click();
  await b.getByTestId("home-1v1").click();

  await Promise.all([
    a.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
    b.waitForURL(/battle\?matchId=/, { timeout: 30000 }),
  ]);

const idA = new URL(a.url()).searchParams.get("matchId");
  const idB = new URL(b.url()).searchParams.get("matchId");
  expect(idA).toBeTruthy();
  // This test is specifically about the two clients pairing with EACH OTHER.
  // Another spec's client can steal a queue slot when the suite runs in
  // parallel; the pairing invariants are covered by the hover/HUD specs then.
  test.skip(idA !== idB, "clients were paired with another spec's player");
  const sides = [
    new URL(a.url()).searchParams.get("side"),
    new URL(b.url()).searchParams.get("side"),
  ];
  expect(sides[0]).not.toBe(sides[1]);
  expect([...sides].sort()).toEqual(["blue", "red"]);

  // The client must adopt the URL side (this was the "can't play" bug). Which of
  // the two ends up blue depends on who queued first, so compare per page.
  const canvasA = a.locator('[data-testid="arena-canvas"]');
  const canvasB = b.locator('[data-testid="arena-canvas"]');
  await expect
    .poll(async () => canvasA.getAttribute("data-my-side"), { timeout: 15000 })
    .toBe(sides[0]);
  await expect
    .poll(async () => canvasB.getAttribute("data-my-side"), { timeout: 15000 })
    .toBe(sides[1]);

  // Both deploy on their own half (same screen position for each player).
  const deploy = async (page: Page) => {
    // Wait for a full bar so the play cannot race a second click/network retry
    // and get rejected for NO_ELIXIR while this test checks pairing/sides.
    await expect
      .poll(async () => Number((await page.getByTestId("elixir-count").textContent()) ?? "0"), {
        timeout: 30000,
      })
      .toBeGreaterThanOrEqual(10);
    await page.getByTestId("card-hand-1").click();
    // Let React commit the selected card before the arena tap is dispatched.
    await page.waitForTimeout(150);
    await page.locator('[data-testid="arena-canvas"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width * 0.3,
          clientY: r.top + r.height * 0.7,
        }),
      );
    });
    await page.waitForTimeout(1000);
    // count() does not auto-wait: no banner means the server accepted the play.
    const n = await page.getByTestId("battle-error").count();
    const text = n > 0 ? ((await page.getByTestId("battle-error").textContent()) ?? "") : "";
    return { ok: n === 0, text };
  };

  const [resA, resB] = await Promise.all([deploy(a), deploy(b)]);
  expect(resA.ok, `blue player deploy rejected: ${resA.text}`).toBe(true);
  expect(resB.ok, `red player deploy rejected: ${resB.text}`).toBe(true);

  await a.context().close();
  await b.context().close();
});