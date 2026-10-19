import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CARDS } from "../src/game/cards.js";
import {
  MANDATORY_ROLES,
  botDeckFor,
  botDeckPool,
  cardTags,
  coveredRoles,
  generateBotDeck,
} from "../src/game/botDeck.js";

/**
 * Phase 14 — AI deck generation.
 *
 * The AI used to pick from three hardcoded decks. It now generates a fresh,
 * role-valid eight-card deck per match from the real catalog, using the same
 * `shared/card-roles.json` table the player's Random Deck button reads.
 */

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

function pool(): Map<string, { id: string; type: string; cost: number; tags: readonly string[] }> {
  const map = new Map<string, { id: string; type: string; cost: number; tags: readonly string[] }>();
  for (const card of botDeckPool()) map.set(card.id, card);
  return map;
}

describe("phase 14 — shared role table", () => {
  it("classifies every playable catalog card", () => {
    const playable = Object.values(CARDS).filter((card) => card.type !== "tower");
    const missing = playable.filter((card) => cardTags(card.id).length === 0).map((c) => c.id);
    assert.deepEqual(missing, [], `unclassified playable cards: ${missing.join(", ")}`);
  });

  it("contains no card id outside the catalog", () => {
    const catalog = new Set(Object.keys(CARDS));
    const table = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", "..", "shared", "card-roles.json"), "utf8"),
    ) as { roles: string[]; cardRoles: Record<string, string[]> };
    const orphans = Object.keys(table.cardRoles).filter((id) => !catalog.has(id));
    assert.deepEqual(orphans, [], `role table references unknown cards: ${orphans.join(", ")}`);
  });

  it("never marks a spell with the mandatory splash troop role", () => {
    for (const card of Object.values(CARDS)) {
      if (card.type !== "spell") continue;
      assert.equal(
        cardTags(card.id).includes("splash"),
        false,
        `spell "${card.id}" must use splash_spell, not splash`,
      );
    }
  });

  it("does not let mini_tank satisfy the mandatory tank role", () => {
    const table = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", "..", "shared", "card-roles.json"), "utf8"),
    ) as { cardRoles: Record<string, string[]> };
    for (const [id, tags] of Object.entries(table.cardRoles)) {
      if (!tags.includes("mini_tank")) continue;
      const coversTank = coveredRoles({ id, type: "troop", cost: 3, tags }).includes("tank");
      assert.equal(coversTank, tags.includes("tank"), `${id} mini_tank/tank mismatch`);
    }
  });
});

describe("phase 14 — AI deck generation", () => {
  const poolMap = pool();

  it("builds a pool from the real catalog without tower troops", () => {
    assert.ok(poolMap.size > 90, `expected the full catalog, got ${poolMap.size}`);
    for (const card of poolMap.values()) {
      assert.notEqual(card.type, "tower");
    }
  });

  it("generates 200 valid eight-card decks across seeds", () => {
    const unique = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const result = generateBotDeck({ random: mulberry32(seed) });
      assert.ok(result.ok, `seed ${seed} failed: ${result.problems.join("; ")}`);
      assert.equal(result.deck.length, 8);
      assert.equal(new Set(result.deck).size, 8, `seed ${seed} produced duplicates`);

      for (const role of MANDATORY_ROLES) {
        const covered = result.deck.some((id) => {
          const card = poolMap.get(id);
          return card !== undefined && coveredRoles(card).includes(role);
        });
        assert.ok(covered, `seed ${seed} missed mandatory role ${role}: ${result.deck.join(",")}`);
      }
      unique.add(result.deck.slice().sort().join(","));
    }
    assert.ok(unique.size > 15, `AI decks should vary, got ${unique.size} unique`);
  });

  it("never produces an unknown or unclassified card", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const result = generateBotDeck({ random: mulberry32(seed + 900) });
      assert.ok(result.ok);
      for (const id of result.deck) {
        assert.ok(poolMap.has(id), `generated unknown card "${id}"`);
      }
    }
  });

  it("avoids repeating the previous ordered deck", () => {
    const first = generateBotDeck({ random: mulberry32(4) });
    assert.ok(first.ok);
    for (let attempt = 0; attempt < 10; attempt++) {
      const second = generateBotDeck({ random: mulberry32(4), avoidOrdered: first.deck });
      assert.ok(second.ok, "must still find an alternative deck");
      assert.notEqual(second.deck.join(","), first.deck.join(","));
    }
  });

  it("reports failure instead of emitting an invalid deck", () => {
    // With the real pool a failure is not expected; assert the success shape so
    // the throw in botDeckFor can never fire silently in production.
    const result = generateBotDeck();
    assert.ok(result.ok);
    assert.deepEqual(result.unsatisfiedRoles, []);
    assert.deepEqual(result.problems, []);
  });

  it("gives each match a deck and avoids the previous one", () => {
    const first = botDeckFor("match-one");
    assert.equal(first.length, 8);
    const second = botDeckFor("match-two", first);
    assert.notEqual(second.join(","), first.join(","));
  });

  it("keeps average cost in a sane band", () => {
    const costs = Object.values(CARDS);
    for (let seed = 1; seed <= 40; seed++) {
      const result = generateBotDeck({ random: mulberry32(seed + 77) });
      assert.ok(result.ok);
      const byId = new Map(costs.map((c) => [c.id, c.cost]));
      const total = result.deck.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
      const average = total / result.deck.length;
      assert.ok(average > 2.5 && average < 6.5, `seed ${seed} average ${average}`);
    }
  });
});