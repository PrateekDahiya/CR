import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_MAX_LEVEL,
  applyMatchResult,
  cardUpgradeCost,
  ensurePlayer,
  playerTable,
  resetPlayers,
  upgradeCard,
  upgradeTower,
} from "../src/players.js";

describe("the bot placeholder is never a player", () => {
  beforeEach(() => resetPlayers());

  it("ignores the ai-opponent placeholder and the bot ids", () => {
    const deltas = applyMatchResult({
      blueId: "real-player",
      redId: "ai-opponent",
      winner: "blue",
      crowns: { blue: 3, red: 0 },
    });
    assert.equal(deltas.length, 1, "only the real player gets a result");
    assert.equal(deltas[0].playerId, "real-player");
    // The placeholder must not exist as a player row.
    assert.equal(ensurePlayer("real-player").trophies > 0, true);
    const table = playerTable(50);
    assert.ok(
      !table.some((row) => row.playerId === "ai-opponent"),
      "the AI placeholder must not show up in the player table",
    );
  });

  it("ignores the bot- prefixed ids", () => {
    const deltas = applyMatchResult({
      blueId: "bot-abc",
      redId: "bot-def",
      winner: "blue",
      crowns: { blue: 1, red: 0 },
    });
    assert.equal(deltas.length, 0);
  });
});

describe("card upgrades", () => {
  beforeEach(() => resetPlayers());

  it("gives new players a full deck of owned starter cards", () => {
    const player = ensurePlayer("starter-account");
    assert.equal(player.decks[0].cards.length, 8);
    for (const id of player.decks[0].cards) {
      assert.ok((player.cards[id] ?? 0) > 0, `${id} must be owned`);
      assert.equal(player.decks[0].levels[id], player.cards[id]);
    }
  });

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

  it("requires the King Tower upgrade before side towers", () => {
    const pid = "tower-upgrade";
    const player = ensurePlayer(pid);
    player.coins = 1_000_000;
    const before = player.towerLevels["tower-princess"];

    const blocked = upgradeTower(pid, "tower-princess");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "KING_LEVEL_REQUIRED");

    const king = upgradeTower(pid, "king");
    assert.equal(king.ok, true);
    if (king.ok) assert.equal(king.level, 2);

    const result = upgradeTower(pid, "tower-princess");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.level, before + 1);
    assert.equal(player.towerLevels["tower-princess"], before + 1);
    // Card levels are untouched by tower progression.
    assert.equal(player.cards["tower-princess"], undefined);
  });

  it("rejects non-tower ids for tower upgrades", () => {
    const result = upgradeTower("tower-bad", "knight");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "BAD_TOWER");
  });
});
