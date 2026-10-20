/**
 * matchmaking (Phase 3).
 *
 * In-memory FIFO queue for 1v1 matchmaking. Pairs the two longest-waiting
 * players via tryMatch(), which creates their authoritative room
 * (net/rooms.ts). Redis-backed queueing is a later scaling step; the queue
 * itself stays dependency-free and unit-testable.
 *
 * Backward compatible with the Phase-1 stub: joinQueue(socketId) still
 * works (playerId defaults to socketId, deck defaults to []).
 */

import { createRoom } from "./net/rooms.js";
import { DEFAULT_GAME_MODE_ID } from "./game/modes.js";

export interface QueuedPlayer {
  socketId: string;
  playerId: string;
  deck: string[];
  joinedAt: number;
  levels?: Record<string, number>;
  towerTroopId?: string;
  /** Queue is partitioned by mode: only identical modes are paired. */
  modeId: string;
}

export interface MatchedPair {
  matchId: string;
  blue: QueuedPlayer;
  red: QueuedPlayer;
}

const queue: QueuedPlayer[] = [];

/** Pre-queue deck lock (deck:select persists here; queue:join falls back). */
const decks = new Map<string, string[]>();

export function setDeck(playerId: string, deck: string[]): void {
  decks.set(playerId, [...deck]);
}

export function getDeck(playerId: string): string[] | undefined {
  const deck = decks.get(playerId);
  return deck === undefined ? undefined : [...deck];
}

export function joinQueue(
  socketId: string,
  playerId: string = socketId,
  deck: string[] = [],
  levels?: Record<string, number>,
  towerTroopId?: string,
  modeId: string = DEFAULT_GAME_MODE_ID,
): { position: number; size: number } {
  // Dedupe by SOCKET only. Two tabs (or two machines) can share a playerId, and
  // collapsing them into one queue entry meant the second player could never be
  // paired. Socket is the only thing that identifies a live client.
  const existing = queue.findIndex((p) => p.socketId === socketId);
  if (existing === -1) {
    queue.push({ socketId, playerId, deck: [...deck], joinedAt: Date.now(), levels: levels ? { ...levels } : undefined, towerTroopId, modeId });
  } else {
    // Re-join on the same socket refreshes routing; longest wait is kept.
    queue[existing].socketId = socketId;
    if (deck.length > 0) {
      queue[existing].deck = [...deck];
    }
    if (levels !== undefined) queue[existing].levels = { ...levels };
    if (towerTroopId !== undefined) queue[existing].towerTroopId = towerTroopId;
    // Changing the picker while queued moves this client to that mode queue.
    queue[existing].modeId = modeId;
  }
  const position = queue.findIndex((p) => p.socketId === socketId) + 1;
  return { position, size: queue.length };
}

export function leaveQueue(socketIdOrPlayerId: string): { removed: boolean; size: number } {
  const idx = queue.findIndex(
    (p) => p.socketId === socketIdOrPlayerId || p.playerId === socketIdOrPlayerId,
  );
  if (idx === -1) {
    return { removed: false, size: queue.length };
  }
  queue.splice(idx, 1);
  return { removed: true, size: queue.length };
}

/**
 * Socket-scoped leave. A disconnect must only drop THAT socket's queue entry:
 * a by-playerId leave would pull an unrelated player (same id, other tab) out
 * of the queue. O(q).
 */
export function leaveQueueBySocket(socketId: string): { removed: boolean; size: number } {
  const idx = queue.findIndex((p) => p.socketId === socketId);
  if (idx === -1) {
    return { removed: false, size: queue.length };
  }
  queue.splice(idx, 1);
  return { removed: true, size: queue.length };
}

export function getQueued(playerId: string): QueuedPlayer | undefined {
  return queue.find((p) => p.playerId === playerId);
}

export function queueSnapshot(): QueuedPlayer[] {
  return queue.map((p) => ({ ...p, deck: [...p.deck] }));
}

export function queueSize(): number {
  return queue.length;
}

export function clearQueue(): void {
  queue.length = 0;
}

function newMatchId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Pair the two longest-waiting players into a room. Returns the pair (room
 * is retrievable via getRoom(matchId)) or null when fewer than 2 wait.
 * First queued player takes blue, second takes red.
 */
export function tryMatch(): MatchedPair | null {
  if (queue.length < 2) {
    return null;
  }
  // Queue is partitioned by mode: never pair a Standard player with an
  // Infinite Elixir player. Scan for the longest-waiting compatible pair
  // (O(q^2), q is tiny); remove the second first so indexes stay valid.
  for (let i = 0; i < queue.length; i++) {
    const blue = queue[i] as QueuedPlayer;
    for (let j = i + 1; j < queue.length; j++) {
      const red = queue[j] as QueuedPlayer;
      if (red.modeId !== blue.modeId) continue;
      queue.splice(j, 1);
      queue.splice(i, 1);
      const matchId = newMatchId();
      createRoom(
        matchId,
        { playerId: blue.playerId, socketId: blue.socketId, deck: blue.deck, levels: blue.levels, towerTroopId: blue.towerTroopId },
        { playerId: red.playerId, socketId: red.socketId, deck: red.deck, levels: red.levels, towerTroopId: red.towerTroopId },
        blue.modeId,
      );
      return { matchId, blue, red };
    }
  }
  return null;
}
