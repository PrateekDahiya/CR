/**
 * scripts/capture-invisible-ghost-shot.ts — screenshot a Phase 19 battle: the
 * Royal Ghost is deployed in a live match (it deploys hidden and shows itself
 * when it attacks).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "..", "docs", "screenshots");
const DECK = [
  "royal-ghost",
  "knight",
  "archers",
  "giant",
  "skeletons",
  "musketeer",
  "fireball",
  "arrows",
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const pid = `shot-ghost-${Date.now().toString(36)}`;
  await page.addInitScript(
    ({ deck, id }: { deck: string[]; id: string }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-name", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, id: pid },
  );

  await page.goto(`${BASE}/battle`);
  await page.getByTestId("battle-join").click();
  await page.waitForTimeout(7000);

  // Deploy the ghost in the middle of the own half. The opening hand is
  // shuffled, so play a few cards until the ghost shows up and is affordable.
  const canvas = page.getByTestId("arena-canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("no arena canvas");
  let deployed = false;
  for (let attempt = 0; attempt < 14 && !deployed; attempt += 1) {
    const ghost = page.locator('[data-testid="card-art-royal-ghost"]');
    if ((await ghost.count()) > 0) {
      await ghost.first().click({ force: true });
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.72);
      await page.waitForTimeout(900);
      const notice = page.getByTestId("battle-error");
      deployed = (await notice.count()) === 0;
      if (deployed) break;
    }
    // Cycle the hand: play the first affordable card near the own half.
    const hand = page.locator('[data-testid^="card-hand-cost-"]');
    const costs = await hand.count();
    for (let i = 0; i < costs; i += 1) {
      const el = hand.nth(i);
      if ((await el.getAttribute("class"))?.includes("border-rose-200")) continue;
      await page.locator(`[data-testid="card-hand-${i}"]`).click({ force: true });
      await page.waitForTimeout(150);
      await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.72);
      await page.waitForTimeout(1200);
      break;
    }
  }
  console.log(`ghost deployed: ${deployed}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, "phase19-battle.png") });
  console.log("screenshot written");

  console.log(`page errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
