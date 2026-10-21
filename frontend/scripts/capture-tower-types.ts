/**
 * scripts/capture-tower-types.ts — screenshot the arena once per crown-tower
 * troop so every side-tower art variant can be reviewed.
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
const TOWERS = ["tower-princess", "cannoneer", "dagger-duchess", "royal-chef"];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors: string[] = [];

  for (const tower of TOWERS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[${tower}] ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`[${tower}] ${String(e)}`));
    await page.addInitScript(
      ({ deck, t }: { deck: string[]; t: string }) => {
        window.localStorage.setItem("cr-player-id", `shot-tower-${t}`);
        window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
        window.localStorage.setItem("cr-clone-tower-v1", t);
      },
      { deck: DECK, t: tower },
    );
    await page.goto(`${BASE}/battle`);
    await page.getByTestId("battle-join").click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: resolve(OUT, `tower-type-${tower}.png`) });
    console.log(`captured ${tower}`);
    await ctx.close();
  }

  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
