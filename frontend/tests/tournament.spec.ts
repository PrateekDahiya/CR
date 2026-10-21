/**
 * frontend/tests/tournament.spec.ts — the TOURNAMENTS tab of the battle log.
 *
 * Two players meet in a tournament: the first one creates it, the second one
 * joins it, and when both press "Play" the server pairs them into a real
 * authoritative match. The finished match lands in the tournament tab of the
 * battle log.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";
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

function uniqueId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 16);
}

/** A second signed-in player in its own browser context. */
async function secondPlayer(browser: import("@playwright/test").Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  const id = uniqueId("t2");
  await context.addInitScript(
    ({ pid, deck }: { pid: string; deck: string[] }) => {
      window.localStorage.setItem("cr-player-id", pid);
      window.localStorage.setItem("cr-name", pid);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { pid: id, deck: DECK },
  );
  return context;
}

async function openTournamentsTab(page: Page): Promise<void> {
  await page.goto(`${BASE}/`);
  await page.getByTestId("topbar-menu").click();
  await page.getByTestId("topbar-battle-log").click();
  await expect(page.getByTestId("battle-log")).toBeVisible();
  await page.getByTestId("battle-log-tab-tournaments").click();
  await expect(page.getByTestId("battle-log-tournaments")).toBeVisible();
}

test("a tournament can be created, joined and played", async ({ page, browser }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );

  // Player 1 creates the tournament.
  await openTournamentsTab(page);
  await page.getByTestId("battle-log-tournament-name").fill("E2E Cup");
  await page.getByTestId("battle-log-tournament-create").click();
  const tournament = page.getByTestId("battle-log-tournament").first();
  await expect(tournament).toBeVisible({ timeout: 15000 });
  await expect(tournament).toContainText("E2E Cup");
  // The creator is in the roster, so the button is PLAY (not JOIN).
  await expect(page.getByTestId("battle-log-tournament-play").first()).toBeVisible();

  // Player 2 joins it.
  const context2 = await secondPlayer(browser);
  const page2 = await context2.newPage();
  await openTournamentsTab(page2);
  const list = page2.getByTestId("battle-log-tournament").first();
  await expect(list).toBeVisible({ timeout: 15000 });
  await page2.getByTestId("battle-log-tournament-join").first().click();
  await expect(page2.getByTestId("battle-log-tournament-play").first()).toBeVisible({ timeout: 15000 });

  // Both press Play -> the server pairs them into a real match.
  await page.getByTestId("battle-log-tournament-play").first().click();
  await page.getByTestId("battle-log-tournament-play").first().click();
  await page2.getByTestId("battle-log-tournament-play").first().click();

  await expect(page).toHaveURL(/\/battle\?matchId=/, { timeout: 30000 });
  await expect(page2).toHaveURL(/\/battle\?matchId=/, { timeout: 30000 });

  // The match runs: both players see the battle screen.
  await expect(page.getByTestId("battle-forfeit")).toBeVisible({ timeout: 30000 });

  // Finish it -> the result lands in the TOURNAMENTS tab of the battle log.
  await page.getByTestId("battle-forfeit").click();
  await page.getByTestId("forfeit-confirm-yes").click();
  await expect(page.getByTestId("battle-result")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2000);

  await openTournamentsTab(page);
  const entries = page.getByTestId("battle-log-entry");
  await expect(entries.first()).toBeVisible({ timeout: 20000 });
  await expect(entries.first()).toContainText("E2E Cup");

  await context2.close();
});
