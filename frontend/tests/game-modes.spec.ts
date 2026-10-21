/**
 * frontend/tests/game-modes.spec.ts — game-mode picker + mode-aware match.
 *
 * The mode registry is served by the backend (GET /game-modes), so the picker
 * renders whatever the server knows. A picked mode must travel
 * home -> socket payload -> room -> engine -> snapshot.
 */
import { expect, type Page } from "@playwright/test";
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

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function openHome(page: Page, id: string): Promise<void> {
  await page.addInitScript(
    ({ deck, pid }: { deck: string[]; pid: string }) => {
      window.localStorage.setItem("cr-player-id", pid);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, pid: id },
  );
  await page.goto(`${BASE}/`);
  await expect(page.getByTestId("home-root")).toBeVisible({ timeout: 20000 });
}

test("the home screen shows a mode picker built from the server registry", async ({ page }) => {
  await openHome(page, `modes-picker-${RUN}`);
  await page.getByTestId("home-modes-toggle").click();
  await expect(page.getByTestId("home-modes-grid")).toBeVisible();
  // Registry-driven tiles: one per registered mode.
  await expect(page.getByTestId("home-mode-standard")).toBeVisible();
  await expect(page.getByTestId("home-mode-infinite-elixir")).toBeVisible();
  await expect(page.getByTestId("home-mode-takedown")).toBeVisible();
  // Exactly one mode is selected at a time.
  await expect(page.getByTestId("home-mode-standard")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("home-mode-infinite-elixir").click();
  await expect(page.getByTestId("home-mode-infinite-elixir")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("home-mode-standard")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("home-selected-mode")).toContainText("Infinite Elixir");
});

test("an Infinite Elixir match runs with 8x regen and the mode in the snapshot", async ({ page }) => {
  await openHome(page, `modes-match-${RUN}`);
  await page.getByTestId("home-modes-toggle").click();
  await page.getByTestId("home-mode-infinite-elixir").click();
  await page.getByTestId("home-vs-ai").click();
  await page.waitForURL(/battle\?matchId=/, { timeout: 30000 });
  expect(page.url()).toContain("modeId=infinite-elixir");

  // The server snapshot carries the resolved mode rules.
  await expect(page.getByTestId("battle-mode-badge")).toHaveText(/Infinite Elixir/i, { timeout: 20000 });
  await expect(page.getByTestId("double-elixir-badge")).toContainText("8x", { timeout: 20000 });

  // 8x regen: the bar is capped at 10 within ~1s of match start
  // (standard rate would need ~28s from 5, ~14s from 8).
  await expect(page.getByTestId("elixir-count")).toHaveText("10", { timeout: 10000 });
});
