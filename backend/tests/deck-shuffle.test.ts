import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, matchDeckOrder, playCard } from "../src/game/engine.js";

const DECK = ["knight", "archers", "musketeer", "fireball", "zap", "giant", "skeletons", "cannon"];

/**
 * Phase 14 follow-up — the opening hand must be randomized per match.
 *
 * Previously `hands[side]` was always `deck.slice(0, 4)`, so every match began
 * with the same four cards. The order is now shuffled, seeded from the match id
 * so the authoritative server and every client agree without extra traffic.
 */
describe("match-start deck randomization", () => {
  it("shuffles deterministically for a given match id", () => {
    const a = matchDeckOrder(DECK, "match-1", "blue");
    const b = matchDeckOrder(DECK, "match-1", "blue");
    assert.deepEqual(a, b, "same match id must reproduce the same order");
    assert.deepEqual(a.slice().sort(), DECK.slice().sort(), "must be a permutation");
  });

  it("gives different matches different orders", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 60; i++) {
      orders.add(matchDeckOrder(DECK, `match-${i}`, "blue").join(","));
    }
    assert.ok(orders.size > 1, "different match ids must produce different orders");
  });

  it("gives the two sides independent orders for the same match", () => {
    const blue = matchDeckOrder(DECK, "match-x", "blue");
    const red = matchDeckOrder(DECK, "match-x", "red");
    assert.notEqual(blue.join(","), red.join(","), "sides must not share one shuffle");
  });

  it("does not always deal the first four deck cards", () => {
    let changed = 0;
    for (let i = 0; i < 60; i++) {
      const order = matchDeckOrder(DECK, `m${i}`, "blue");
      if (order.slice(0, 4).join(",") !== DECK.slice(0, 4).join(",")) changed++;
    }
    assert.ok(changed > 50, `opening hand should vary, only ${changed}/60 differed`);
  });

  it("splits the shuffled order into a 4-card hand and a 4-card queue", () => {
    const state = createGame("shuffle-split", DECK, DECK);
    assert.equal(state.hands.blue.length, 4);
    assert.equal(state.queue.blue.length, 4);
    assert.equal(state.hands.red.length, 4);
    assert.equal(state.queue.red.length, 4);
    // Hand + queue is exactly the deck, with nothing lost or duplicated.
    assert.deepEqual(
      [...state.hands.blue, ...state.queue.blue].slice().sort(),
      DECK.slice().sort(),
    );
    assert.deepEqual(
      [...state.hands.red, ...state.queue.red].slice().sort(),
      DECK.slice().sort(),
    );
  });

  it("keeps the cycle consistent: playing draws from the shuffled queue", () => {
    const state = createGame("shuffle-cycle", DECK, DECK);
    const slot = state.hands.blue.indexOf("skeletons");
    assert.notEqual(slot, -1, "skeletons must start in the opening hand for this check");

    const queuedBefore = state.queue.blue.slice();
    const handBefore = state.hands.blue.slice();
    state.elixir.blue = 10;

    const result = playCard(state, "blue", { handIndex: slot, x: 9, y: 5 });
    assert.equal(result.ok, true);

    // Queue head fills the played slot; the played card goes to the back; every
    // other hand slot is untouched.
    assert.equal(state.hands.blue[slot], queuedBefore[0]);
    assert.deepEqual(state.queue.blue, [...queuedBefore.slice(1), handBefore[slot]]);
    for (let i = 0; i < state.hands.blue.length; i++) {
      if (i !== slot) assert.equal(state.hands.blue[i], handBefore[i]);
    }
  });
});