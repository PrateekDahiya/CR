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

/**
 * Deterministic PRNG for match-start shuffling.
 *
 * The authoritative server and every client must derive the SAME opening hand
 * without an extra network message, so the shuffle is seeded from the match id
 * rather than `Math.random()`. Different matches produce different orders;
 * replaying one match id reproduces it exactly.
 */
export function matchRandom(matchId: string, side: string): () => number {
  let state = 2166136261 >>> 0;
  const key = `${matchId}:${side}`;
  for (let i = 0; i < key.length; i += 1) {
    state ^= key.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The opening hand + queue for a match: the deck in a per-match random order,
 * so the four starting cards are NOT always the first four in deck order.
 */
export function matchCycle(deck: readonly string[], matchId: string, side: string): {
  hand: string[];
  queue: string[];
  order: string[];
} {
  const order = shuffleDeck(deck, matchRandom(matchId, side));
  return {
    hand: order.slice(0, HAND_SIZE),
    queue: order.slice(HAND_SIZE),
    order,
  };
}

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