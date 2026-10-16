/**
 * net/redis — Redis pub/sub + ephemeral state with in-memory fallback.
 *
 * Uses the `redis` package (already a backend dependency). When REDIS_URL is
 * missing or the connection fails, everything degrades to process-local
 * memory so the authoritative tick loop and matchmaking keep working in dev
 * and single-instance deploys. Multi-instance fan-out needs REDIS_URL set.
 */

import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connected = false;
let initAttempted = false;

const memorySnapshots = new Map<string, string>();
const memoryOps = new Map<string, unknown[]>();

function stateKey(matchId: string): string {
  return `match:${matchId}:state`;
}

function snapshotKey(matchId: string): string {
  return `match:${matchId}:snapshot`;
}

function opsKey(matchId: string): string {
  return `match:${matchId}:ops`;
}

/** Connect once at server startup. Never throws — falls back to memory. */
export async function initRedis(): Promise<void> {
  if (initAttempted) {
    return;
  }
  initAttempted = true;
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("[redis] REDIS_URL missing — using in-memory fallback");
    return;
  }
  try {
    client = createClient({ url });
    client.on("error", (err) => {
      console.warn(`[redis] client error, falling back to memory: ${String(err)}`);
      connected = false;
    });
    await client.connect();
    connected = true;
    console.log("[redis] connected");
  } catch (err) {
    console.warn(`[redis] connect failed, using in-memory fallback: ${String(err)}`);
    client = null;
    connected = false;
  }
}

export function isRedisConnected(): boolean {
  return connected;
}

/**
 * Publish a 10Hz snapshot for fan-out + cache the latest as ephemeral state
 * (300s TTL). Falls back to the process-local map when Redis is down.
 */
export async function publishState(matchId: string, state: unknown): Promise<void> {
  const payload = JSON.stringify(state);
  if (connected && client !== null) {
    try {
      await client.publish(stateKey(matchId), payload);
      await client.setEx(snapshotKey(matchId), 300, payload);
      return;
    } catch (err) {
      console.warn(`[redis] publish failed, caching in memory: ${String(err)}`);
      connected = false;
    }
  }
  memorySnapshots.set(matchId, payload);
}

/** Latest cached snapshot (Redis ephemeral key, else memory fallback). */
export async function getCachedState(matchId: string): Promise<string | null> {
  if (connected && client !== null) {
    try {
      const hit = await client.get(snapshotKey(matchId));
      if (hit !== null) {
        return hit;
      }
    } catch (err) {
      console.warn(`[redis] snapshot read failed: ${String(err)}`);
      connected = false;
    }
  }
  return memorySnapshots.get(matchId) ?? null;
}

/** Queue an accepted op for audit/replay consumers (Phase 6 balance hook). */
export async function queueOp(matchId: string, op: unknown): Promise<void> {
  if (connected && client !== null) {
    try {
      await client.rPush(opsKey(matchId), JSON.stringify(op));
      return;
    } catch (err) {
      console.warn(`[redis] op queue failed, buffering in memory: ${String(err)}`);
      connected = false;
    }
  }
  const buf = memoryOps.get(matchId) ?? [];
  buf.push(op);
  memoryOps.set(matchId, buf);
}

/** Buffered ops (test/fallback inspection only). */
export function getMemoryOps(matchId: string): readonly unknown[] {
  return memoryOps.get(matchId) ?? [];
}

/** Graceful shutdown hook. Safe to call when never connected. */
export async function quitRedis(): Promise<void> {
  if (client !== null) {
    try {
      await client.quit();
    } catch {
      // already disconnected — nothing to do
    }
  }
  client = null;
  connected = false;
}
