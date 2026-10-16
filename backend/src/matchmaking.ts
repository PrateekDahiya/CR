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

export interface QueuedPlayer {
  socketId: string;
  playerId: string;
  deck: string[];
  joinedAt: number;
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
): { position: number; size: number } {
  const existing = queue.findIndex((p) => p.playerId === playerId || p.socketId === socketId);
  if (existing === -1) {
    queue.push({ socketId, playerId, deck: [...deck], joinedAt: Date.now() });
  } else {
    // Re-join on the same socket refreshes routing; longest wait is kept.
    queue[existing].socketId = socketId;
    if (deck.length > 0) {
      queue[existing].deck = [...deck];
    }
  }
  const position = queue.findIndex((p) => p.playerId === playerId) + 1;
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
  const blue = queue.shift() as QueuedPlayer;
  const red = queue.shift() as QueuedPlayer;
  const matchId = newMatchId();
  createRoom(
    matchId,
    { playerId: blue.playerId, socketId: blue.socketId, deck: blue.deck },
    { playerId: red.playerId, socketId: red.socketId, deck: red.deck },
  );
  return { matchId, blue, red };
}
