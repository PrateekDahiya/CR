import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeBotMove } from "../src/ai.js";

const HAND = [
  { card: "barbarian-hut", handIndex: 0, cost: 6 },
  { card: "bats", handIndex: 1, cost: 2 },
  { card: "bomber", handIndex: 2, cost: 2 },
  { card: "monk", handIndex: 3, cost: 5 },
];

describe("AI move normalization", () => {
  it("uses the authoritative hand slot instead of a stale card name", () => {
    const move = normalizeBotMove(HAND, { card: "knight", handIndex: 1, x: 3.5, y: 19 });
    assert.ok(move);
    assert.equal(move.card, "bats");
    assert.equal(move.handIndex, 1);
  });

  it("rejects an out-of-range hand index", () => {
    assert.equal(normalizeBotMove(HAND, { card: "bats", handIndex: 9 }), null);
    assert.equal(normalizeBotMove(HAND, { card: "bats" }), null);
  });
});
