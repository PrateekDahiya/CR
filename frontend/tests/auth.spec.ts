/**
 * Auth: the app requires a real account (register/login) — no auto-generated
 * guest names. These tests start signed OUT on purpose.
 */
import { expect } from "@playwright/test";
import { test } from "./fixtures";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

/** Starts with no playerId so AuthGuard must bounce us to /login. */
async function signedOut(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("cr-player-id");
      window.localStorage.removeItem("cr-name");
    } catch {
      // ignore
    }
  });
}

function uniqueUser(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 16);
}

test("anonymous visitors are redirected to the login screen", async ({ page }) => {
  await signedOut(page);
  await page.goto(`${BASE}/decks`);
  await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
  await expect(page.getByTestId("login-page")).toBeVisible();
  await expect(page.getByTestId("auth-username")).toBeVisible();
  await expect(page.getByTestId("auth-password")).toBeVisible();
});

test("register creates an account and signs the player in", async ({ page }) => {
  await signedOut(page);
  await page.goto(`${BASE}/login`);
  const username = uniqueUser("player");

  await page.getByTestId("auth-tab-register").click();
  await page.getByTestId("auth-username").fill(username);
  await page.getByTestId("auth-password").fill("secret123");
  await page.getByTestId("auth-submit").click();

  // Signed in: sent to the home screen with the account name in the top bar.
  await expect(page).toHaveURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/$`), { timeout: 20000 });
  await expect(page.getByTestId("topbar-name")).toHaveText(username, { timeout: 20000 });

  // Reloading stays signed in (the guard does not bounce us back to /login).
  await page.goto(`${BASE}/decks`);
  await expect(page.getByTestId("deck-list")).toBeVisible({ timeout: 20000 });
});

test("login rejects a wrong password and accepts the right one", async ({ page }) => {
  await signedOut(page);
  await page.goto(`${BASE}/login`);
  const username = uniqueUser("login");

  // Register first.
  await page.getByTestId("auth-tab-register").click();
  await page.getByTestId("auth-username").fill(username);
  await page.getByTestId("auth-password").fill("secret123");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("topbar-name")).toHaveText(username, { timeout: 20000 });

  // Sign out (clear storage) and try a bad password.
  await signedOut(page);
  await page.goto(`${BASE}/login`);
  await page.getByTestId("auth-username").fill(username);
  await page.getByTestId("auth-password").fill("wrong-password");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-error")).toBeVisible({ timeout: 15000 });

  // Correct password signs in.
  await page.getByTestId("auth-password").fill("secret123");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("topbar-name")).toHaveText(username, { timeout: 20000 });
});

test("top bar logout clears the session and returns to login", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.getByTestId("topbar-menu").click();
  await expect(page.getByTestId("topbar-logout")).toBeVisible();
  await page.getByTestId("topbar-logout").click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
  await expect(page.getByTestId("login-page")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("cr-player-id"))).toBeNull();
});

test("registering an existing username is rejected", async ({ page }) => {
  await signedOut(page);
  await page.goto(`${BASE}/login`);
  const username = uniqueUser("dup");

  await page.getByTestId("auth-tab-register").click();
  await page.getByTestId("auth-username").fill(username);
  await page.getByTestId("auth-password").fill("secret123");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("topbar-name")).toHaveText(username, { timeout: 20000 });

  await signedOut(page);
  await page.goto(`${BASE}/login`);
  await page.getByTestId("auth-tab-register").click();
  await page.getByTestId("auth-username").fill(username);
  await page.getByTestId("auth-password").fill("another123");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-error")).toContainText(/taken/i, { timeout: 15000 });
});
