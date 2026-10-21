/**
 * scripts/capture-mode-shots.ts — Playwright screenshot capture for the
 * game-mode picker and an Infinite Elixir match.
 *
 * Run from frontend/: npx tsx ../../scripts/capture-mode-shots.ts
 * (or: npx playwright test --project=chromium tests/... as the same flow)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "..", "docs", "screenshots");
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

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  const failed: string[] = [];
  page.on("requestfailed", (req) => failed.push(`${req.url()} ${req.failure()?.errorText ?? ""}`));
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });

  const pid = `shot-modes-${Date.now().toString(36)}`;
  await page.addInitScript(
    ({ deck, id }: { deck: string[]; id: string }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, id: pid },
  );

  await page.goto(`${BASE}/`);
  await page.getByTestId("home-modes-toggle").click();
  await page.getByTestId("home-mode-infinite-elixir").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, "game-modes-picker.png") });

  await page.getByTestId("home-vs-ai").click();
  await page.waitForURL(/battle\?matchId=/, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: resolve(OUT, "game-mode-infinite-elixir-match.png") });

  const elixir = await page.getByTestId("elixir-count").textContent();
  const badge = await page.getByTestId("battle-mode-badge").textContent();
  console.log(`elixir=${elixir} badge=${badge}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  console.log(`failed requests: ${failed.length}`);
  for (const f of failed) console.log(`  REQ ${f}`);

  await browser.close();
}

void main();
