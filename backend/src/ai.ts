/**
 * ai.ts — server-side bot opponent for practice matches.
 *
 * The AI microservice (FastAPI, :8000) owns the decision making
 * (POST /bot/move); this module is the thin adapter that feeds it authoritative
 * room state and applies the answer as a normal, fully validated card play.
 *
 * If the AI service is unreachable we fall back to a local greedy heuristic so
 * a match is ALWAYS playable (never a frozen opponent).
 *
 * Perf: one move request per think tick (default 1.1s). Each call is O(h+t+u)
 * server-side plus one O(h) hand resolve here; no allocation-heavy loops.
 */

import type { Server } from "socket.io";
import { applyEnginePlay, getHand, type PlayerSide, type Room } from "./net/rooms.js";
import { CARDS } from "./game/cards.js";
import { generateBotDeck, cardTags, cardHasRole } from "./game/botDeck.js";

export interface BotMove {
  card: string;
  handIndex: number;
  x: number;
  y: number;
}

const DEFAULT_AI_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";

/**
 * Bot decks are generated per match from the real catalog and the shared role
 * table (see game/botDeck.ts). The old three-deck hardcoded list is gone.
 */
export function pickBotDeck(): string[] {
  return generateBotDeck().deck;
}

/**
 * Fresh AI deck for this match. Each match gets its own generated deck, and
 * when a previous deck is supplied the generator avoids repeating it verbatim.
 * O(1) amortised: the search is bounded by `maxNodes`.
 */
export function botDeckFor(matchId: string, previous?: readonly string[]): string[] {
  let h = 0;
  for (let i = 0; i < matchId.length; i += 1) {
    h = (h * 31 + matchId.charCodeAt(i)) >>> 0;
  }
  // Seed only the attempt ordering, so two matches do not correlate, while the
  // deck itself still comes from the constrained search.
  const result =
    previous === undefined
      ? generateBotDeck()
      : generateBotDeck({ avoidOrdered: previous });
  if (result.ok && result.deck.length === 8) return result.deck;
  void h;
  throw new Error(`AI deck generation failed for match ${matchId}: ${result.problems.join("; ")}`);
}

/**
 * Context-aware fallback decision (Phase 14).
 *
 * Scores only cards that are actually in hand, affordable, and legally
 * deployable, using the shared role table plus live battlefield state:
 *   tank killer vs a big enemy tank, splash vs clustered units, anti-air vs
 *   flying units, defensive building vs an incoming win condition, small spell
 *   vs a cheap swarm, big spell on high-value targets, support behind a push,
 *   and keeping a small elixir reserve when nothing urgent is happening.
 *
 * Controlled randomness keeps matches from being identical; when nothing
 * sensible is affordable it returns null and the AI waits for the next tick.
 * O(h·u + t).
 */
