/**
 * scripts/capture-battlelog-shot.ts — play a quick match, then screenshot the
 * Battle Log panel opened from the top bar.
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
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  const pid = `shot-log-${Date.now().toString(36)}`;
  await page.addInitScript(
    ({ deck, id }: { deck: string[]; id: string }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, id: pid },
  );

  // Play one match to the end (forfeit -> the result screen reports it).
  await page.goto(`${BASE}/battle`);
  await page.getByTestId("battle-join").click();
  await page.waitForTimeout(4000);
  await page.getByTestId("battle-forfeit").click();
  await page.getByTestId("forfeit-confirm-yes").click();
  await page.waitForSelector('[data-testid="battle-result"]', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Open the battle log from the top bar.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const button = page.getByTestId("topbar-battle-log");
  await button.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(800);
  await button.click();
  await page.waitForSelector('[data-testid="battle-log"]', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, "battle-log-panel.png") });

  const entries = await page.getByTestId("battle-log-entry").count();
  console.log(`battle log entries: ${entries}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
