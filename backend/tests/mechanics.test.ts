import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hydrateMechanicsFromMysql, hydrateSpawnTemplatesFromMysql } from "../src/mysql.js";
import { createGame, playCard, tickGame } from "../src/game/engine.js";

const DECK = ["knight", "archers", "fireball", "zap", "giant", "skeletons", "baby-dragon", "cannon"];

describe("database-defined card mechanics", () => {
  it("uses the stored Fireball effect rather than a card-id branch", async () => {
    const loaded = await hydrateMechanicsFromMysql();
    assert.equal(loaded.loaded, 108);
    const state = createGame("mechanics-fireball", DECK, DECK);
    const princess = state.towers.find((tower) => tower.owner === "red" && tower.kind === "princess");
    assert.ok(princess);
    state.elixir.blue = 10;
    const result = playCard(state, "blue", { handIndex: 2, x: princess.x, y: princess.y });
    assert.equal(result.ok, true);
    assert.equal(princess.hp, princess.maxHp - 276);
  });

  it("applies the stored Zap status to a unit in the target area", async () => {
    await hydrateMechanicsFromMysql();
    const state = createGame("mechanics-zap", DECK, DECK);
    state.elixir.blue = 10;
    const spawned = playCard(state, "blue", { handIndex: 0, x: 9, y: 5 });
    assert.equal(spawned.ok, true);
    state.elixir.red = 10;
    const result = playCard(state, "red", { handIndex: 3, x: 9, y: 5 });
    assert.equal(result.ok, true);
    assert.ok(state.units[0].stunUntil > state.timeSec);
  });

  it("loads child templates for database-defined death splits", async () => {
    await hydrateMechanicsFromMysql();
    assert.ok((await hydrateSpawnTemplatesFromMysql()).loaded > 0);
    const golemDeck = ["golem", "knight", "archers", "fireball", "zap", "giant", "skeletons", "cannon"];
    const state = createGame("mechanics-split", golemDeck, DECK);
    state.elixir.blue = 10;
    const result = playCard(state, "blue", { handIndex: 0, x: 9, y: 5 });
    assert.equal(result.ok, true);
    state.units[0].hp = 0;
    tickGame(state);
    assert.equal(state.units.filter((unit) => unit.cardId === "golemite").length, 2);
  });
});
