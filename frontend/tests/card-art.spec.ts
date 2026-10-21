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

  test("the strips are real 10 frame animations (5 walk + 5 attack)", async ({ page }) => {
    await page.goto(`${BASE}/animations`);
    for (const id of ["knight", "giant", "musketeer", "baby-dragon"]) {
      for (const view of ["front", "back"]) {
        const result = await page.evaluate(
          async ([card, side]) => {
            const img = new Image();
            img.src = `/sprites/${card}-${side}.png`;
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });
            if (!img.complete || img.naturalWidth === 0) return { width: 0, walkDiff: 0, attackDiff: 0 };
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const c = canvas.getContext("2d");
            if (!c) return { width: 0, walkDiff: 0, attackDiff: 0 };
            c.drawImage(img, 0, 0);
            const frame = (index: number): Uint8ClampedArray =>
              c.getImageData(index * 96, 0, 96, 96).data;
            const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
              let changed = 0;
              for (let i = 0; i < a.length; i += 4) {
                if (
                  Math.abs(a[i] - b[i]) > 18 ||
                  Math.abs(a[i + 1] - b[i + 1]) > 18 ||
                  Math.abs(a[i + 2] - b[i + 2]) > 18
                ) {
                  changed++;
                }
              }
              return changed;
            };
            const walk0 = frame(0);
            const walk2 = frame(2);
            const walk4 = frame(4);
            const attack5 = frame(5);
            const attack9 = frame(9);
            return {
              width: img.naturalWidth,
              walkDiff: diff(walk0, walk2) + diff(walk2, walk4),
              attackDiff: diff(walk0, attack5) + diff(attack5, attack9),
            };
          },
          [id, view] as const,
        );
        expect(result.width, `${id}-${view} must be 10 frames wide`).toBe(960);
        // a real walk cycle: the frames must differ from each other
        expect(result.walkDiff, `${id}-${view} walk frames must animate`).toBeGreaterThan(120);
        // a real attack: the attack frames must differ from the walk ones
        expect(result.attackDiff, `${id}-${view} attack frames must animate`).toBeGreaterThan(120);
      }
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
