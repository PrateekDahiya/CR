import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { hydrateMechanicsFromMysql, hydrateSpawnTemplatesFromMysql } from "../src/mysql.js";
import { createGame, playCard, tickGame } from "../src/game/engine.js";
import { CARDS, getSpawnTemplate } from "../src/game/cards.js";
import { getLevelStats } from "../src/game/levelStats.js";
import { forceInHand } from "./deckHelpers.js";

/**
 * Phase 14 — building lifetimes, HP wear-down and spawners.
 *
 * Previously only the Cannon had a lifetime, so every other building (all the
 * spawners, Tesla, Mortar, X-Bow, ...) lasted for the whole match, and nothing
 * bled HP as its timer ran out.
 */
const FILLER = ["knight", "archers", "musketeer", "fireball", "zap", "giant", "skeletons", "cannon"];
const ALL_BUILDINGS = Object.values(CARDS).filter((c) => c.type === "building");

function deckWith(cardId: string): string[] {
  const deck = [cardId, ...FILLER.slice(0, 7)];
  assert.equal(deck.length, 8);
  return deck;
}

describe("building lifetimes", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  it("gives every building a lifetime", () => {
    const missing = ALL_BUILDINGS.filter((c) => c.durationMs === undefined).map((c) => c.id);
    assert.deepEqual(missing, [], `buildings without a lifetime: ${missing.join(", ")}`);
  });

  it("uses tournament-standard lifetimes", () => {
    assert.equal(getSpawnTemplate("cannon")?.durationMs, 30000);
    assert.equal(getSpawnTemplate("barbarian-hut")?.durationMs, 30000);
    assert.equal(getSpawnTemplate("tesla")?.durationMs, 25000);
    assert.equal(getSpawnTemplate("inferno-tower")?.durationMs, 30000);
    assert.equal(getSpawnTemplate("x-bow")?.durationMs, 30000);
    assert.equal(getSpawnTemplate("mortar")?.durationMs, 30000);
  });

  it("bleeds HP over the lifetime and expires", () => {
    const state = createGame("lifetime-cannon", deckWith("cannon"), FILLER);
    state.elixir.blue = 10;
    const played = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "cannon"),
      x: 14.5,
      y: 4,
    });
    assert.equal(played.ok, true);
    const cannon = state.units.find((u) => u.cardId === "cannon");
    assert.ok(cannon);
    assert.equal(cannon.lifetimeSec, 30);
    const hpAtSpawn = cannon.hp;

    // A tenth of the lifetime in: ~10% of the HP should be gone.
    for (let i = 0; i < 100; i++) tickGame(state);
    const lost = hpAtSpawn - cannon.hp;
    assert.ok(
      lost > hpAtSpawn * 0.25 && lost < hpAtSpawn * 0.4,
      `expected slow wear-down, lost ${lost.toFixed(0)} of ${hpAtSpawn}`,
    );
    assert.ok(cannon.expiresAt !== undefined);
  });

  it("removes the building when its timer expires", () => {
    const state = createGame("lifetime-expire", deckWith("cannon"), FILLER);
    state.elixir.blue = 10;
    playCard(state, "blue", { handIndex: forceInHand(state, "blue", "cannon"), x: 14.5, y: 4 });
    assert.equal(state.units.filter((u) => u.cardId === "cannon").length, 1);

    for (let i = 0; i < 400; i++) tickGame(state);
    assert.equal(
      state.units.filter((u) => u.cardId === "cannon").length,
      0,
      "a 30s cannon must be gone after 40s of ticks",
    );
  });
});

