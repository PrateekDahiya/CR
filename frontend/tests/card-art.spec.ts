/**
 * Per-team card art regression test.
 *
 * Every card must have a real 2D animation for BOTH team views:
 *   red  -> /sprites/<card>-front.png  (the character seen from the front)
 *   blue -> /sprites/<card>-back.png   (the character seen from behind)
 *
 * The renderer picks the view by team and flips it with the unit's facing, and
 * every fallback (team strip -> neutral strip -> static art -> glyph) has to
 * keep working so a missing asset never breaks a match.
 */
import { expect } from "@playwright/test";
import { test } from "./fixtures";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

const DECK = ["knight", "musketeer", "archers", "valkyrie", "giant", "hog-rider", "baby-dragon", "skeletons"];

async function endMatch(page: import("@playwright/test").Page): Promise<void> {
  // Forfeit the practice match so it does not linger in the queue.
  const forfeit = page.getByTestId("battle-forfeit");
  if ((await forfeit.count()) === 0) return;
  await forfeit.click();
  const yes = page.getByTestId("forfeit-confirm-yes");
  if ((await yes.count()) > 0) await yes.click();
}

test.describe("per-team card art", () => {
  test("every card renders a front and a back animation", async ({ page }) => {
    await page.goto(`${BASE}/animations`);
    const cards = page.locator('[data-testid^="anim-card-"]');
    await expect(cards).toHaveCount(108);

    // Sample cards across the catalogue: the top row is the red (front) view,
    // the bottom row the blue (back) view, so the two halves must differ.
    for (const id of ["knight", "giant", "musketeer", "hog-rider", "baby-dragon", "archers"]) {
      const canvas = page.locator(`[data-testid="anim-card-${id}"] canvas`);
      await expect(canvas).toBeVisible();
      await page.waitForTimeout(600);
      const diff = await canvas.evaluate((el) => {
        const c = (el as HTMLCanvasElement).getContext("2d");
        if (!c) return -1;
        const h = (el as HTMLCanvasElement).height;
        const front = c.getImageData(0, 0, (el as HTMLCanvasElement).width, h / 2).data;
        const back = c.getImageData(0, h / 2, (el as HTMLCanvasElement).width, h / 2).data;
        let different = 0;
        for (let i = 0; i < front.length; i += 4) {
          if (
            Math.abs(front[i] - back[i]) > 12 ||
            Math.abs(front[i + 1] - back[i + 1]) > 12 ||
            Math.abs(front[i + 2] - back[i + 2]) > 12
          ) {
            different++;
          }
        }
        return different;
      });
      expect(diff, `${id} must draw a different back view`).toBeGreaterThan(200);
    }
  });

  test("battle loads the team strip of the deployed card", async ({ page }) => {
    const sprites: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/sprites/") && url.endsWith(".png")) sprites.push(url.replace(BASE, ""));
    });

    await page.addInitScript((deck) => {
      window.localStorage.setItem("cr-player-id", "card-art-team");
      window.localStorage.setItem("cr-name", "card-art-team");
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    }, DECK);

    await page.goto(`${BASE}/battle`);
    await expect(page.getByTestId("battle-join")).toBeVisible();
    await page.getByTestId("battle-join").click();
    await expect(page.getByTestId("battle-page")).toHaveAttribute("data-match", /\S+/, { timeout: 25000 });
    await page.waitForTimeout(600);

    const canvas = page.locator('[data-testid="battle-canvas"], [data-testid="arena-canvas"]');
    await page.getByTestId("card-hand-0").click();
    await canvas.evaluate((el) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width * 0.5,
          clientY: r.top + r.height * 0.8,
        }),
      );
    });

    await expect
      .poll(() => sprites.filter((s) => s.includes("-front.png")).length, { timeout: 20000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => sprites.filter((s) => s.includes("-back.png")).length, { timeout: 20000 })
      .toBeGreaterThan(0);

    await endMatch(page);
  });

  test("a missing strip falls back to the static card art without breaking", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // Hide every sprite: the arena must fall back to the static per-team art
    // and keep running.
    await page.route("**/sprites/*.png", (route) => route.abort());
    await page.addInitScript((deck) => {
      window.localStorage.setItem("cr-player-id", "card-art-fallback");
      window.localStorage.setItem("cr-name", "card-art-fallback");
      window.localStorage.setItem("cr-clone-deck-v1", JSON.stringify(deck));
    }, DECK);

    await page.goto(`${BASE}/battle`);
    await expect(page.getByTestId("battle-join")).toBeVisible();
    await page.getByTestId("battle-join").click();
    await expect(page.getByTestId("battle-page")).toHaveAttribute("data-match", /\S+/, { timeout: 25000 });
    await page.waitForTimeout(500);

    const canvas = page.locator('[data-testid="battle-canvas"], [data-testid="arena-canvas"]');
    await page.getByTestId("card-hand-0").click();
    await canvas.evaluate((el) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width * 0.5,
          clientY: r.top + r.height * 0.8,
        }),
      );
    });
    await page.waitForTimeout(2500);
    await expect(canvas).toBeVisible();
    expect(errors).toEqual([]);

    await endMatch(page);
  });
});
