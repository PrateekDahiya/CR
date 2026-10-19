import { test, expect } from "@playwright/test";
import {
  CARD_ROLES,
  MANDATORY_ROLES,
  cardRoles,
  classifiedCardIds,
  hasRole,
  providesBuilding,
  providesRanged,
  providesSplash,
  providesTank,
  validateCardRoles,
} from "../lib/cardRoles";
import { CARD_LIST, DECK_SIZE, getCard } from "../lib/cards";
import { analyseQuality, rolesCoveredBy, validateGeneratedDeck } from "../lib/deckValidation";
import { generateRandomDeck, playablePool } from "../lib/deckGenerator";
import { createCycle, rotateCard, cycleDistance } from "../lib/cardCycle";

/**
 * Phase 14 — card classification, random deck generation and card cycling.
 * These exercise the real shared modules (no mocks), plus the player-facing
 * Random Deck button in `deck-random.spec.ts`.
 */

const ALL_IDS = CARD_LIST.map((card) => card.id);

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test.describe("card classification", () => {
  test("every playable catalog card is classified", () => {
    const issues = validateCardRoles(CARD_LIST.map((c) => ({ id: c.id, type: c.type })));
    expect(issues).toEqual([]);
  });

  test("no unknown card ids in the mapping", () => {
    const catalog = new Set(ALL_IDS);
    for (const id of classifiedCardIds()) expect(catalog.has(id)).toBe(true);
  });

  test("only declared tags are used", () => {
    const declared = new Set<string>(CARD_ROLES);
    for (const id of classifiedCardIds()) {
      for (const tag of cardRoles(id)) expect(declared.has(tag)).toBe(true);
    }
  });

  test("a card can satisfy several roles", () => {
    expect(hasRole("golem", "tank")).toBe(true);
    expect(hasRole("golem", "win_condition")).toBe(true);
    expect(hasRole("baby-dragon", "ranged")).toBe(true);
    expect(hasRole("baby-dragon", "splash")).toBe(true);
  });

  test("buildings and spells stay structurally distinct", () => {
    expect(providesBuilding("cannon", "building")).toBe(true);
    expect(providesBuilding("fireball", "spell")).toBe(false);
    expect(providesRanged("fireball", "spell")).toBe(false);
  });

  test("an area spell never satisfies the mandatory splash role", () => {
    for (const card of CARD_LIST) {
      if (card.type !== "spell") continue;
      expect(cardRoles(card.id)).not.toContain("splash");
    }
    expect(hasRole("fireball", "splash_spell")).toBe(true);
  });

  test("mini_tank never satisfies the mandatory tank role", () => {
    expect(hasRole("knight", "mini_tank")).toBe(true);
    expect(providesTank("knight")).toBe(false);
    expect(providesTank("giant")).toBe(true);
  });

  test("ranged is distinct from anti_air", () => {
    expect(hasRole("bats", "anti_air")).toBe(true);
    expect(hasRole("bats", "ranged")).toBe(false);
    expect(hasRole("musketeer", "ranged")).toBe(true);
  });
});

test.describe("deck validation", () => {
  test("rejects a short deck and names missing roles", () => {
    const result = validateGeneratedDeck(["knight", "archers"]);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("expected 8 cards");
    expect(result.unsatisfiedRoles.length).toBeGreaterThan(0);
  });

  test("rejects duplicates", () => {
    const base = generateRandomDeck(ALL_IDS, { random: mulberry32(5) });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const deck = base.deck.slice();
    deck[7] = deck[0] as string;
    const result = validateGeneratedDeck(deck);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("duplicate");
  });

  test("soft preferences never fail a valid deck", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const result = generateRandomDeck(ALL_IDS, { random: mulberry32(seed) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Array.isArray(result.validation.softWarnings)).toBe(true);
    }
  });

  test("rolesCoveredBy reflects card roles", () => {
    const golem = getCard("golem");
    expect(golem).toBeDefined();
    if (!golem) return;
    expect(rolesCoveredBy(golem)).toContain("tank");
    expect(rolesCoveredBy(golem)).toContain("win_condition");
  });
});

