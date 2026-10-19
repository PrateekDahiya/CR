import assert from "node:assert/strict";
import { playCard, tickGame } from "../src/game/engine.js";
import type { EngineState, PlayerSide } from "../src/game/engine.js";
import { CARDS } from "../src/game/cards.js";

const COST = Object.fromEntries(Object.values(CARDS).map((c) => [c.id, c.cost]));

function deployPoint(side: PlayerSide): { x: number; y: number } {
  return side === "blue" ? { x: 9, y: 5 } : { x: 9, y: 26 };
}

/**
 * Phase 14: the opening hand is shuffled per match, so a card the test needs
 * may start in the draw queue. Play affordable cards until it reaches the hand,
 * then return its slot. Mirrors what a real player does.
 */
export function bringToHand(state: EngineState, side: PlayerSide, cardId: string): number {
  const existing = state.hands[side].indexOf(cardId);
  if (existing !== -1) return existing;

  for (let attempt = 0; attempt < 8; attempt++) {
    if (state.over) break;
    const slot = state.hands[side].indexOf(cardId);
    if (slot !== -1) return slot;

    // Cycle the cheapest affordable card; every play draws the next one.
    let bestSlot = -1;
    let bestCost = Infinity;
    for (let i = 0; i < state.hands[side].length; i += 1) {
      const id = state.hands[side][i] as string;
      const cost = COST[id] ?? 99;
      if (cost < bestCost) {
        bestCost = cost;
        bestSlot = i;
      }
    }
    if (bestSlot === -1) break;
    state.elixir[side] = Math.max(state.elixir[side], bestCost);
    const played = playCard(state, side, { handIndex: bestSlot, ...deployPoint(side) });
    if (!played.ok) break;
    // Let spawned troops resolve so they do not interfere with later assertions.
    if (state.hands[side].indexOf(cardId) !== -1) break;
  }

  const slot = state.hands[side].indexOf(cardId);
  assert.ok(slot !== -1, `${side} could not draw "${cardId}" into hand (${state.hands[side].join(",")})`);
  return slot;
}

/** Play a card by id, cycling the queue first when necessary. */
export function playById(
  state: EngineState,
  side: PlayerSide,
  cardId: string,
  at: { x: number; y: number },
): boolean {
  const slot = bringToHand(state, side, cardId);
  state.elixir[side] = 10;
  const result = playCard(state, side, { handIndex: slot, ...at });
  return result.ok;
}

/**
 * Force a card into hand with NO side effects (no elixir spent, nothing
 * spawned). Mechanics tests need a clean board and a known slot, so they use
 * this instead of `bringToHand`.
 */
export function forceInHand(state: EngineState, side: PlayerSide, cardId: string): number {
  const slot = state.hands[side].indexOf(cardId);
  if (slot !== -1) return slot;
  const displaced = state.hands[side][0] as string | undefined;
  if (displaced !== undefined && displaced !== cardId) {
    state.queue[side].push(displaced);
  }
  state.hands[side][0] = cardId;
  return 0;
}

export { tickGame };