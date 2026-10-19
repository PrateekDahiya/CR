import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CARD_LIST, getCard } from "../lib/cards";
import { SIEGE_CARD_IDS, TOWER_TROOP_IDS, isTowerTroopId, unitGlyph } from "../lib/cardAliases";
import { isDeployValid } from "../lib/battle/useBattle";
import { validateGeneratedDeck } from "../lib/deckValidation";
import { generateRandomDeck } from "../lib/deckGenerator";

const repoRoot = path.resolve(__dirname, "..", "..");
const MECHANICS = JSON.parse(
  readFileSync(path.join(repoRoot, "infra", "mysql", "card_mechanics.json"), "utf8"),
) as Record<string, Record<string, unknown>>;

const TOWER_TROOPS = ["tower-princess", "cannoneer", "dagger-duchess", "royal-chef"];

test.describe("15.1 siege placement (client mirrors server)", () => {
  test("the siege list matches the database", () => {
    const fromDb = Object.entries(MECHANICS)
      .filter(([, record]) => record.movement === "siege")
      .map(([id]) => id)
      .sort();
    expect(Array.from(SIEGE_CARD_IDS).sort()).toEqual(fromDb);
  });

  test("Mortar and X-Bow may be placed forward on the enemy half", () => {
    for (const id of ["mortar", "x-bow"]) {
      // Forward, in range of the enemy tower (red princess at y=24.5).
      expect(isDeployValid(3.5, 20, "blue", id), `${id} forward deploy`).toBe(true);
      expect(isDeployValid(13.5, 20, "blue", id)).toBe(true);
    }
  });

  test("siege buildings are still barred from the river and off-arena", () => {
    for (const id of ["mortar", "x-bow"]) {
      expect(isDeployValid(3.5, 15.5, "blue", id)).toBe(false);
      expect(isDeployValid(3.5, 16, "blue", id)).toBe(false);
      expect(isDeployValid(-1, 20, "blue", id)).toBe(false);
      expect(isDeployValid(3.5, 33, "blue", id)).toBe(false);
    }
  });

  test("ordinary buildings are still own-half only", () => {
    expect(isDeployValid(3.5, 20, "blue", "cannon")).toBe(false);
    expect(isDeployValid(3.5, 5, "blue", "cannon")).toBe(true);
  });
});

test.describe("15.4 tower troops are not deck cards", () => {
  test("the four tower troops are recognised", () => {
    expect(Array.from(TOWER_TROOP_IDS).sort()).toEqual([...TOWER_TROOPS].sort());
    for (const id of TOWER_TROOPS) {
      expect(isTowerTroopId(id)).toBe(true);
      expect(getCard(id)?.type).toBe("tower");
      expect(getCard(id)?.cost).toBe(0);
    }
  });

  test("no other card is treated as a tower troop", () => {
    for (const card of CARD_LIST) {
      if (TOWER_TROOPS.includes(card.id)) continue;
      expect(isTowerTroopId(card.id), `${card.id} must not be a tower troop`).toBe(false);
    }
  });

  test("the random deck generator never emits a tower troop", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const result = generateRandomDeck(
        CARD_LIST.map((card) => card.id),
        { random: (() => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })() },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const id of result.deck) {
        expect(isTowerTroopId(id), `seed ${seed} generated tower troop ${id}`).toBe(false);
      }
      expect(validateGeneratedDeck(result.deck).invalidCards).toEqual([]);
    }
  });

  test("a deck containing a tower troop fails validation", () => {
    const deck = ["cannoneer", "cannon", "fireball", "zap", "giant", "musketeer", "valkyrie", "archers"];
    const result = validateGeneratedDeck(deck);
    expect(result.ok).toBe(false);
    expect(result.invalidCards).toContain("cannoneer");
  });
});

test.describe("15.5 / 15.6 targeting data", () => {
  test("air-capable troops are declared air+ground", () => {
    for (const id of ["bowler", "valkyrie", "sparky", "little-prince", "baby-dragon", "wizard"]) {
      expect(MECHANICS[id]?.targeting, id).toBe("air+ground");
    }
  });

  test("building-seekers are declared buildings", () => {
    for (const id of ["giant", "royal-giant", "hog-rider", "golem", "lava-hound", "elixir-golem"]) {
      expect(MECHANICS[id]?.targeting, id).toBe("buildings");
    }
  });

  test("spirits declare the suicide attack", () => {
    for (const id of ["fire-spirit", "ice-spirit"]) {
      expect(MECHANICS[id]?.attack, id).toBe("suicide");
    }
  });

  test("every catalog card still resolves to a glyph", () => {
    for (const card of CARD_LIST) {
      expect(unitGlyph(card.id), card.id).toBeTruthy();
    }
  });
});