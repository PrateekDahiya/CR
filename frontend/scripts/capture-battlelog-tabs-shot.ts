/**
 * scripts/capture-battlelog-tabs-shot.ts — screenshot the polished Battle Log:
 * the BATTLES tab (result banner, both decks, Practice/Watch), the
 * TOURNAMENTS tab and the WATCH replay viewer.
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
      window.localStorage.setItem("cr-name", id);
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    },
    { deck: DECK, id: pid },
  );

  // Play one match so the log has an entry and the server keeps a replay.
  await page.goto(`${BASE}/battle`);
  await page.getByTestId("battle-join").click();
  await page.waitForTimeout(6000);
  await page.getByTestId("battle-forfeit").click();
  await page.getByTestId("forfeit-confirm-yes").click();
  await page.waitForSelector('[data-testid="battle-result"]', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // A tournament to show in the TOURNAMENTS tab.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("topbar-menu").waitFor({ state: "visible", timeout: 20000 });
  // The menu can lose the first click while the page hydrates -> retry.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByTestId("topbar-menu").click();
    const visible = await page
      .getByTestId("topbar-battle-log")
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (visible) break;
    console.log(`menu open attempt ${attempt + 1} failed (url ${page.url()})`);
  }
  await page.getByTestId("topbar-battle-log").click();
  await page.waitForSelector('[data-testid="battle-log"]', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, "battle-log-battles-tab.png") });
  console.log(`battle log entries: ${await page.getByTestId("battle-log-entry").count()}`);

  // Tournaments tab (create one so the tab is not empty).
  await page.getByTestId("battle-log-tab-tournaments").click();
  await page.getByTestId("battle-log-tournament-name").fill("Screenshot Cup");
  await page.getByTestId("battle-log-tournament-create").click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, "battle-log-tournaments-tab.png") });

  // Back to the battles tab -> the WATCH button opens the replay viewer.
  await page.getByTestId("battle-log-tab-battles").click();
  await page.waitForTimeout(600);
  const watch = page.getByTestId("battle-log-watch").first();
  if ((await watch.count()) > 0 && (await watch.isEnabled())) {
    await watch.click();
    await page.waitForSelector('[data-testid="replay-page"]', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT, "battle-log-watch-replay.png") });
  } else {
    console.log("watch button unavailable (no replay frames)");
  }

  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR ${e}`);
  await browser.close();
}

void main();
