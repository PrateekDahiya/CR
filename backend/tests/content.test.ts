// Content tests: MySQL-or-local fallback shapes (no live DB required).
// O(c)/O(m) reads. Run: npm test (tsx --test).
//
// Phase 15: every catalog card is playable, so the roster assertions expect the
// full catalog (108) with live stats, not the old 12-card baseline.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCatalog, getCardMechanicsContent, getContentCards, getContentMenus, getContentSprites, hydrateMechanicsFromMysql, hydrateSpawnTemplatesFromMysql } from "../src/mysql.js";
import { CARDS } from "../src/game/cards.js";

describe("content fallback", () => {
  it("cards: full 108-card roster with catalog stats", async () => {
    const { cards, source } = await getContentCards();
    assert.ok(["mysql", "local"].includes(source));
    assert.equal(cards.length, 108);
    const names = cards.map((c) => c.name).sort();
    assert.ok(names.includes("knight") && names.includes("zap") && names.includes("golem"));
    for (const c of cards) assert.ok(c.elixir >= 0 && c.elixir <= 8, `${c.name} cost ${c.elixir}`);
  });

  it("sprites: 12 metadata rows, no binaries", async () => {
    const { sprites } = await getContentSprites();
    assert.equal(sprites.length, 12);
    for (const s of sprites) assert.ok(!s.artPath.endsWith(".png") || s.artPath.includes("placeholder"));
  });

  it("menus: 7 items incl Battle/Deck/Leaderboard", async () => {
    const { menus } = await getContentMenus();
    assert.equal(menus.length, 7);
    const labels = menus.map((m) => m.label);
    assert.ok(labels.includes("Battle") && labels.includes("Deck") && labels.includes("Leaderboard"));
  });

  it("catalog: every entry is playable and has engine stats", async () => {
    const { catalog, source } = await getCatalog();
    assert.equal(catalog.length, 108);
    // All cards are playable now -> every catalog entry resolves in CARDS.
    const playable = catalog.filter((c) => c.playable);
    assert.equal(playable.length, catalog.length, "every catalog card must be playable");
    for (const c of catalog) {
      assert.ok(CARDS[c.name] !== undefined, `${c.name} missing from the engine card table`);
    }
    if (source === "mysql") {
      assert.ok(catalog.length >= 100, `mysql catalog ${catalog.length}`);
      const names = catalog.map((c) => c.name);
      for (const n of ["hog-rider", "miner", "mega-knight", "the-log", "graveyard", "golem"]) {
        assert.ok(names.includes(n), n);
      }
    }
  });

  it("card table: >=108 defs, each with hp/damage sane for its type", () => {
    const all = Object.values(CARDS);
    assert.equal(all.length, 108);
    const ids = new Set<string>();
    for (const c of all) {
      assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
      ids.add(c.id);
      assert.ok(c.cost >= 0 && c.cost <= 8, `${c.id} cost ${c.cost}`);
      if (c.type === "spell") {
        assert.ok(c.damage > 0, `${c.id} spell damage`);
      } else {
        assert.ok(c.hp > 0 && c.count > 0, `${c.id} troop hp/count`);
      }
    }
  });

  it("mechanics: every catalog row has a database/seed mechanic record", async () => {
    const loaded = await hydrateMechanicsFromMysql();
    assert.equal(loaded.loaded, 108);
    assert.ok((await hydrateSpawnTemplatesFromMysql()).loaded > 0);
    const data = await getCardMechanicsContent();
    assert.equal(data.mechanics.length, 108);
    const fireball = data.mechanics.find((row) => row.cardId === "fireball");
    assert.ok(fireball);
    assert.equal(fireball.mechanics.onDeploy?.[0]?.kind, "areaDamage");
  });
});
