/**
 * frontend/tests/battle-log.spec.ts — the Battle Log panel in the top bar.
 *
 * The panel has a BATTLES and a TOURNAMENTS tab. Every battle shows the
 * result banner, the crown score, both players and the deck of BOTH sides,
 * plus a PRACTICE and a WATCH button.
 */
import { expect } from "@playwright/test";
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

/** Play a battle, let the replay recorder sample a few frames, then forfeit. */
async function playAndForfeit(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(`${BASE}/battle`);
  await expect(page.getByTestId("battle-join")).toBeVisible({ timeout: 20000 });
  await page.getByTestId("battle-join").click();
  await expect(page.getByTestId("battle-forfeit")).toBeVisible({ timeout: 30000 });
  // ~2 s of battle so the server has replay frames to show.
  await page.waitForTimeout(2000);
  await page.getByTestId("battle-forfeit").click();
  await page.getByTestId("forfeit-confirm-yes").click();
  await expect(page.getByTestId("battle-result")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function openBattleLog(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(`${BASE}/`);
  const menu = page.getByTestId("topbar-menu");
  await expect(menu).toBeVisible({ timeout: 20000 });
  await menu.click();
  const logEntry = page.getByTestId("topbar-battle-log");
  await expect(logEntry).toBeVisible();
  await logEntry.click();
  await expect(page.getByTestId("battle-log")).toBeVisible();
}

test("the top bar opens a battle log with the finished battle", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );

  await playAndForfeit(page);
  await openBattleLog(page);

  const entries = page.getByTestId("battle-log-entry");
  await expect(entries).toHaveCount(1, { timeout: 15000 });
  await expect(entries.first()).toContainText(/VICTORY|DEFEAT|DRAW/);
  // The played deck is shown as card tiles.
  await expect(entries.first().locator(".card-art").first()).toBeVisible();
  await page.getByTestId("battle-log-close").click();
  await expect(page.getByTestId("battle-log")).toHaveCount(0);
});

test("the battle log has a battles and a tournaments tab", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );

  await playAndForfeit(page);
  await openBattleLog(page);

  await expect(page.getByTestId("battle-log-tab-battles")).toBeVisible();
  await expect(page.getByTestId("battle-log-tab-tournaments")).toBeVisible();
  await expect(page.getByTestId("battle-log-entry")).toHaveCount(1, { timeout: 15000 });

  // The tournaments tab is a separate view with the tournament tools.
  await page.getByTestId("battle-log-tab-tournaments").click();
  await expect(page.getByTestId("battle-log-tournaments")).toBeVisible();
  await expect(page.getByTestId("battle-log-tournament-create")).toBeVisible();
  // ... and the battle list is gone while the tab is open.
  await expect(page.getByTestId("battle-log-entry")).toHaveCount(0);

  await page.getByTestId("battle-log-tab-battles").click();
  await expect(page.getByTestId("battle-log-entry")).toHaveCount(1);
});

test("a battle row shows both decks, the score and the practice/watch buttons", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );

  await playAndForfeit(page);
  await openBattleLog(page);

  const entry = page.getByTestId("battle-log-entry").first();
  await expect(entry).toBeVisible({ timeout: 15000 });
  // Result banner + crown score.
  await expect(entry.getByTestId("battle-log-result")).toContainText(/VICTORY|DEFEAT|DRAW/);
  await expect(entry.getByTestId("battle-log-score")).toContainText("-");
  // TWO deck rows: the player's deck and the opponent's deck.
  await expect(entry.getByTestId("battle-log-deck")).toHaveCount(2);
  // Trophy delta + the two action buttons.
  await expect(entry.getByTestId("battle-log-trophy-delta")).toBeVisible();
  await expect(entry.getByTestId("battle-log-practice")).toBeVisible();
  await expect(entry.getByTestId("battle-log-watch")).toBeVisible();
});

test("the practice button starts a practice match against the opponent deck", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );

  await playAndForfeit(page);
  await openBattleLog(page);

  const entry = page.getByTestId("battle-log-entry").first();
  await expect(entry).toBeVisible({ timeout: 15000 });
  await entry.getByTestId("battle-log-practice").click();
  await expect(page).toHaveURL(/\/battle\?foeDeck=/, { timeout: 20000 });
});

test("the watch button opens the replay of the battle", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );

  await playAndForfeit(page);
  await openBattleLog(page);

  const entry = page.getByTestId("battle-log-entry").first();
  await expect(entry).toBeVisible({ timeout: 15000 });
  const watch = entry.getByTestId("battle-log-watch");
  await expect(watch).toBeEnabled();
  await watch.click();
  await expect(page).toHaveURL(/\/replay\?matchId=/, { timeout: 20000 });
  await expect(page.getByTestId("replay-page")).toBeVisible();
  // The replay has frames: the scrubber is usable.
  await expect(page.getByTestId("replay-scrubber")).toBeVisible({ timeout: 20000 });
});
