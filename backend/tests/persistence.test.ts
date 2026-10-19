import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getPlayer, hydratePlayers, resetPlayers } from "../src/players.js";

describe("player persistence hydration", () => {
  beforeEach(() => resetPlayers());

  it("restores wallet, card levels, tower levels, king level, and decks", () => {
    const loaded = hydratePlayers(
      [
        {
          playerId: "persisted-player",
          name: "Persisted",
          trophies: 123,
          coins: 54_321,
          gems: 77,
          wins: 4,
          losses: 2,
          draws: 1,
          cards: { knight: 12, giant: 10 },
          towerLevels: { "tower-princess": 4, cannoneer: 2 },
          kingLevel: 6,
          activeDeckId: "deck-a",
          createdAtMs: 1234,
        },
      ],
      [
        {
          id: "deck-a",
          playerId: "persisted-player",
          name: "Ladder",
          cards: ["knight", "giant", "archers", "fireball", "zap", "cannon", "musketeer", "skeletons"],
          levels: { knight: 12, giant: 10 },
          towerTroopId: "tower-princess",
        },
      ],
    );

    assert.equal(loaded, 1);
    const player = getPlayer("persisted-player");
    assert.ok(player);
    assert.equal(player.coins, 54_321);
    assert.equal(player.gems, 77);
    assert.equal(player.cards.knight, 12);
    assert.equal(player.towerLevels["tower-princess"], 4);
    assert.equal(player.kingLevel, 6);
    assert.equal(player.activeDeckId, "deck-a");
    assert.equal(player.decks[0]?.name, "Ladder");
    assert.equal(player.decks[0]?.towerTroopId, "tower-princess");
  });

  it("falls back to a starter deck when no deck rows were stored", () => {
    hydratePlayers(
      [
        {
          playerId: "no-deck-player",
          name: "NoDeck",
          trophies: 0,
          coins: 500,
          gems: 20,
          wins: 0,
          losses: 0,
          draws: 0,
          cards: { knight: 9 },
          towerLevels: {},
          kingLevel: 1,
          activeDeckId: null,
          createdAtMs: 1,
        },
      ],
      [],
    );
    const player = getPlayer("no-deck-player");
    assert.ok(player);
    assert.equal(player.decks.length, 1);
    assert.equal(player.decks[0]?.cards.length, 8);
  });
});
