import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isAdminUsername } from "../src/accounts.js";
import {
  adminUpdatePlayer,
  ensurePlayer,
  getAdminStats,
  listAdminPlayers,
  resetPlayers,
} from "../src/players.js";

describe("admin dashboard data", () => {
  beforeEach(() => resetPlayers());

  it("treats dahiya27 as an admin by default", () => {
    assert.equal(isAdminUsername("dahiya27"), true);
    assert.equal(isAdminUsername("someone-else"), false);
  });

  it("updates wallet and trophies with non-negative values", () => {
    ensurePlayer("admin-target");
    const updated = adminUpdatePlayer("admin-target", { coins: 50_000, gems: 300, trophies: 1200 });
    assert.ok(updated);
    assert.equal(updated.coins, 50_000);
    assert.equal(updated.gems, 300);
    assert.equal(updated.trophies, 1200);

    const clamped = adminUpdatePlayer("admin-target", { coins: -5, gems: -1, trophies: -20 });
    assert.ok(clamped);
    assert.equal(clamped.coins, 0);
    assert.equal(clamped.gems, 0);
    assert.equal(clamped.trophies, 0);
  });

  it("reports totals and sorted player rows", () => {
    const a = ensurePlayer("admin-a");
    a.coins = 1000;
    a.gems = 10;
    a.trophies = 500;
    a.createdAtMs = Date.now();
    a.lastSeenMs = Date.now();
    const b = ensurePlayer("admin-b");
    b.coins = 2000;
    b.gems = 20;
    b.trophies = 700;
    b.createdAtMs = Date.now();
    b.lastSeenMs = Date.now();

    const stats = getAdminStats();
    assert.equal(stats.totalUsers, 2);
    assert.equal(stats.activeToday, 2);
    assert.equal(stats.newToday, 2);
    assert.equal(stats.totalCoins, 3000);
    assert.equal(stats.totalGems, 30);
    assert.equal(stats.topPlayers[0]?.playerId, "admin-b");

    const rows = listAdminPlayers();
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.trophies, 700);
  });

  it("returns null for an unknown player", () => {
    assert.equal(adminUpdatePlayer("missing", { coins: 1 }), null);
  });
});
