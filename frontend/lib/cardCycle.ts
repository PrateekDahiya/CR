/**
 * frontend/lib/cardCycle.ts — the one 8-card cycle implementation (Phase 14).
 *
 * A standard Clash Royale deck is eight cards: four in hand, four waiting in a
 * draw queue. Playing a card moves the queue's front card into that hand slot
 * and sends the played card to the back of the queue, so a played card returns
 * after the other four have been played.
 *
 * This module is deliberately framework-free and is the only place cycle rules
 * live. The battle hook keeps an optimistic copy for responsiveness; the
 * authoritative server applies the identical rule. Nothing here may advance the
 * cycle on a rejected play — callers simply do not call `playCard`.
 */

export const HAND_SIZE = 4;

export type CardCycleState = Readonly<{
  hand: readonly string[];
  queue: readonly string[];
}>;

/** Split a deck into an opening hand and queue, shuffling when asked. */
export function createCycle(
  deck: readonly string[],
  random: () => number = Math.random,
  shuffle = true,
): { hand: string[]; queue: string[] } {
  const ordered = shuffle ? shuffleDeck(deck, random) : deck.slice();
  return {
    hand: ordered.slice(0, HAND_SIZE),
    queue: ordered.slice(HAND_SIZE),
  };
}

export function shuffleDeck(deck: readonly string[], random: () => number): string[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

/**
 * Rotate the cycle after a SUCCESSFUL play.
 *
 * Returns a new state; the input is never mutated. If the queue is empty the
 * hand is returned unchanged (defensive: an 8-card deck always has a queue).
 */
export function rotateCard(
  state: CardCycleState,
  handIndex: number,
): { hand: string[]; queue: string[]; played: string | null } {
  const hand = state.hand.slice();
  if (handIndex < 0 || handIndex >= hand.length) {
    return { hand, queue: state.queue.slice(), played: null };
  }
  const played = hand[handIndex] as string;
  const queue = state.queue.slice();
  const drawn = queue.shift();
  if (drawn === undefined) {
    // No card to draw: keep the play but do not duplicate the played card.
    return { hand, queue, played };
  }
  hand[handIndex] = drawn;
  queue.push(played);
  return { hand, queue, played };
}

/** How many further plays before a card played now comes back around. */
export function cycleDistance(state: CardCycleState): number {
  return state.queue.length;
}

/** The card that will be drawn into `handIndex` next. */
export function nextCard(state: CardCycleState, handIndex = 0): string | null {
  if (handIndex < 0 || handIndex >= state.hand.length) return null;
  return state.queue[0] ?? null;
}

export function sameCycle(a: CardCycleState, b: CardCycleState): boolean {
  return a.hand.join(",") === b.hand.join(",") && a.queue.join(",") === b.queue.join(",");
}