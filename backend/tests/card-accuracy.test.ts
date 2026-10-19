import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CARDS } from "../src/game/cards.js";
import { GENERATED_CARD_LEVELS } from "../src/game/cardLevels.generated.js";

const ALL = Object.values(CARDS);

describe("Clash Royale card accuracy", () => {
  it("anchors representative level-11 stats to the wiki snapshot", () => {
    assert.equal(CARDS.knight.hp11, 1766);
    assert.equal(CARDS.knight.damage11, 202);
    assert.equal(CARDS.knight.hitSpeed, 1.2);
    assert.equal(CARDS.knight.range, 1.2);
    assert.equal(CARDS.knight.targets, "ground");

    assert.equal(CARDS.giant.hp11, 3968);
    assert.equal(CARDS.giant.damage11, 253);
    assert.equal(CARDS.giant.targets, "buildings");

    assert.equal(CARDS.archers.count, 2);
    assert.equal(CARDS["skeleton-army"].count, 15);
    assert.equal(CARDS["goblin-gang"].count, 6);

    assert.equal(CARDS.fireball.damage11, 688);
    assert.equal(GENERATED_CARD_LEVELS["fireball"]?.[10]?.towerDamage, 159);

    assert.equal(CARDS.furnace.type, "troop");
    assert.equal(CARDS.furnace.damage11, 179);
    assert.equal(CARDS.valkyrie.cost, 4);
    assert.equal(CARDS["inferno-dragon"].cost, 4);
    assert.equal(CARDS.void.cost, 5);
  });

  it("has a description for every card and the requested special fields where relevant", () => {
    for (const card of ALL) {
      assert.ok(card.description && card.description.length > 10, `${card.id} description`);
    }
    assert.equal(CARDS.bandit.dashDamage, 150);
    assert.ok(CARDS["dark-prince"].chargeDamage);
    assert.ok(CARDS["giant-skeleton"].deathDamage);
    assert.ok(CARDS.guards.shieldHp);
    assert.equal(CARDS["goblin-drill"].spawnDamage, 32);
    assert.equal(CARDS.sparky.splashRadius, 1.8);
  });

  it("provides 16 monotonic level rows for every card", () => {
    for (const card of ALL) {
      const rows = GENERATED_CARD_LEVELS[card.id];
      assert.ok(rows && rows.length === 16, `${card.id} level rows`);
      if (card.type !== "spell") {
        for (let index = 1; index < rows.length; index += 1) {
          assert.ok(rows[index].hitPoints >= rows[index - 1].hitPoints, `${card.id} hp level ${index + 1}`);
          assert.ok(rows[index].damage >= rows[index - 1].damage, `${card.id} damage level ${index + 1}`);
        }
      }
    }
  });
});
