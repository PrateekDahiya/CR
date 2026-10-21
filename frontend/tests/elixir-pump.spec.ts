/**
 * frontend/tests/elixir-pump.spec.ts — the elixir pump + the "+N" popup.
 *
 * The Elixir Collector is the game's elixir pump: it grants 1 elixir to its
 * owner every 13s. The client must show a "+N" popup for that (it must NOT
 * fire for the passive regen).
 */
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { detectElixirGain } from "../lib/battle/useBattle";

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

test("the gain detector ignores passive regen and reports card gains", () => {
  // 1s of standard regen: 1/2.8 elixir -> no popup.
  expect(
    detectElixirGain({ before: 5, after: 5 + 1 / 2.8, dtMs: 1000, elapsedMs: 10_000 }),
  ).toBe(0);
  // A collector pump (+1 on top of the regen) -> popup.
  expect(
    detectElixirGain({ before: 5, after: 5 + 1 / 2.8 + 1, dtMs: 1000, elapsedMs: 10_000 }),
  ).toBe(1);
  // 8x mode: the regen is 8x faster, still no popup without a card.
  const fast = { id: "infinite-elixir", label: "Infinite Elixir", description: "", elixirRateMultiplier: 8, startElixir: 8, elixirCap: 10 };
  expect(
    detectElixirGain({ before: 8, after: 8 + 8 / 2.8, dtMs: 1000, elapsedMs: 1000, mode: fast }),
  ).toBe(0);
});

test("the elixir bar never shows a +N popup without a card gain", async ({ page }) => {
  await page.addInitScript(
    ({ deck }: { deck: string[] }) => {
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK },
  );
  await page.goto(`${BASE}/battle`);
  await expect(page.getByTestId("battle-join")).toBeVisible({ timeout: 20000 });
  await page.getByTestId("battle-join").click();
  await expect(page.getByTestId("battle-page")).toHaveAttribute("data-match", /\S+/, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("elixir-gain-popup")).toHaveCount(0, { timeout: 6000 });
});
