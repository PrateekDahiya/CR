import { test, expect } from "./fixtures";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test("allowlisted player sees the admin dashboard without a login screen", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cr-player-id", "dahiya27");
    window.localStorage.setItem("cr-name", "dahiya27");
  });
  await page.goto(`${BASE}/admin`);
  await expect(page.getByTestId("admin-dashboard")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("admin-stats")).toBeVisible();
  await expect(page.getByTestId("admin-login")).toHaveCount(0);
  await expect(page.getByTestId("admin-username")).toHaveCount(0);
});

test("non-admin player sees Not authorized", async ({ page }) => {
  await page.goto(`${BASE}/admin`);
  await expect(page.getByTestId("admin-unauthorized")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Not authorized")).toBeVisible();
  await expect(page.getByTestId("admin-dashboard")).toHaveCount(0);
});
