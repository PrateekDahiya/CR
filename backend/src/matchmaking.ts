/**
 * matchmaking stub (Phase 1 scaffolding).
 *
 * In-memory FIFO queue for 1v1 matchmaking.
 * Phase 3 will replace/augment with Redis-backed queue + authoritative
 * match creation + tick loop. No persistence, no timers here — just
 * join/leave primitives the socket layer can call later.
 */

export interface QueuedPlayer {
  socketId: string;
  joinedAt: number;
}

const queue: QueuedPlayer[] = [];

export function joinQueue(socketId: string): { position: number; size: number } {
  const existing = queue.findIndex((p) => p.socketId === socketId);
  if (existing === -1) {
    queue.push({ socketId, joinedAt: Date.now() });
  }
  const position = queue.findIndex((p) => p.socketId === socketId) + 1;
  return { position, size: queue.length };
}

export function leaveQueue(socketId: string): { removed: boolean; size: number } {
  const idx = queue.findIndex((p) => p.socketId === socketId);
  if (idx === -1) {
    return { removed: false, size: queue.length };
  }
  queue.splice(idx, 1);
  return { removed: true, size: queue.length };
}

export function queueSize(): number {
  return queue.length;
}

export function clearQueue(): void {
  queue.length = 0;
}
