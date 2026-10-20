/**
 * scripts/capture-towers-shot.ts — screenshot the Decks > Towers tab (king art).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "..", "docs", "screenshots");

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
  const pid = `shot-decks-${Date.now().toString(36)}`;
  await page.addInitScript((id: string) => {
    window.localStorage.setItem("cr-player-id", id);
    window.localStorage.setItem("cr-name", id);
  }, pid);
  await page.goto(`${BASE}/decks`);
  await page.getByTestId("deck-tab-towers").click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(OUT, "decks-towers-tab.png") });
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
