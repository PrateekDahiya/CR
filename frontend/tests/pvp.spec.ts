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
import { test, expect, type Browser, type Page } from "@playwright/test";

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

async function openClient(browser: Browser, playerId: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ id, deck }: { id: string; deck: string[] }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { id: playerId, deck: DECK },
  );
  await page.goto(`${BASE}/`);
  return page;
}

test("solo player waits 5s for a human before the AI match starts", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-player-id", "solo-player");
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );
  await page.goto(`${BASE}/battle`);

  const t0 = Date.now();
  await page.getByTestId("battle-join").click();

  // Searching state must be visible first (a real 1v1 could still pair up).
  await expect(page.getByTestId("queue-status")).toBeVisible({ timeout: 5000 });

  // Poll until the queue clears: either the 5s AI fallback fired, or another
  // test's player was already queued and paired us (not measurable here).
  let pairedWithHuman = false;
  while (Date.now() - t0 < 12000) {
    if ((await page.getByTestId("queue-status").count()) === 0) {
      const foe = (await page.getByTestId("enemy-info").textContent()) ?? "";
      pairedWithHuman = !foe.includes("AI");
      break;
    }
    await page.waitForTimeout(250);
  }
  test.skip(pairedWithHuman, "another player was already queued — fallback timing not measurable");

  const waited = Date.now() - t0;
  expect(waited, `AI fallback fired too early (${waited}ms)`).toBeGreaterThanOrEqual(4500);
  expect(waited, `AI fallback took too long (${waited}ms)`).toBeLessThan(11000);
  await expect(page.getByTestId("enemy-info")).toContainText("AI", { timeout: 10000 });
});

test("deck tab has no battle button", async ({ page }) => {
  await page.goto(`${BASE}/decks`);
  await expect(page.getByTestId("my-deck-strip")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("deck-battle")).toHaveCount(0);
  await expect(page.getByTestId("deck-matchmaking")).toHaveCount(0);
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
  // One shared match id = they were paired with each other, not two AI games.
  expect(idA).toBe(idB);
  const sides = [
    new URL(a.url()).searchParams.get("side"),
    new URL(b.url()).searchParams.get("side"),
  ].sort();
  expect(sides).toEqual(["blue", "red"]);

  // The client must adopt the URL side (this was the "can't play" bug).
  const canvasA = a.locator('[data-testid="arena-canvas"]');
  const canvasB = b.locator('[data-testid="arena-canvas"]');
  await expect.poll(async () => canvasA.getAttribute("data-my-side"), { timeout: 15000 }).toBe("blue");
  await expect.poll(async () => canvasB.getAttribute("data-my-side"), { timeout: 15000 }).toBe("red");

  // Both deploy on their own half (same screen position for each player).
  const deploy = async (page: Page) => {
    // Wait for enough elixir (slot 1 costs 4) so the play is not rejected.
    await expect
      .poll(async () => Number((await page.getByTestId("elixir-count").textContent()) ?? "0"), {
        timeout: 20000,
      })
      .toBeGreaterThanOrEqual(5);
    await page.getByTestId("card-hand-1").click();
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