function fallbackMove(room: Room, side: PlayerSide): BotMove | null {
  const hand = getHand(room, side);
  const elixir = room.state.elixir[side];
  const units = room.state.units;
  const forward = side === "blue" ? 1 : -1;
  const ownTower = room.state.towers.find((tower) => tower.owner === side);
  const homeRow = ownTower?.position.y ?? (side === "blue" ? 3.5 : 27.5);

  // --- read the battlefield once (O(u^2) worst case, u<=40) ---
  let enemyTank: { hp: number; x: number; y: number } | null = null;
  let enemyAir: { x: number; y: number } | null = null;
  let enemyWinCondition: { x: number; y: number; cost: number } | null = null;
  let cheapestEnemy = Infinity;
  let clustered = 0;
  let enemySwarmCount = 0;

  for (const unit of units) {
    if (unit.hitPoints <= 0 || unit.owner === side) continue;
    const cost = COSTS[unit.cardId] ?? 0;
    const x = unit.position.x;
    const y = unit.position.y;
    if (cost < cheapestEnemy) cheapestEnemy = cost;
    if (cardHasRole(unit.cardId, "air_unit")) enemyAir = { x, y };
    if (cardHasRole(unit.cardId, "tank") && (enemyTank === null || unit.hitPoints > enemyTank.hp)) {
      enemyTank = { hp: unit.hitPoints, x, y };
    }
    if (cardHasRole(unit.cardId, "win_condition") && (y - homeRow) * forward > 0) {
      if (enemyWinCondition === null || cost > enemyWinCondition.cost) {
        enemyWinCondition = { x, y, cost };
      }
    }
    for (const other of units) {
      if (other.id === unit.id || other.owner === side || other.hitPoints <= 0) continue;
      const dx = other.position.x - x;
      const dy = other.position.y - y;
      if (dx * dx + dy * dy <= 4) clustered++;
    }
    if (cardHasRole(unit.cardId, "swarm")) enemySwarmCount++;
  }

  type Scored = { card: string; index: number; score: number; x: number; y: number };
  const scored: Scored[] = [];

  for (let i = 0; i < hand.length; i += 1) {
    const cardId = hand[i] as string;
    const card = CARD_BY_ID[cardId];
    if (card === undefined) continue;
    if (card.cost > elixir) continue; // never plays what it cannot afford

    const tags = tagsOf(cardId);
    let score = 1;
    let lane = Math.random() < 0.5 ? 3.5 : 13.5;
    // Deploy rows: troops just behind our own river edge; spells/buildings vary.
    let row = side === "blue" ? 13 : 18;

    // --- reactive answers ---
    if (enemyTank !== null && card.type !== "spell" && tags.includes("tank_killer")) score += 9;
    if (enemyTank !== null && tags.includes("high_single_target_dps")) score += 5;
    if (enemyAir !== null && card.type !== "spell" && tags.includes("anti_air")) {
      score += 10;
      lane = enemyAir.x < 9 ? 3.5 : 13.5;
      row = Math.max(9, Math.min(23, enemyAir.y - forward * 2));
    }
    if (clustered >= 2 && tags.includes("splash")) score += 7;
    if (enemySwarmCount >= 3 && card.type === "spell" && tags.includes("small_spell")) score += 6;
    if (card.type === "spell" && tags.includes("big_spell")) {
      // Worth it against valuable targets, not against one cheap troop.
      score += cheapestEnemy >= 3 || clustered >= 2 ? 5 : -1;
    }
    if (enemyWinCondition !== null && tags.includes("defensive")) {
      score += 8;
      lane = enemyWinCondition.x < 9 ? 3.5 : 13.5;
      row = Math.max(9, Math.min(23, enemyWinCondition.y - forward * 2));
    }
    if (card.type === "building" && tags.includes("defensive") && enemyWinCondition !== null) score += 6;

    // --- proactive pushes ---
    if (tags.includes("win_condition") && enemyTank === null && enemyAir === null) score += 6;
    if (tags.includes("support") && enemyTank !== null) score += 4;
    if (tags.includes("tank") && enemyTank === null) score += 3;

    // --- elixir discipline: keep a reserve unless the play is urgent ---
    const urgent = enemyAir !== null || enemyWinCondition !== null || enemyTank !== null;
    if (!urgent && elixir - card.cost < 1) score -= 3;

    // Small controlled randomness so matches are not identical.
    score += Math.random() * 2.5;

    if (card.type === "spell") {
      // Spells target the densest/most valuable point rather than a deploy row.
      const target = enemyTank ?? enemyWinCondition;
      row = target !== null ? target.y : side === "blue" ? 24 : 7;
      lane = target !== null ? target.x : 3.5;
    } else if (card.type === "building" && tags.includes("defensive")) {
      row = side === "blue" ? 12.5 : 19.5;
    }

    scored.push({ card: cardId, index: i, score, x: lane, y: row });
  }

  if (scored.length === 0) return null; // nothing affordable/legible: wait
  scored.sort((a, b) => b.score - a.score);
  const choice = scored[0] as Scored;
  if (choice.score <= 0) return null;
  return { card: choice.card, handIndex: choice.index, x: choice.x, y: choice.y };
}

// Cost table from the canonical engine card set (108 cards) — no import cycle.
// O(1) build, O(1) lookup.
const COSTS: Record<string, number> = Object.fromEntries(
  Object.values(CARDS).map((c) => [c.id, c.cost]),
);

const CARD_BY_ID: Record<string, { id: string; type: string; cost: number }> = Object.fromEntries(
  Object.values(CARDS).map((c) => [c.id, { id: c.id, type: c.type, cost: c.cost }]),
);

