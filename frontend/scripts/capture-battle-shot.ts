/**
 * scripts/capture-battle-shot.ts — Playwright screenshot capture for the arena
 * (tower art, mode badge, elixir bar).
 *
 * Run from frontend/: npx tsx scripts/capture-battle-shot.ts
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
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });

  const pid = `shot-towers-${Date.now().toString(36)}`;
  await page.addInitScript(
    ({ deck, id }: { deck: string[]; id: string }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, id: pid },
  );
  await page.goto(`${BASE}/`);
  await page.getByTestId("home-vs-ai").click();
  await page.waitForURL(/battle\?matchId=/, { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, "battle-tower-art.png") });

  const elixir = await page.getByTestId("elixir-count").textContent();
  console.log(`elixir=${elixir}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  console.log(`failed requests: ${failed.length}`);
  for (const f of failed) console.log(`  REQ ${f}`);
  await browser.close();
}

void main();
