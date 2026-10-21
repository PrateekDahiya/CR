import { expect } from "@playwright/test";
import { test } from "./fixtures";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("card animation strips", () => {
  test("animation lab renders every card from its 6-frame strip", async ({ page }) => {
    await page.goto(`${BASE}/animations`);
    const cards = page.locator('[data-testid^="anim-card-"]');
    await expect(cards).toHaveCount(108);

    // Every preview canvas must contain decoded strip pixels, not just the
    // dark background. Sample the first and last card to cover async loading.
    for (const id of ["archer-queen", "zappies"]) {
      const canvas = page.locator(`[data-testid="anim-card-${id}"] canvas`);
      await expect(canvas).toBeVisible();
      await page.waitForTimeout(400);
      const lit = await canvas.evaluate((el) => {
        const c = (el as HTMLCanvasElement).getContext("2d");
        if (!c) return 0;
        const data = c.getImageData(0, 0, el.clientWidth, el.clientHeight).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] + data[i + 1] + data[i + 2] > 120) n++;
        }
        return n;
      });
      expect(lit).toBeGreaterThan(200);
    }
  });
});
