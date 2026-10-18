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

export interface BotMove {
  card: string;
  handIndex: number;
  x: number;
  y: number;
}

const DEFAULT_AI_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";

/** Bot decks are built only from engine-known cards (see validation.ts). */
export const BOT_DECKS: string[][] = [
  ["giant", "musketeer", "knight", "archers", "fireball", "arrows", "baby-dragon", "skeletons"],
  ["knight", "archers", "giant", "musketeer", "zap", "arrows", "baby-dragon", "skeletons"],
  ["giant", "mini-pekka", "musketeer", "archers", "fireball", "arrows", "rock-golem", "skeletons"],
];

export function pickBotDeck(): string[] {
  const i = Math.floor(Math.random() * BOT_DECKS.length);
  return [...(BOT_DECKS[i] ?? BOT_DECKS[0])];
}

/** Deterministic-ish deck choice per matchId so replays look stable. O(1). */
export function botDeckFor(matchId: string): string[] {
  let h = 0;
  for (let i = 0; i < matchId.length; i += 1) {
    h = (h * 31 + matchId.charCodeAt(i)) >>> 0;
  }
  return [...(BOT_DECKS[h % BOT_DECKS.length] ?? BOT_DECKS[0])];
}

function fallbackMove(room: Room, side: PlayerSide): BotMove | null {
  const hand = getHand(room, side);
  const elixir = room.state.elixir[side];
  // Cheapest affordable card in hand, dropped just behind the river on a lane.
  let best: { card: string; index: number; cost: number } | null = null;
  for (let i = 0; i < hand.length; i += 1) {
    const card = hand[i] as string;
    const cost = costOf(card);
    if (cost === null || cost > elixir) continue;
    if (best === null || cost < best.cost) best = { card, index: i, cost };
  }
  if (best === null) return null;
  const lane = Math.random() < 0.5 ? 4 : 13;
  const y = side === "blue" ? 13 : 18;
  return { card: best.card, handIndex: best.index, x: lane + Math.random() * 2, y };
}

// Local cost table (mirrors net/validation.ts) so the fallback needs no import cycle.
const COSTS: Record<string, number> = {
  knight: 3,
  archers: 3,
  giant: 5,
  skeletons: 1,
  musketeer: 4,
  "baby-dragon": 4,
  fireball: 4,
  arrows: 3,
  "mini-pekka": 4,
  "rock-golem": 4,
  zap: 2,
  cannon: 3,
};

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