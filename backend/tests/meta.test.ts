// Meta tests: auth + profile + leaderboard + deck + match report (memory fallback).
// O(1) per case except leaderboard sort. Run: npm test (tsx --test).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mintGuestToken, verifyToken } from "../src/auth.js";
import { leaderboard, recordMatch, resetMemory, upsertUser, saveDeck } from "../src/db.js";

describe("auth token", () => {
  it("mint/verify round-trips O(1)", () => {
    const t = mintGuestToken("alice");
    assert.equal(verifyToken(t), "alice");
    assert.equal(verifyToken("!!!"), null);
  });
});

describe("persistence fallback", () => {
  it("guest upsert + deck + leaderboard + match report", async () => {
    resetMemory();
    const u = await upsertUser("bob");
    assert.equal(u.trophies, 0);
    const d = await saveDeck("bob", ["knight", "archers", "giant", "skeletons", "musketeer", "baby-dragon", "fireball", "cannon"]);
    assert.equal(d.cards.length, 8);
    await recordMatch({ blueId: "bob", redId: "alice", blueCrowns: 3, redCrowns: 0, winner: "blue" });
    const lb = await leaderboard(10);
    assert.ok(lb.find((r) => r.playerId === "bob" && r.wins === 1));
  });
});
