/**
 * net/validation — server-side anti-cheat checks (GAME_DESIGN.md §11).
 *
 * Pure functions + tiny in-memory rate limiters. Every check returns a
 * ValidationResult carrying one of the spec error codes (§12.2):
 * BAD_DECK | NOT_QUEUED | BAD_HAND_INDEX | NO_ELIXIR | BAD_POSITION |
 * CARD_REJECTED | STALE_TICK | RATE_LIMITED.
 *
 * Card allow-list mirrors GAME_DESIGN.md §1 (12 cards, elixir 1-6, max
 * 2 spells/deck). Canonical costs live in the engine's card table
 * (backend/src/game/, engine agent); this table is validation-only and the
 * engine is authoritative on any disagreement (server wins).
 */

export type ValidationCode =
  | "BAD_DECK"
  | "NOT_QUEUED"
  | "BAD_HAND_INDEX"
  | "NO_ELIXIR"
  | "BAD_POSITION"
  | "CARD_REJECTED"
  | "STALE_TICK"
  | "RATE_LIMITED";

export interface ValidationResult {
  ok: boolean;
  code?: ValidationCode;
  message?: string;
}

export type PlayerSide = "blue" | "red";

import { CARDS, isPlayableCard, placementClassOf } from "../game/cards.js";

/**
 * Elixir cost per card id. Derived from the canonical engine table (108 cards)
 * so validation can never drift from what the engine charges.
 * O(1) build once, then O(1) lookups.
 */
export const CARD_COSTS: Record<string, number> = Object.fromEntries(
  Object.values(CARDS).map((c) => [c.id, c.cost]),
);

/** Spell ids from the canonical table (Cannon etc. are buildings, §4). */
const SPELL_IDS = new Set(Object.values(CARDS).filter((c) => c.type === "spell").map((c) => c.id));

/** All playable card ids — O(1) membership test used by deck validation. */
const KNOWN_IDS = new Set(Object.keys(CARD_COSTS).filter(isPlayableCard));

export function isKnownCard(cardId: string): boolean {
  return KNOWN_IDS.has(cardId);
}

export function isSpellCard(cardId: string): boolean {
  return SPELL_IDS.has(cardId);
}

/** Cost from the validation allow-list; null when the id is unknown. */
export function getCardCost(cardId: string): number | null {
  const cost = CARD_COSTS[cardId];
  return typeof cost === "number" ? cost : null;
}

/** Deck rule (§4 + §11): exactly 8 distinct known ids, max 2 spells. */
export function validateDeck(deck: unknown): ValidationResult {
  if (!Array.isArray(deck) || deck.length !== 8) {
    return { ok: false, code: "BAD_DECK", message: "deck must contain exactly 8 cards" };
  }
  if (!deck.every((c): c is string => typeof c === "string")) {
    return { ok: false, code: "BAD_DECK", message: "deck entries must be card id strings" };
  }
  const unknown = deck.find((c) => !KNOWN_IDS.has(c));
  if (unknown !== undefined) {
    return { ok: false, code: "BAD_DECK", message: `unknown card id: ${unknown}` };
  }
  if (new Set(deck).size !== 8) {
    return { ok: false, code: "BAD_DECK", message: "deck must contain 8 distinct cards (no duplicates)" };
  }
  const spells = deck.filter((c) => SPELL_IDS.has(c)).length;
  if (spells > 2) {
    return { ok: false, code: "BAD_DECK", message: "deck allows at most 2 spells" };
  }
  return { ok: true };
}

export interface ValidatedCardLevels {
  ok: true;
  levels: Record<string, number>;
}

/** Validate the optional per-card level map before a match is created. */
export function validateCardLevels(
  levels: unknown,
  deck: readonly string[],
  towerTroopId?: unknown,
): ValidatedCardLevels | ValidationResult {
  const result: Record<string, number> = {};
  if (levels !== undefined && (typeof levels !== "object" || levels === null || Array.isArray(levels))) {
    return { ok: false, code: "BAD_DECK", message: "levels must be an object" };
  }
  const input = (levels ?? {}) as Record<string, unknown>;
  for (const [cardId, value] of Object.entries(input)) {
    if (!deck.includes(cardId) && cardId !== towerTroopId && cardId !== "king-tower") {
      return { ok: false, code: "BAD_DECK", message: `level provided for card outside deck: ${cardId}` };
    }
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 16) {
      return { ok: false, code: "BAD_DECK", message: `invalid level for ${cardId}; expected integer 1..16` };
    }
    result[cardId] = Number(value);
  }
  for (const cardId of deck) result[cardId] ??= 1;
  return { ok: true, levels: result };
}

export function validateTowerTroopId(towerTroopId: unknown): ValidationResult {
  if (towerTroopId === undefined) return { ok: true };
  if (typeof towerTroopId !== "string" || CARDS[towerTroopId]?.type !== "tower") {
    return { ok: false, code: "BAD_DECK", message: "towerTroopId must identify a tower troop" };
  }
  return { ok: true };
}

/** Hand/cooldown check (§11.3): slot 0..3, optional cardId echo must match. */
export function validateHand(
  handIndex: unknown,
  hand: readonly string[],
  cardIdEcho?: unknown,
): ValidationResult {
  if (typeof handIndex !== "number" || !Number.isInteger(handIndex) || handIndex < 0 || handIndex > 3) {
    return { ok: false, code: "BAD_HAND_INDEX", message: "handIndex must be an integer 0..3" };
  }
  if (handIndex >= hand.length || hand[handIndex] === undefined) {
    return { ok: false, code: "BAD_HAND_INDEX", message: "hand slot is empty" };
  }
  if (cardIdEcho !== undefined && cardIdEcho !== hand[handIndex]) {
    return { ok: false, code: "CARD_REJECTED", message: "cardId echo does not match authoritative hand" };
  }
  return { ok: true };
}