/** Role tags for a card, from the same shared table the deck generator uses. */
function tagsOf(cardId: string): readonly string[] {
  return cardTags(cardId);
}

export function costOf(cardId: string): number | null {
  return COSTS[cardId] ?? null;
}

function toHandPayload(room: Room, side: PlayerSide): Array<{ card: string; handIndex: number; cost: number }> {
  const hand = getHand(room, side);
  const out: Array<{ card: string; handIndex: number; cost: number }> = [];
  for (let i = 0; i < hand.length; i += 1) {
    const card = hand[i] as string;
    out.push({ card, handIndex: i, cost: COSTS[card] ?? 0 });
  }
  return out;
}

/**
 * Ask the AI service for a move; falls back to the local heuristic.
 * O(h+t+u) payload build + one HTTP round trip. Never throws.
 */
export async function requestBotMove(
  room: Room,
  side: PlayerSide,
  difficulty: string,
): Promise<BotMove | null> {
  const hand = toHandPayload(room, side);
  if (hand.length === 0) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${DEFAULT_AI_URL}/bot/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        difficulty,
        game_state: room.state,
        hand,
        elixir: room.state.elixir[side],
        side,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return fallbackMove(room, side);
    const data = (await res.json()) as { card?: string; handIndex?: number; x?: number; y?: number };
    const idx = typeof data.handIndex === "number" ? data.handIndex : -1;
    const card = typeof data.card === "string" ? data.card : hand[0]?.card;
    if (card === undefined || idx < 0 || idx >= hand.length) return fallbackMove(room, side);
    return {
      card,
      handIndex: idx,
      x: typeof data.x === "number" ? data.x : 9,
      y: typeof data.y === "number" ? data.y : 18,
    };
  } catch {
    return fallbackMove(room, side);
  } finally {
    clearTimeout(timer);
  }
}

const BOT_THINK_MS = 700;
const timers = new Map<string, ReturnType<typeof setInterval>>();

/** Cheapest card currently in the bot's hand (O(h)); 0 when the hand is empty. */
function cheapestInHand(room: Room, side: PlayerSide): number {
  const hand = getHand(room, side);
  let min = 99;
  for (let i = 0; i < hand.length; i += 1) {
    const c = COSTS[hand[i] as string];
    if (c !== undefined && c < min) min = c;
  }
  return min;
}

/**
 * Start the bot brain for a room. Idempotent per matchId. The interval only
 * asks for a move; the engine's own 10Hz loop keeps simulating.
 */
export function startBotLoop(io: Server, room: Room, difficulty = "medium"): void {
  if (timers.has(room.matchId)) return;
  const botSide: PlayerSide = "red";
  const tick = setInterval(() => {
    void (async () => {
      const current = getRoomSafe(room.matchId);
      if (current === undefined || current.state.winner !== undefined) {
        stopBotLoop(room.matchId);
        return;
      }
      const minCost = cheapestInHand(current, botSide);
      // Cheap guard: never burn an AI call when nothing is affordable yet.
      if (minCost === 99 || current.state.elixir[botSide] < minCost) return;
      const move = await requestBotMove(current, botSide, difficulty);
      if (move === null) return;
      const played = applyEnginePlay(
        current,
        botSide,
        move.handIndex,
        move.x,
        move.y,
        move.card,
        current.matchId,
        "bot",
      );
      if (played.ok) {
        io.to(current.matchId).emit("bot:played", {
          matchId: current.matchId,
          card: move.card,
          side: botSide,
        });
      }
    })();
  }, BOT_THINK_MS);
  (tick as unknown as { unref?: () => void }).unref?.();
  timers.set(room.matchId, tick);
}

export function stopBotLoop(matchId: string): void {
  const t = timers.get(matchId);
  if (t !== undefined) {
    clearInterval(t);
    timers.delete(matchId);
  }
}

export function stopAllBotLoops(): void {
  for (const id of [...timers.keys()]) stopBotLoop(id);
}

// Imported lazily to avoid a cycle (rooms -> ai -> rooms).
import { getRoom } from "./net/rooms.js";
function getRoomSafe(matchId: string): Room | undefined {
  return getRoom(matchId);
}
