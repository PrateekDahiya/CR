/**
 * scripts/capture-topbar-log-shot.ts — open the Battle Log from the top bar
 * and screenshot it, so the sheet and the top-bar chrome can be reviewed.
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
  await page.addInitScript(() => {
    window.localStorage.setItem("cr-player-id", "shot-topbar-log");
    window.localStorage.setItem("cr-name", "shot-topbar-log");
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("topbar").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(600);
  await page.getByTestId("topbar").screenshot({ path: resolve(OUT, "topbar-chrome.png") });
  // The battle log entry lives in the top-bar menu.
  await page.getByTestId("topbar-menu").click();
  await page.getByTestId("topbar-battle-log").click();
  await page.waitForSelector('[data-testid="battle-log"]', { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(OUT, "battle-log-panel.png") });
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
