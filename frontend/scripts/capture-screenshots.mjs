import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "..", "docs", "screenshots", "card-mechanics");
const BASE = process.env.UI_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:4000";

await mkdir(outDir, { recursive: true });

const username = `shot${Date.now().toString(36)}`.slice(0, 16);
const password = "screenshots123";
const reg = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
const account = await reg.json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(({ playerId }) => {
  localStorage.setItem("cr-player-id", playerId);
  localStorage.setItem("cr-clone-tower-v1", "tower-princess");
}, { playerId: account.playerId });

const page = await context.newPage();

async function shot(name, route, before) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(700);
  if (before) await before();
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  console.log(`captured ${name}.png`);
}

await shot("01-home", "/");

await page.goto(`${BASE}/decks`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, "02-decks-my-deck.png") });
console.log("captured 02-decks-my-deck.png");
await page.getByTestId("deck-tab-collection").click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, "03-decks-collection.png") });
console.log("captured 03-decks-collection.png");
await page.getByTestId("deck-tab-towers").click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, "04-decks-towers.png") });
console.log("captured 04-decks-towers.png");

await shot("05-collection", "/collection");
await shot("06-shop", "/shop");
await shot("07-leaderboard", "/leaderboard");
await shot("08-social", "/social");
await shot("09-lobby", "/lobby");

await page.goto(`${BASE}/battle`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(outDir, "10-battle-idle.png") });
console.log("captured 10-battle-idle.png");
const join = page.getByTestId("battle-join");
if (await join.count()) {
  await join.click();
  await page.waitForSelector('[data-testid="arena-canvas"]', { timeout: 25000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(outDir, "11-battle-live.png") });
  console.log("captured 11-battle-live.png");
}

const loginContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const loginPage = await loginContext.newPage();
await loginPage.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
await loginPage.waitForTimeout(600);
await loginPage.screenshot({ path: path.join(outDir, "12-login.png") });
console.log("captured 12-login.png");
await loginContext.close();

await browser.close();
console.log(`done: ${outDir}`);
