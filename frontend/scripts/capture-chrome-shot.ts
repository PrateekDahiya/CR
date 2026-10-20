/**
 * scripts/capture-chrome-shot.ts — screenshots of the pages that show the
 * top bar / coin / gem chrome (home, shop, leaderboard, collection).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "..", "docs", "screenshots");
const PAGES = [
  ["home", "/"],
  ["shop", "/shop"],
  ["leaderboard", "/leaderboard"],
  ["collection", "/collection"],
  ["decks", "/decks"],
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.localStorage.setItem("cr-player-id", "shot-chrome");
    window.localStorage.setItem("cr-name", "shot-chrome");
  });
  for (const [name, route] of PAGES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(OUT, `chrome-${name}.png`) });
    console.log(`captured ${name}`);
  }
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
