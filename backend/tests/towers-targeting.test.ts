import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, playCard, tickGame } from "../src/game/engine.js";
import { getSpawnTemplate } from "../src/game/cards.js";
import { hydrateMechanicsFromMysql, hydrateSpawnTemplatesFromMysql } from "../src/mysql.js";
import { forceInHand } from "./deckHelpers.js";

const DECK = ["knight", "archers", "giant", "skeletons", "musketeer", "fireball", "zap", "cannon"];

describe("level-scaled crown towers", () => {
  it("uses King's Tower level 11 HP/damage", () => {
    const state = createGame("towers-11", DECK, DECK, {
      blueCardLevels: { knight: 11, "king-tower": 11 },
      blueTowerTroopId: "tower-princess",
      redTowerTroopId: "tower-princess",
    });
    const king = state.towers.find((t) => t.owner === "blue" && t.kind === "king");
    assert.ok(king);
    assert.equal(king.maxHp, 4824);
    assert.equal(king.damage, 109);
    assert.equal(king.hitSpeed, 1);
  });

  it("uses Tower Princess level 11 HP/damage", () => {
    const state = createGame("towers-princess-11", DECK, DECK, {
      blueCardLevels: { knight: 11, "king-tower": 11, "tower-princess": 11 },
      blueTowerTroopId: "tower-princess",
      redTowerTroopId: "tower-princess",
    });
    const princess = state.towers.find((t) => t.owner === "blue" && t.kind === "princess");
    assert.ok(princess);
    assert.equal(princess.maxHp, 3052);
    assert.equal(princess.damage, 109);
    assert.equal(princess.hitSpeed, 0.8);
  });

  it("uses the selected tower troop's level table", () => {
    const state = createGame("towers-cannoneer-11", DECK, DECK, {
      blueCardLevels: { knight: 11, "king-tower": 11, cannoneer: 11 },
      blueTowerTroopId: "cannoneer",
      redTowerTroopId: "tower-princess",
    });
    const princess = state.towers.find((t) => t.owner === "blue" && t.kind === "princess");
    assert.ok(princess);
    assert.equal(princess.maxHp, 2616);
    assert.equal(princess.damage, 320);
    assert.equal(princess.hitSpeed, 2.2);
  });

  it("keeps level-1 defaults for legacy callers", () => {
    const state = createGame("towers-1", DECK, DECK);
    const king = state.towers.find((t) => t.owner === "blue" && t.kind === "king");
    const princess = state.towers.find((t) => t.owner === "blue" && t.kind === "princess");
    assert.equal(king?.maxHp, 2400);
    assert.equal(princess?.maxHp, 1400);
  });
});

describe("target masks: Elixir Golem family is buildings-only", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  function pinnedKnight(state: ReturnType<typeof createGame>, x: number, y: number) {
    state.elixir.red = 10;
    playCard(state, "red", { handIndex: forceInHand(state, "red", "knight"), x: 9, y: 18 });
    const knight = state.units.find((u) => u.owner === "red" && u.cardId === "knight");
    assert.ok(knight);
    knight.x = x;
    knight.y = y;
    knight.speed = 0;
    knight.hp = 100_000;
    knight.maxHp = 100_000;
    return knight;
  }

  it("declares building-only targeting for the card and both children", () => {
    assert.equal(getSpawnTemplate("elixir-golem")?.targets, "buildings");
    assert.equal(getSpawnTemplate("elixir-golemite")?.targets, "buildings");
    assert.equal(getSpawnTemplate("elixir-blob")?.targets, "buildings");
  });

  it("Elixir Golem walks past a nearby enemy troop", () => {
    const state = createGame("target-elixir-golem", ["elixir-golem", ...DECK.slice(0, 7)], DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", { handIndex: forceInHand(state, "blue", "elixir-golem"), x: 3.5, y: 12 });
    const golem = state.units.find((u) => u.owner === "blue" && u.cardId === "elixir-golem");
    assert.ok(golem);
    assert.equal(golem.targets, "buildings");
    // Silence Crown Towers so only the golem could damage the pinned knight.
    state.towers.forEach((tower) => { tower.damage = 0; });
    const knight = pinnedKnight(state, 3.5, 13);
    for (let i = 0; i < 30; i += 1) tickGame(state);
    assert.equal(knight.hp, 100_000, "golem must not attack the knight");
  });

  it("Golemite and Blob keep building-only targeting", () => {
    const state = createGame("target-elixir-children", ["elixir-golem", ...DECK.slice(0, 7)], DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", { handIndex: forceInHand(state, "blue", "elixir-golem"), x: 3.5, y: 12 });
    const golem = state.units.find((u) => u.owner === "blue" && u.cardId === "elixir-golem");
    assert.ok(golem);
    golem.hp = 0;
    tickGame(state);
    const golemites = state.units.filter((u) => u.cardId === "elixir-golemite");
    assert.ok(golemites.length > 0);
    for (const golemite of golemites) assert.equal(golemite.targets, "buildings");

    golemites[0].hp = 0;
    tickGame(state);
    const blobs = state.units.filter((u) => u.cardId === "elixir-blob");
    assert.ok(blobs.length > 0);
    for (const blob of blobs) assert.equal(blob.targets, "buildings");
  });
});
