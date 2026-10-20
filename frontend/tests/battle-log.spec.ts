/**
 * frontend/tests/battle-log.spec.ts — the Battle Log panel in the top bar.
 *
 * The panel lists the player's finished battles (result banner, crown score,
 * both decks, trophy delta, mode). The entry is written server-side when the
 * match result is reported.
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

test("the top bar opens a battle log with the finished battle", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );

  // Play a match and forfeit it, so the result is reported to the server.
  await page.goto(`${BASE}/battle`);
  await expect(page.getByTestId("battle-join")).toBeVisible({ timeout: 20000 });
  await page.getByTestId("battle-join").click();
  await expect(page.getByTestId("battle-forfeit")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("battle-forfeit").click();
  await page.getByTestId("forfeit-confirm-yes").click();
  await expect(page.getByTestId("battle-result")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);

  // The battle log lives in the top bar.
  await page.goto(`${BASE}/`);
  const button = page.getByTestId("topbar-battle-log");
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();
  await expect(page.getByTestId("battle-log")).toBeVisible();

  const entries = page.getByTestId("battle-log-entry");
  await expect(entries).toHaveCount(1, { timeout: 15000 });
  await expect(entries.first()).toContainText(/VICTORY|DEFEAT|DRAW/);
  // The played deck is shown as card tiles.
  await expect(entries.first().locator(".card-art").first()).toBeVisible();
  await page.getByTestId("battle-log-close").click();
  await expect(page.getByTestId("battle-log")).toHaveCount(0);
});