/** Elixir check (§11.1) against the server-side float. Costs come from server. */
export function validateElixir(elixir: number, cost: number): ValidationResult {
  if (!Number.isFinite(elixir) || !Number.isFinite(cost)) {
    return { ok: false, code: "NO_ELIXIR", message: "invalid elixir state" };
  }
  if (elixir < cost) {
    return { ok: false, code: "NO_ELIXIR", message: `insufficient elixir (${elixir} < ${cost})` };
  }
  return { ok: true };
}

/** Clock check (§11.4): |clientTick - serverTick| > 5 → STALE_TICK. */
export function validateTick(clientTick: unknown, serverTick: number): ValidationResult {
  if (clientTick === undefined || clientTick === null) {
    return { ok: true };
  }
  if (typeof clientTick !== "number" || !Number.isFinite(clientTick)) {
    return { ok: false, code: "STALE_TICK", message: "clientTick must be a number" };
  }
  if (Math.abs(clientTick - serverTick) > 5) {
    return {
      ok: false,
      code: "STALE_TICK",
      message: `stale tick (client ${clientTick}, server ${serverTick})`,
    };
  }
  return { ok: true };
}

export interface PocketState {
  left: boolean;
  right: boolean;
}

/** Tower centers (§5.4) for the 1x1 deploy-footprint exclusion. */
const TOWER_CENTERS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 9, y: 3.5 },
  { x: 3.5, y: 6.5 },
  { x: 14.5, y: 6.5 },
  { x: 9, y: 27.5 },
  { x: 3.5, y: 24.5 },
  { x: 14.5, y: 24.5 },
];

const FOOTPRINT_RADIUS = 0.75;

/**
 * Position check (§5.3 + §11.2). Spells target anywhere x[0,18] y[0,32].
 * Troops/buildings: Blue y 0-14 (pocket y<=20 on taken lane side),
 * Red y 17-31 (pocket y>=11). River/enemy-half/tower-footprint → reject
 * (no clamping). x<9 is the left lane, x>=9 the right lane.
 *
 * The placement class comes from the card table (`placementClassOf`), the
 * SAME rule the engine uses in `playCard`: the burrowers (the Miner, the
 * Goblin Drill) and the siege buildings (the Mortar, the X-Bow) may be
 * dropped on either half - only the river is off limits for them.
 */
export function validatePosition(
  side: PlayerSide,
  x: unknown,
  y: unknown,
  cardId: string,
  pocket: PocketState = { left: false, right: false },
): ValidationResult {
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, code: "BAD_POSITION", message: "x/y must be finite numbers" };
  }
  if (x < 0 || x > 18 || y < 0 || y > 32) {
    return { ok: false, code: "BAD_POSITION", message: "position outside arena x[0,18] y[0,32]" };
  }
  const placement = placementClassOf(cardId);
  if (placement === "spell") {
    return { ok: true };
  }
  if (y > 14 && y < 17) {
    return { ok: false, code: "BAD_POSITION", message: "cannot deploy on the river" };
  }
  if (placement === "anywhere") {
    // Burrowers and siege buildings travel: either half is legal, the river
    // is not (the tower footprint stays legal too - the engine agrees).
    return { ok: true };
  }
  const lanePocket = (x < 9 ? pocket.left : pocket.right) === true;
  let inZone = false;
  if (side === "blue") {
    inZone = (y >= 0 && y <= 14) || (lanePocket && y >= 0 && y <= 20);
  } else {
    inZone = (y >= 17 && y <= 31) || (lanePocket && y >= 11 && y <= 31);
  }
  if (!inZone) {
    return { ok: false, code: "BAD_POSITION", message: "position outside your deploy zone" };
  }
  const onTower = TOWER_CENTERS.some((t) => Math.hypot(t.x - x, t.y - y) < FOOTPRINT_RADIUS);
  if (onTower) {
    return { ok: false, code: "BAD_POSITION", message: "cannot deploy inside a tower footprint" };
  }
  return { ok: true };
}

// --- Rate limits (§11.4): 5 card:play/s/side sustained, emote 1/5s. ---

const playStamps = new Map<string, number[]>();
const emoteStamps = new Map<string, number>();

const PLAY_BURST = 5;
const PLAY_WINDOW_MS = 1000;
const EMOTE_WINDOW_MS = 5000;

/** Burst cap 5 card:play per rolling second per player. */
export function checkPlayRate(playerId: string, nowMs: number = Date.now()): ValidationResult {
  const stamps = (playStamps.get(playerId) ?? []).filter((t) => nowMs - t < PLAY_WINDOW_MS);
  if (stamps.length >= PLAY_BURST) {
    playStamps.set(playerId, stamps);
    return { ok: false, code: "RATE_LIMITED", message: "too many card plays (5/s cap)" };
  }
  stamps.push(nowMs);
  playStamps.set(playerId, stamps);
  return { ok: true };
}

/** Cosmetic emote throttle: 1 per 5s per player. Never affects simulation. */
export function checkEmoteRate(playerId: string, nowMs: number = Date.now()): ValidationResult {
  const last = emoteStamps.get(playerId);
  if (last !== undefined && nowMs - last < EMOTE_WINDOW_MS) {
    return { ok: false, code: "RATE_LIMITED", message: "emote rate-limited (1 per 5s)" };
  }
  emoteStamps.set(playerId, nowMs);
  return { ok: true };
}

/** Test/room-teardown helper: drop all recorded rate-limit state. */
export function clearRateLimiters(): void {
  playStamps.clear();
  emoteStamps.clear();
}
