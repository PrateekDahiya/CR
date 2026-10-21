/**
 * scripts/capture-animation-shots.ts — screenshots of the new card animation
 * sheets (the 4x5 sheets -> the 10 frame strips the engine plays).
 *
 * Run from frontend/: npx tsx scripts/capture-animation-shots.ts
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
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
  "golem",
  "wizard",
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  const pid = `shot-anim-${Date.now().toString(36)}`;
  await page.addInitScript(
    ({ deck, id }: { deck: string[]; id: string }) => {
      window.localStorage.setItem("cr-player-id", id);
      window.localStorage.setItem("cr-name", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, id: pid },
  );

  // 1. the animation lab
  await page.goto(`${BASE}/animations`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(OUT, "animations-cards.png"), fullPage: false });
  // the gallery animates continuously, so clip instead of element screenshots
  const gallery = page.locator('[data-testid="anim-gallery"]');
  const box = await gallery.boundingBox();
  if (box) {
    await page.screenshot({
      path: resolve(OUT, "animations-gallery.png"),
      clip: { x: box.x, y: box.y, width: Math.min(box.width, 1280), height: Math.min(box.height, 880) },
    });
  }

  // 2. a zoom on three cards (read the canvas directly: the lab animates
  //    continuously, so a page screenshot would never settle)
  for (const id of ["knight", "giant", "wizard"]) {
    const canvas = page.locator(`[data-testid="anim-card-${id}"] canvas`);
    if ((await canvas.count()) === 0) continue;
    const data = await canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL("image/png"));
    writeFileSync(resolve(OUT, `animations-${id}.png`), Buffer.from(data.split(",")[1], "base64"));
  }

  // 3. the live battle with the new strips
  await page.goto(`${BASE}/battle`);
  const join = page.getByTestId("battle-join");
  if ((await join.count()) > 0) {
    await join.click();
    await page.waitForTimeout(4000);
    const canvas = page.locator('[data-testid="battle-canvas"], [data-testid="arena-canvas"]');
    // deploy a few cards so the new walk / attack strips are visible
    for (const hand of [0, 1, 2]) {
      const card = page.getByTestId(`card-hand-${hand}`);
      if ((await card.count()) === 0) continue;
      await card.click();
      await canvas.evaluate((el) => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: r.left + r.width * 0.5,
            clientY: r.top + r.height * 0.62,
          }),
        );
      });
      await page.waitForTimeout(1200);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT, "battle-anim-units.png") });
    await canvas.screenshot({ path: resolve(OUT, "battle-anim-canvas.png") });
  }

  console.log(`page errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
