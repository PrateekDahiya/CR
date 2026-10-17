// Content tests: MySQL-or-local fallback shapes (no live DB required).
// O(c)/O(m) reads. Run: npm test (tsx --test).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCatalog, getContentCards, getContentMenus, getContentSprites } from "../src/mysql.js";

describe("content fallback", () => {
  it("cards: 12 same-name roster with elixir 1-6", async () => {
    const { cards, source } = await getContentCards();
    assert.equal(cards.length, 12);
    assert.ok(["mysql", "local"].includes(source));
    const names = cards.map((c) => c.name).sort();
    assert.ok(names.includes("knight") && names.includes("zap") && names.includes("rock-golem"));
    for (const c of cards) assert.ok(c.elixir >= 1 && c.elixir <= 6);
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

  it("catalog: >=12 entries, 12 playable (108 incl hog-rider/miner when mysql live)", async () => {
    const { catalog, source } = await getCatalog();
    assert.ok(catalog.length >= 12);
    const playable = catalog.filter((c) => c.playable);
    assert.equal(playable.length, 12);
    if (source === "mysql") {
      assert.ok(catalog.length >= 100, `mysql catalog ${catalog.length}`);
      const names = catalog.map((c) => c.name);
      for (const n of ["hog-rider", "miner", "mega-knight", "the-log", "graveyard", "golem"]) assert.ok(names.includes(n), n);
    }
  });
});
