import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_MAX_LEVEL,
  cardUpgradeCost,
  ensurePlayer,
  resetPlayers,
  upgradeCard,
} from "../src/players.js";

describe("card upgrades", () => {
  beforeEach(() => resetPlayers());

  it("charges coins, raises the owned level, and updates deck snapshots", () => {
    const pid = "upgrade-ok";
    const player = ensurePlayer(pid);
    player.coins = 100_000;
    player.cards.knight = 9;
    player.decks[0].cards[0] = "knight";
    player.decks[0].levels.knight = 9;
    const before = 9;
    const cost = cardUpgradeCost(before);

    const result = upgradeCard(pid, "knight");

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.level, before + 1);
      assert.equal(result.cost, cost);
      assert.equal(result.coins, 100_000 - cost);
    }
    assert.equal(player.cards.knight, before + 1);
    assert.equal(player.decks[0].levels.knight, before + 1);
  });

  it("rejects an unowned card", () => {
    const result = upgradeCard("upgrade-unowned", "miner");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "NOT_OWNED");
  });

  it("rejects when coins are short", () => {
    const pid = "upgrade-poor";
    const player = ensurePlayer(pid);
    player.coins = 0;
    const result = upgradeCard(pid, "knight");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "NO_COINS");
  });

  it("does not exceed the maximum level", () => {
    const pid = "upgrade-max";
    const player = ensurePlayer(pid);
    player.coins = 1_000_000;
    player.cards.knight = CARD_MAX_LEVEL;
    const result = upgradeCard(pid, "knight");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MAX_LEVEL");
    assert.equal(player.cards.knight, CARD_MAX_LEVEL);
  });
});