describe("spawners", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  it("Barbarian Hut spawns Barbarians from the child template", async () => {
    assert.ok(getSpawnTemplate("barbarian"), "barbarian child template must exist");
    const state = createGame("spawn-hut", deckWith("barbarian-hut"), FILLER);
    state.elixir.blue = 10;
    const played = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "barbarian-hut"),
      x: 14.5,
      y: 10,
    });
    assert.equal(played.ok, true);
    const hut = state.units.find((u) => u.cardId === "barbarian-hut");
    assert.ok(hut);

    // Periodic spawner interval is a few seconds.
    for (let i = 0; i < 200; i++) tickGame(state);
    const spawned = state.units.filter((u) => u.cardId === "barbarian");
    assert.ok(spawned.length > 0, "the hut must have spawned barbarians");
    // Spawned children use the child-template stats, not derived deck stats.
    const template = getSpawnTemplate("barbarian");
    assert.ok(template);
    assert.equal(spawned[0]?.maxHp, getLevelStats(template, 1).hitPoints);
    assert.equal(spawned[0]?.owner, "blue");
  });

  it("every spawner building produces its declared children", async () => {
    const spawners = ["barbarian-hut", "furnace", "tombstone", "goblin-hut", "goblin-drill"];
    for (const spawnerId of spawners) {
      const card = CARDS[spawnerId];
      assert.ok(card, `${spawnerId} must exist`);
      const periodic = card.mechanics?.periodic ?? [];
      const children = periodic
        .filter((effect) => effect.kind === "spawn")
        .map((effect) => effect.childId);
      assert.ok(children.length > 0, `${spawnerId} declares no periodic spawn`);
      for (const child of children) {
        assert.ok(
          typeof child === "string" && getSpawnTemplate(child) !== undefined,
          `${spawnerId} references missing child template "${child}"`,
        );
      }
      // Spawners that are buildings are temporary; Furnace is now a troop.
      if (card.type === "building") {
        assert.ok(card.durationMs !== undefined, `${spawnerId} has no lifetime`);
      }
    }
  });

  it("a spawning building expires but its spawns live on", async () => {
    const state = createGame("spawn-expiry", deckWith("barbarian-hut"), FILLER);
    state.elixir.blue = 10;
    playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "barbarian-hut"),
      x: 14.5,
      y: 10,
    });

    // Poll until the first wave appears (the hut's periodic interval is data-driven).
    let sawChild = false;
    for (let i = 0; i < 250 && !sawChild; i++) {
      tickGame(state);
      sawChild = state.units.some((u) => u.cardId === "barbarian");
    }
    assert.ok(sawChild, "the hut must spawn barbarians");
    assert.ok(
      state.units.some((u) => u.cardId === "barbarian-hut"),
      "the hut is still alive shortly after its first spawn",
    );

    // Past the lifetime the hut is gone.
    for (let i = 0; i < 400; i++) tickGame(state);
    assert.equal(
      state.units.filter((u) => u.cardId === "barbarian-hut").length,
      0,
      "the hut must expire after 30s",
    );
  });

  it("Goblin Cage releases its goblin when it times out", async () => {
    const state = createGame("spawn-cage", deckWith("goblin-cage"), FILLER);
    state.elixir.blue = 10;
    playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "goblin-cage"),
      x: 14.5,
      y: 10,
    });
    // The cage expires at 20 s; check just after it releases its Goblin
    // Brawler (later the brawler may walk off and die to towers).
    for (let i = 0; i < 220; i++) tickGame(state);
    assert.equal(state.units.filter((u) => u.cardId === "goblin-cage").length, 0);
    assert.ok(
      state.units.some((u) => u.cardId === "goblin-brawler"),
      "the cage must release its goblin when it expires",
    );
  });

  it("spawned children are ordinary troops with no lifetime of their own", () => {
    const state = createGame("spawn-nolifetime", deckWith("barbarian-hut"), FILLER);
    state.elixir.blue = 10;
    playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "barbarian-hut"),
      x: 14.5,
      y: 10,
    });
    for (let i = 0; i < 200; i++) tickGame(state);
    const child = state.units.find((u) => u.cardId === "barbarian");
    assert.ok(child, "a barbarian was spawned");
    assert.equal(child.expiresAt, undefined, "troops must not inherit a building lifetime");
    assert.equal(child.lifetimeSec, undefined);
    assert.equal(child.isBuilding, false);
  });
});