test.describe("random deck generator", () => {
  test("generates 300 valid decks across seeds", () => {
    const unique = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const result = generateRandomDeck(ALL_IDS, { random: mulberry32(seed) });
      if (!result.ok) {
        throw new Error(`seed ${seed} failed: ${result.unsatisfiedRoles.join(",")}`);
      }
      expect(result.deck).toHaveLength(DECK_SIZE);
      expect(new Set(result.deck).size).toBe(DECK_SIZE);
      for (const role of MANDATORY_ROLES) {
        const covered = result.deck.some((id) => {
          const card = getCard(id);
          return card !== undefined && rolesCoveredBy(card).includes(role);
        });
        expect(covered, `seed ${seed} missing ${role}`).toBe(true);
      }
      unique.add(result.deck.slice().sort().join(","));
    }
    expect(unique.size).toBeGreaterThan(20);
  });

  test("fills to eight even when roles are already covered", () => {
    const result = generateRandomDeck(ALL_IDS, { random: mulberry32(42) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.deck).toHaveLength(DECK_SIZE);
  });

test("reports unsatisfied roles instead of returning an invalid deck", () => {
    const noSpells = CARD_LIST.filter((c) => c.type !== "spell").map((c) => c.id);
    const result = generateRandomDeck(noSpells, { maxNodes: 500 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unsatisfiedRoles).toContain("big_spell");
    expect(result.unsatisfiedRoles).toContain("small_spell");
  });

  test("terminates on a too-small pool", () => {
    const result = generateRandomDeck(["knight", "archers"], { maxNodes: 100 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.length).toBeGreaterThan(0);
  });

  test("respects the exclude list", () => {
    const base = generateRandomDeck(ALL_IDS, { random: mulberry32(3) });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const excluded = base.deck[0] as string;
    const second = generateRandomDeck(ALL_IDS, { exclude: [excluded], random: mulberry32(3) });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.deck).not.toContain(excluded);
  });

  test("drops unknown and tower cards from the pool", () => {
    const ids = playablePool([...ALL_IDS, "nope", "cannoneer"]).map((c) => c.id);
    expect(ids).not.toContain("nope");
    expect(ids).not.toContain("cannoneer");
  });

  test("produces balanced soft quality", () => {
    const result = generateRandomDeck(ALL_IDS, { random: mulberry32(11) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const quality = analyseQuality(result.deck);
    expect(quality.averageElixir).toBeGreaterThan(2.5);
    expect(quality.averageElixir).toBeLessThan(6.5);
    expect(quality.antiAirAnswers).toBeGreaterThanOrEqual(1);
  });
});

test.describe("card cycle", () => {
  const deck = ["a", "b", "c", "d", "e", "f", "g", "h"];

  test("four in hand, four in queue", () => {
    const cycle = createCycle(deck, mulberry32(1), false);
    expect(cycle.hand).toEqual(["a", "b", "c", "d"]);
    expect(cycle.queue).toEqual(["e", "f", "g", "h"]);
    expect(cycleDistance(cycle)).toBe(4);
  });

  test("playing draws the front of the queue", () => {
    const next = rotateCard(createCycle(deck, mulberry32(1), false), 0);
    expect(next.played).toBe("a");
    expect(next.hand).toEqual(["e", "b", "c", "d"]);
    expect(next.queue).toEqual(["f", "g", "h", "a"]);
  });

  test("a played card returns after four more plays", () => {
    // Played "a"; the queue was [e,f,g,h] so exactly four other cards must be
    // played before "a" is drawn back into the same slot.
    let cycle = rotateCard(createCycle(deck, mulberry32(1), false), 0);
    expect(cycle.played).toBe("a");
    cycle = rotateCard(cycle, 1);
    cycle = rotateCard(cycle, 1);
    cycle = rotateCard(cycle, 1);
    cycle = rotateCard(cycle, 1);
    expect(cycle.hand[1]).toBe("a");
    expect(cycle.queue).not.toContain("a");
  });

  test("does not mutate its input", () => {
    const cycle = createCycle(deck, mulberry32(1), false);
    const before = cycle.hand.join(",");
    rotateCard(cycle, 0);
    expect(cycle.hand.join(",")).toBe(before);
  });

  test("ignores an out-of-range slot (failed placement)", () => {
    const cycle = createCycle(deck, mulberry32(1), false);
    const result = rotateCard(cycle, 9);
    expect(result.played).toBeNull();
    expect(result.hand).toEqual(cycle.hand);
    expect(result.queue).toEqual(cycle.queue);
  });

  test("shuffles on request", () => {
    const cycle = createCycle(deck, mulberry32(99), true);
    expect(cycle.hand).toHaveLength(4);
    expect(cycle.queue).toHaveLength(4);
    expect(new Set([...cycle.hand, ...cycle.queue]).size).toBe(8);
  });
});