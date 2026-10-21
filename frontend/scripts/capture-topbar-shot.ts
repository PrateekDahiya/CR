/**
 * scripts/capture-topbar-shot.ts — screenshot the top bar (battle log button,
 * coin/gem icons) so the chrome can be reviewed.
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
    window.localStorage.setItem("cr-player-id", "shot-topbar");
    window.localStorage.setItem("cr-name", "shot-topbar");
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const bar = page.getByTestId("topbar");
  await bar.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(800);
  await bar.screenshot({ path: resolve(OUT, "topbar-chrome.png") });
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
