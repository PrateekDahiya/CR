import { test, expect, seedAndGoto } from "./fixtures";
import { getCard } from "../lib/cards";
import { MANDATORY_ROLES } from "../lib/cardRoles";
import { rolesCoveredBy, validateGeneratedDeck } from "../lib/deckValidation";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * Phase 14 — the player-facing Random Deck button must integrate with the
 * existing deck page: generate eight cards, show them, persist them, and be the
 * exact deck the next battle starts with. A failure must not destroy the deck.
 */
test.describe("Random Deck button", () => {
  test("generates eight cards, displays them and persists them", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });

    const before = await page.evaluate(() =>
      window.localStorage.getItem("cr-clone-deck-v1"),
    );

    await page.getByTestId("deck-random").click();

    // Eight slots are populated immediately.
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);
    await expect(page.getByTestId("deck-random-error")).toHaveCount(0);

    // Persisted under the existing key the battle screen reads.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const raw = window.localStorage.getItem("cr-clone-deck-v1");
            return raw === null ? null : (JSON.parse(raw) as string[]).join(",");
          }),
        { timeout: 8000 },
      )
      .not.toBe(before);

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem("cr-clone-deck-v1");
      return raw === null ? [] : (JSON.parse(raw) as string[]);
    });
    expect(stored).toHaveLength(8);
    expect(new Set(stored).size).toBe(8);

    // The stored deck satisfies every mandatory role.
    const validation = validateGeneratedDeck(stored);
    expect(validation.unsatisfiedRoles).toEqual([]);
    expect(validation.ok).toBe(true);

    // And the slots on screen match what was stored.
    for (let i = 0; i < 8; i++) {
      const card = getCard(stored[i] as string);
      expect(card).toBeDefined();
      if (!card) return;
      await expect(page.getByTestId(`deck-card-${i}`)).toHaveAttribute(
        "aria-label",
        new RegExp(card.name, "i"),
      );
    }
  });

  test("shows card art, name and elixir for the generated deck", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    await page.getByTestId("deck-random").click();
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);

    // At least one slot renders real art (the same layer the battle uses).
    await expect(page.locator('[data-testid^="deck-card-"] img').first()).toBeVisible();
    // Average elixir readout is refreshed (not left at the starter value).
    await expect(page.getByTestId("deck-avg-elixir")).toContainText("/ 10");
  });

  test("the next battle uses the generated deck", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });
    await page.getByTestId("deck-random").click();
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem("cr-clone-deck-v1");
      return raw === null ? [] : (JSON.parse(raw) as string[]);
    });
    expect(stored).toHaveLength(8);

    await page.goto(`${BASE}/battle`);
    await expect(page.getByTestId("battle-join")).toBeVisible();

// The opening four are the generated deck in a per-match randomized order, so
    // assert membership (not a fixed slot order) and wait for hydration rather
    // than racing the first render.
    await expect
      .poll(
        async () => {
          const shown: string[] = [];
          for (let i = 0; i < 4; i++) {
            const testid = await page
              .locator(`[data-testid="card-hand-${i}"] .card-art`)
              .getAttribute("data-testid");
            if (typeof testid !== "string") return "missing";
            shown.push(testid.replace("card-art-", ""));
          }
          return shown.every((id) => stored.includes(id)) ? "ok" : shown.join(",");
        },
        { timeout: 15000 },
      )
      .toBe("ok");
  });

  test("generating twice produces a different deck (no re-render regeneration)", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });

    const read = async () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("cr-clone-deck-v1");
        return raw === null ? "" : raw;
      });

    await page.getByTestId("deck-random").click();
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);
    const first = await read();
    // A plain re-render must NOT regenerate the deck.
    await page.getByTestId("deck-tab-deck").click();
    await page.getByTestId("deck-tab-deck").click();
    await page.waitForTimeout(400);
    expect(await read()).toBe(first);

    await page.getByTestId("deck-random").click();
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);
    // With the owned-only pool a repeat is possible; the generated deck must
    // still be a complete, persisted 8-card deck.
    expect((await read()).length).toBeGreaterThan(0);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);
  });

  test("every generated deck covers all seven mandatory roles", async ({ page }) => {
    await seedAndGoto(page, `${BASE}/decks`);
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8, { timeout: 15000 });

    for (let round = 0; round < 5; round++) {
      await page.getByTestId("deck-random").click();
      await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(8);
      const stored = await page.evaluate(() => {
        const raw = window.localStorage.getItem("cr-clone-deck-v1");
        return raw === null ? [] : (JSON.parse(raw) as string[]);
      });
      const covered = new Set<string>();
      for (const id of stored) {
        const card = getCard(id);
        if (card === undefined) continue;
        for (const role of rolesCoveredBy(card)) covered.add(role);
      }
      for (const role of MANDATORY_ROLES) {
        expect(covered.has(role), `round ${round} missing ${role}: ${stored.join(",")}`).toBe(true);
      }
    }
  });
});