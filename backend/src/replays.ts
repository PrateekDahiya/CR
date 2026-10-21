/**
 * backend/src/replays.ts — lightweight match replays (the "Watch" button).
 *
 * The battle log can replay a finished battle: while a match runs, the room
 * samples its authoritative state every REPLAY_INTERVAL_MS and the samples are
 * kept in a bounded in-memory ring. The client replays the frames on the same
 * arena canvas, so "Watch" shows the real battle, not a mock-up.
 *
 * Perf (MEMORY#20):
 * - Sampling is O(u + t) per sample (u = live units <= 40, t = 6 towers) and
 *   runs at 2.5 Hz, NOT on the 10 Hz tick, so the hot path stays untouched.
 * - Storage is O(frames * (u + t)) per match, capped by MAX_REPLAY_FRAMES and
 *   MAX_REPLAYS, so the whole store stays under a few MB.
 * - Reads are O(1) (Map lookup) and the frames are handed out as-is.
 */

export type ReplaySide = "blue" | "red";

export interface ReplayTower {
  id: string;
  kind: "king" | "princess";
  owner: ReplaySide;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

export interface ReplayUnit {
  /** Stable unit id (the client matches units across frames by id). */
  id: string;
  cardId: string;
  owner: ReplaySide;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
}

export interface ReplayFrame {
  /** Milliseconds since the first sampled frame. */
  t: number;
  elixirBlue: number;
  elixirRed: number;
  crownsBlue: number;
  crownsRed: number;
  towers: ReplayTower[];
  units: ReplayUnit[];
}

export interface MatchReplay {
  matchId: string;
  startedAtMs: number;
  endedAtMs: number;
  winner?: ReplaySide | "draw";
  frames: ReplayFrame[];
}

/** Sample interval (2.5 Hz). A 3 minute match = ~450 frames. */
export const REPLAY_INTERVAL_MS = 400;
/** Hard cap on the frames kept per match (~5 minutes). */
export const MAX_REPLAY_FRAMES = 750;
/** How many matches keep a replay in memory (oldest evicted first). */
export const MAX_REPLAYS = 8;
/** Live units recorded per frame (matches the in-game unit cap). */
export const MAX_REPLAY_UNITS = 40;

interface ReplayState {
  matchId: string;
  startedAtMs: number;
  endedAtMs: number;
  firstSampleMs: number;
  lastSampleMs: number;
  winner?: ReplaySide | "draw";
  frames: ReplayFrame[];
}

const replays = new Map<string, ReplayState>();

/** Evict the oldest replays so the store stays bounded. O(n) over <=8 entries. */
function evictOldest(): void {
  while (replays.size > MAX_REPLAYS) {
    let oldestId: string | null = null;
    let oldestMs = Number.POSITIVE_INFINITY;
    for (const [id, state] of replays) {
      if (state.startedAtMs < oldestMs) {
        oldestMs = state.startedAtMs;
        oldestId = id;
      }
    }
    if (oldestId === null) return;
    replays.delete(oldestId);
  }
}

/**
 * Minimal structural view of the wire snapshot (duck-typed so this module
 * does not depend on net/rooms.ts). O(1) to obtain.
 */
export interface ReplaySnapshotSource {
  towers?: Array<{
    id: string;
    kind: string;
    owner: string;
    hitPoints?: number;
    maxHitPoints?: number;
    position?: { x?: number; y?: number };
    destroyed?: boolean;
  }>;
  units?: Array<{
    id?: string;
    cardId: string;
    owner: string;
    level?: number;
    hitPoints?: number;
    maxHitPoints?: number;
    position?: { x?: number; y?: number };
  }>;
  crowns?: { blue?: number; red?: number };
  elixir?: { blue?: number; red?: number };
}

/**
 * Sample the current match state into the replay buffer.
 * O(u + t) time (u <= 40 units, t = 6 towers), O(u + t) space for the frame.
 * Samples faster than REPLAY_INTERVAL_MS are dropped (early-out, O(1)).
 */
export function recordReplayFrame(matchId: string, snapshot: ReplaySnapshotSource, nowMs: number): void {
  if (matchId.length === 0) return;
  let state = replays.get(matchId);
  if (state === undefined) {
    state = {
      matchId,
      startedAtMs: nowMs,
      endedAtMs: nowMs,
      firstSampleMs: nowMs,
      // The first sample is always taken (the interval only gates the rest).
      lastSampleMs: nowMs - REPLAY_INTERVAL_MS,
      frames: [],
    };
    replays.set(matchId, state);
    evictOldest();
  }
  if (nowMs - state.lastSampleMs < REPLAY_INTERVAL_MS) return;
  if (state.frames.length >= MAX_REPLAY_FRAMES) return;
  state.lastSampleMs = nowMs;

  const towers: ReplayTower[] = [];
  const sourceTowers = snapshot.towers ?? [];
  for (let i = 0; i < sourceTowers.length; i++) {
    const t = sourceTowers[i];
    towers.push({
      id: String(t.id ?? `tower-${i}`),
      kind: t.kind === "king" ? "king" : "princess",
      owner: t.owner === "red" ? "red" : "blue",
      x: Number(t.position?.x ?? 0),
      y: Number(t.position?.y ?? 0),
      hp: Number(t.hitPoints ?? 0),
      maxHp: Number(t.maxHitPoints ?? 0),
      destroyed: t.destroyed === true,
    });
  }

  const units: ReplayUnit[] = [];
  const sourceUnits = snapshot.units ?? [];
  const unitCount = Math.min(sourceUnits.length, MAX_REPLAY_UNITS);
  for (let i = 0; i < unitCount; i++) {
    const u = sourceUnits[i];
    units.push({
      id: String((u as { id?: unknown }).id ?? `${u.owner}-${i}`),
      cardId: String(u.cardId ?? "knight"),
      owner: u.owner === "red" ? "red" : "blue",
      x: Number(u.position?.x ?? 0),
      y: Number(u.position?.y ?? 0),
      hp: Number(u.hitPoints ?? 0),
      maxHp: Number(u.maxHitPoints ?? 0),
      level: Number(u.level ?? 1),
    });
  }

  state.frames.push({
    t: Math.max(0, nowMs - state.firstSampleMs),
    elixirBlue: Number(snapshot.elixir?.blue ?? 0),
    elixirRed: Number(snapshot.elixir?.red ?? 0),
    crownsBlue: Number(snapshot.crowns?.blue ?? 0),
    crownsRed: Number(snapshot.crowns?.red ?? 0),
    towers,
    units,
  });
}

/** Close a replay (the match ended). O(1). */
export function finishReplay(matchId: string, winner: ReplaySide | "draw" | undefined, nowMs: number): void {
  const state = replays.get(matchId);
  if (state === undefined) return;
  state.endedAtMs = nowMs;
  if (winner !== undefined) state.winner = winner;
}

/** Is a replay available for this match? O(1). */
export function hasReplay(matchId: string): boolean {
  const state = replays.get(matchId);
  return state !== undefined && state.frames.length > 0;
}

/** The stored replay (frames included), or undefined. O(1). */
export function getReplay(matchId: string): MatchReplay | undefined {
  const state = replays.get(matchId);
  if (state === undefined || state.frames.length === 0) return undefined;
  return {
    matchId: state.matchId,
    startedAtMs: state.startedAtMs,
    endedAtMs: state.endedAtMs,
    ...(state.winner !== undefined ? { winner: state.winner } : {}),
    frames: state.frames,
  };
}

/** Test helper: drop every stored replay. */
export function resetReplays(): void {
  replays.clear();
}
