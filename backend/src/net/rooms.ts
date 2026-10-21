/**
 * net/rooms — in-memory matchId -> GameState registry + 10Hz tick broadcast.
 *
 * Owns: room lifecycle, per-side hands/queues, the 100ms authoritative tick
 * loop, and `state:update` fan-out (socket room + Redis stub). Owns NO
 * simulation: every tick and every card play is delegated to the engine
 * module (backend/src/game/engine.js, engine agent) when present. Before the
 * engine lands, ticks advance tick/serverTimeMs only and plays apply a
 * clearly-marked STUB elixir+hand rotation so the socket path stays testable.
 *
 * Engine binding is structural (no static import, so `tsc` passes with or
 * without the engine file): createGame(matchId, blueDeck, redDeck, opts),
 * tickGame(sim, dt), playCard(sim, side, DeployInput) -> PlayResult.
 * The engine's SimTower/SimUnit use flat x/y + hp/maxHp; syncWire() maps them
 * onto the shared wire shape ({position, hitPoints, ...}) for `state:update`.
 */

import type { Server } from "socket.io";
import { getCardCost } from "./validation.js";
import { publishState } from "./redis.js";
import { finishReplay, recordReplayFrame } from "../replays.js";
import { DEFAULT_GAME_MODE_ID, resolveGameMode, type GameModeConfig } from "../game/modes.js";

// Structural mirror of shared/types.ts (backend tsconfig rootDir=src cannot
// import ../../../shared, so we re-declare the identical wire shape here).
export type PlayerSide = "blue" | "red";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Tower {
  id: string;
  kind: "king" | "princess";
  owner: PlayerSide;
  level?: number;
  hitPoints: number;
  maxHitPoints: number;
  position: Vec2;
  destroyed: boolean;
}

export interface Unit {
  id: string;
  cardId: string;
  owner: PlayerSide;
  level?: number;
  hitPoints: number;
  maxHitPoints: number;
  position: Vec2;
  targetId?: string;
  decayOnly?: boolean;
  /** Phase 19: the unit is hidden (invisible Royal Ghost, buried Tesla). */
  invisible?: boolean;
}

export interface GameState {
  matchId: string;
  tick: number;
  serverTimeMs: number;
  /** Wall-clock ms when the match started (lets a resumed client restore the clock). */
  startedAtMs: number;
  /** Server-resolved game mode (registry: game/modes.ts). */
  modeId: string;
  mode: GameModeConfig;
  elixir: Record<PlayerSide, number>;
  towers: Tower[];
  units: Unit[];
  crowns: Record<PlayerSide, number>;
  winner?: PlayerSide | "draw";
  endsAtMs?: number;
  cardLevels?: Record<PlayerSide, Record<string, number>>;
  towerTroopId?: Record<PlayerSide, string | undefined>;
  statVersion?: number;
}

export interface RoomPlayer {
  playerId: string;
  side: PlayerSide;
  socketId: string;
  deck: string[];
  levels?: Record<string, number>;
  towerTroopId?: string;
}

export interface Room {
  matchId: string;
  players: RoomPlayer[];
  /** Wire snapshot broadcast on `state:update` (mapped from sim when present). */
  state: GameState;
  /**
   * Authoritative engine state (opaque structural shape — the engine owns
   * hands/queue/elixir/units here). Null only before the engine lands.
   */
  sim: SimState | null;
  /** Mirror of sim hands (STUB source of truth when sim is null). */
  hands: Record<PlayerSide, string[]>;
  /** Mirror of sim queue (STUB source of truth when sim is null). */
  queues: Record<PlayerSide, string[]>;
  timer: ReturnType<typeof setInterval> | null;
  startedAtMs: number;
  /**
   * PERF (MEMORY#20 stringify-once-per-room): validation JSON cached per
   * mutation; invalidated by syncWire, recomputed at most once per tick in
   * broadcastState. Fan-out itself is a single room emit (O(1) + socket.io
   * room fan-out, NOT per-client stringify).
   */
  lastBroadcastJson?: string;
  lastBroadcastTick?: number;
}

export interface PlayOutcome {
  ok: boolean;
  /** True when the STUB fallback applied the play (engine absent). */
  stub?: boolean;
  code?: string;
  message?: string;
}

// --- Engine binding (provided by the engine agent) ---

/** Minimal structural view of the engine's sim state (duck-typed, no import). */
export interface SimState {
  matchId: string;
  tick: number;
  serverTimeMs: number;
  modeId?: string;
  mode?: GameModeConfig;
  elixir: Record<PlayerSide, number>;
  towers: Array<{
    id: string;
    kind: "king" | "princess";
    owner: PlayerSide;
    level?: number;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    destroyed: boolean;
  }>;
  units: Array<{
    id: string;
    cardId: string;
    owner: PlayerSide;
    level?: number;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    targetId?: string;
    decayedThisTick?: boolean;
    hitByAttackThisTick?: boolean;
    /** Phase 19: the unit is hidden (invisible Royal Ghost, buried Tesla). */
    invisible?: boolean;
    /** Phase 19: visibility flags (the engine owns the hidden/revealed timers). */
    invisibleUntil?: number;
    revealedUntil?: number;
  }>;
  crowns: Record<PlayerSide, number>;
  winner?: PlayerSide | "draw";
  endsAtMs?: number;
  over?: boolean;
  hands: Record<PlayerSide, string[]>;
  queue: Record<PlayerSide, string[]>;
  cardLevels?: Record<PlayerSide, Record<string, number>>;
  towerTroopId?: Record<PlayerSide, string | undefined>;
  statVersion?: number;
}

export interface DeployInput {
  handIndex: number;
  x: number;
  y: number;
  cardId?: string;
  at?: { x: number; y: number };
  clientTick?: number;
  matchId?: string;
  playerId?: string;
}

export interface PlayResult {
  ok: boolean;
  code?: string;
  message?: string;
  cardId?: string;
  unitIds?: string[];
}

interface EngineHooks {
  createGame?: (
    matchId: string,
    blueDeck: string[],
    redDeck: string[],
    opts?: {
      bluePlayerId?: string;
      redPlayerId?: string;
      startTimeMs?: number;
      blueCardLevels?: Record<string, number>;
      redCardLevels?: Record<string, number>;
      blueTowerTroopId?: string;
      redTowerTroopId?: string;
      statVersion?: number;
      modeId?: string;
    },
  ) => SimState;
  createInitialState?: (matchId: string) => SimState;
  tickGame?: (state: SimState, dt?: number) => SimState | void;
  tick?: (state: SimState, dt?: number) => SimState | void;
  step?: (state: SimState) => SimState | void;
  update?: (state: SimState, dtMs?: number) => SimState | void;
  playCard?: (state: SimState, side: PlayerSide, req: DeployInput) => PlayResult | void;
  applyCardPlay?: (state: SimState, side: PlayerSide, req: DeployInput) => PlayResult | void;
  applyPlay?: (state: SimState, side: PlayerSide, req: DeployInput) => PlayResult | void;
}

declare const require: NodeRequire | undefined;

let engineCache: EngineHooks | null | undefined;
let testEngine: EngineHooks | null = null;

/** Test seam: inject a fake engine without touching the filesystem. */
export function __setEngineForTests(hooks: EngineHooks | null): void {
  testEngine = hooks;
  engineCache = undefined;
}

/** Runtime require of ../game/engine.js — null until the engine agent lands. */
function loadEngine(): EngineHooks | null {
  if (testEngine !== null) {
    return testEngine;
  }
  if (engineCache !== undefined) {
    return engineCache;
  }
  let mod: EngineHooks | null = null;
  try {
    const req = typeof require !== "undefined" ? require : eval("require");
    try {
      mod = (req("../game/engine.js") as EngineHooks) ?? null;
    } catch {
      mod = (req("../game/engine") as EngineHooks) ?? null;
    }
  } catch {
    mod = null;
  }
  engineCache = mod;
  return mod;
}

// --- Initial state (STUB builder; engine.createGame wins) ---

function buildTower(
  id: string,
  kind: "king" | "princess",
  owner: PlayerSide,
  hp: number,
  x: number,
  y: number,
): Tower {
  return { id, kind, owner, hitPoints: hp, maxHitPoints: hp, position: { x, y }, destroyed: false };
}

/** 6 towers per GAME_DESIGN.md §§5.4/6.1: Princess 1400, King 2400. */
function buildInitialState(
  matchId: string,
  startedAtMs: number = Date.now(),
  mode: GameModeConfig = resolveGameMode(DEFAULT_GAME_MODE_ID),
): GameState {
  return {
    matchId,
    tick: 0,
    serverTimeMs: startedAtMs,
    startedAtMs,
    modeId: mode.id,
    mode,
    elixir: { blue: mode.startElixir, red: mode.startElixir },
    towers: [
      buildTower("blue-king", "king", "blue", 2400, 9, 3.5),
      buildTower("blue-princess-left", "princess", "blue", 1400, 3.5, 6.5),
      buildTower("blue-princess-right", "princess", "blue", 1400, 14.5, 6.5),
      buildTower("red-king", "king", "red", 2400, 9, 27.5),
      buildTower("red-princess-left", "princess", "red", 1400, 3.5, 24.5),
      buildTower("red-princess-right", "princess", "red", 1400, 14.5, 24.5),
    ],
    units: [],
    crowns: { blue: 0, red: 0 },
  };
}

/** Live-units broadcast cap, GAME_DESIGN.md §9: N = 40 (ISS-N3-001). Towers never truncated. */
export const MAX_LIVE_UNITS = 40;

/** Map authoritative sim state onto the wire snapshot (flat x/y → position). */
// O(u+t) time single-pass, u<=40 units, t=6 towers; O(1) amortized space.
// PERF: in-place reuse of state arrays + nested objects (no .map/.slice/
// spread per tick — was ~30 object allocs/tick/room). Backing arrays grow
// only when unit count exceeds the previous high-water mark. Towers are
// fixed 6 and never truncated (§9 cap applies to units only).
function syncWire(room: Room): void {
  const sim = room.sim;
  if (sim === null) {
    return;
  }
  const s = room.state;
  s.matchId = room.matchId;
  s.tick = sim.tick;
  s.serverTimeMs = sim.serverTimeMs;
  s.startedAtMs = room.startedAtMs;
  s.modeId = sim.modeId ?? s.modeId;
  s.mode = sim.mode ?? s.mode;
  s.elixir.blue = sim.elixir.blue; // reuse elixir object (no alloc)
  s.elixir.red = sim.elixir.red;
  // Towers: fixed 6 — update nested objects in place.
  const simT = sim.towers;
  for (let i = 0; i < simT.length; i++) {
    const st = simT[i];
    let wt = s.towers[i];
    if (wt === undefined) {
      wt = {
        id: st.id,
        kind: st.kind,
        owner: st.owner,
        level: st.level,
        hitPoints: st.hp,
        maxHitPoints: st.maxHp,
        position: { x: st.x, y: st.y },
        destroyed: st.destroyed,
      };
      s.towers[i] = wt;
    } else {
      wt.id = st.id;
      wt.kind = st.kind;
      wt.owner = st.owner;
      wt.level = st.level;
      wt.hitPoints = st.hp;
      wt.maxHitPoints = st.maxHp;
      wt.position.x = st.x;
      wt.position.y = st.y;
      wt.destroyed = st.destroyed;
    }
  }
  s.towers.length = simT.length;
  // ISS-N3-001: enforce §9 live-units cap N=40 on the broadcast path (towers untouched).
  const simU = sim.units;
  let n = simU.length;
  if (n > MAX_LIVE_UNITS) {
    console.warn(
      `[rooms] truncating units ${simU.length}->${MAX_LIVE_UNITS} for ${room.matchId} (§9 N=40 cap, ISS-N3-001)`,
    );
    n = MAX_LIVE_UNITS;
  }
  for (let i = 0; i < n; i++) {
    const su = simU[i];
    let wu = s.units[i];
    if (wu === undefined) {
      wu = {
        id: su.id,
        cardId: su.cardId,
        owner: su.owner,
        level: su.level,
        hitPoints: su.hp,
        maxHitPoints: su.maxHp,
        position: { x: su.x, y: su.y },
      };
      s.units[i] = wu;
    } else {
      wu.id = su.id;
      wu.cardId = su.cardId;
      wu.owner = su.owner;
      wu.level = su.level;
      wu.hitPoints = su.hp;
      wu.maxHitPoints = su.maxHp;
      wu.position.x = su.x;
      wu.position.y = su.y;
    }
    if (su.targetId !== undefined) wu.targetId = su.targetId;
    else delete wu.targetId;
    const decayOnly = su.decayedThisTick === true && su.hitByAttackThisTick !== true;
    if (decayOnly) wu.decayOnly = true;
    else delete wu.decayOnly;
    // Phase 19: the visibility flags (the engine owns the hidden/revealed
    // timers; the wire only carries the resolved flag). A reveal is a window:
    // when it expires the unit hides again.
    const nowSec = (s.serverTimeMs - room.startedAtMs) / 1000;
    const invisibleUntil = su.invisibleUntil ?? 0;
    const revealedUntil = su.revealedUntil ?? 0;
    const hidden = invisibleUntil > nowSec && revealedUntil <= nowSec;
    if (hidden) wu.invisible = true;
    else delete wu.invisible;
  }
  s.units.length = n;
  s.crowns.blue = sim.crowns.blue; // reuse crowns object (no alloc)
  s.crowns.red = sim.crowns.red;
  s.winner = sim.winner;
  s.endsAtMs = sim.endsAtMs;
  s.cardLevels = sim.cardLevels;
  s.towerTroopId = sim.towerTroopId;
  s.statVersion = sim.statVersion;
  // Hands/queues: fixed small arrays — copy in place (no spread allocs).
  const hb = sim.hands.blue;
  const hr = sim.hands.red;
  const qb = sim.queue.blue;
  const qr = sim.queue.red;
  for (let i = 0; i < hb.length; i++) room.hands.blue[i] = hb[i];
  room.hands.blue.length = hb.length;
  for (let i = 0; i < hr.length; i++) room.hands.red[i] = hr[i];
  room.hands.red.length = hr.length;
  for (let i = 0; i < qb.length; i++) room.queues.blue[i] = qb[i];
  room.queues.blue.length = qb.length;
  for (let i = 0; i < qr.length; i++) room.queues.red[i] = qr[i];
  room.queues.red.length = qr.length;
  // Invalidate the stringify-once cache: next broadcastState re-validates once.
  room.lastBroadcastJson = undefined;
}

// --- Registry ---

const rooms = new Map<string, Room>();

export interface RoomSeed {
  playerId: string;
  socketId: string;
  deck: string[];
  levels?: Record<string, number>;
  towerTroopId?: string;
}

export function createRoom(
  matchId: string,
  blue: RoomSeed,
  red: RoomSeed,
  modeId: string = DEFAULT_GAME_MODE_ID,
): Room {
  const existing = rooms.get(matchId);
  if (existing !== undefined) {
    return existing;
  }
  const mode = resolveGameMode(modeId);
  const engine = loadEngine();
  let sim: SimState | null = null;
  if (engine?.createGame !== undefined) {
    try {
      sim =
        engine.createGame(matchId, [...blue.deck], [...red.deck], {
          bluePlayerId: blue.playerId,
          redPlayerId: red.playerId,
          startTimeMs: Date.now(),
          blueCardLevels: blue.levels,
          redCardLevels: red.levels,
          blueTowerTroopId: blue.towerTroopId,
          redTowerTroopId: red.towerTroopId,
          modeId: mode.id,
        }) ?? null;
    } catch {
      sim = null;
    }
  } else if (engine?.createInitialState !== undefined) {
    try {
      sim = engine.createInitialState(matchId) ?? null;
    } catch {
      sim = null;
    }
  }
  const startedAtMs = Date.now();
  const room: Room = {
    matchId,
    players: [
      { playerId: blue.playerId, side: "blue", socketId: blue.socketId, deck: [...blue.deck], levels: blue.levels, towerTroopId: blue.towerTroopId },
      { playerId: red.playerId, side: "red", socketId: red.socketId, deck: [...red.deck], levels: red.levels, towerTroopId: red.towerTroopId },
    ],
    state: buildInitialState(matchId, startedAtMs, mode),
    sim,
    hands: {
      blue: blue.deck.slice(0, 4),
      red: red.deck.slice(0, 4),
    },
    queues: {
      blue: blue.deck.slice(4),
      red: red.deck.slice(4),
    },
    timer: null,
    startedAtMs,
  };
  if (sim !== null) {
    syncWire(room);
  }
  rooms.set(matchId, room);
  return room;
}

export function getRoom(matchId: string): Room | undefined {
  return rooms.get(matchId);
}

export function listRooms(): Room[] {
  return [...rooms.values()];
}

export function removeRoom(matchId: string): boolean {
  const room = rooms.get(matchId);
  if (room === undefined) {
    return false;
  }
  stopTickLoop(matchId);
  rooms.delete(matchId);
  return true;
}

export function getRoomForPlayer(playerId: string): Room | undefined {
  // O(rooms) linear scan; rooms<=concurrent matches (small). PERF: early-out
  // on first hit; no alloc (for..of over Map values, no spread).
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.playerId === playerId)) {
      return room;
    }
  }
  return undefined;
}

/**
 * The player's currently RUNNING match, if any. Used by the client guard to
 * send a player back into a battle they left (the room keeps simulating in the
 * background, so they resume exactly where they left off). O(rooms + p).
 */
export function getActiveMatchForPlayer(
  playerId: string,
): { matchId: string; side: PlayerSide; startedAtMs: number } | undefined {
  for (const room of rooms.values()) {
    if (room.state.winner !== undefined || room.sim?.over === true) continue;
    const player = room.players.find((p) => p.playerId === playerId);
    if (player !== undefined) {
      return { matchId: room.matchId, side: player.side, startedAtMs: room.startedAtMs };
    }
  }
  return undefined;
}

export function getSide(room: Room, playerId: string): PlayerSide | null {
  return room.players.find((p) => p.playerId === playerId)?.side ?? null;
}

/**
 * Re-binds a player's live socket after a rejoin (page reload / resume guard).
 * The match keeps simulating meanwhile, so nothing else changes.
 * O(p), p = 2. Returns the side when the player belongs to the room.
 */
export function rebindPlayerSocket(room: Room, playerId: string, socketId: string): PlayerSide | null {
  const player = room.players.find((p) => p.playerId === playerId);
  if (player === undefined) return null;
  player.socketId = socketId;
  return player.side;
}

/**
 * Authoritative side for a live client. SOCKET first: two players can share a
 * playerId (two tabs, same browser profile), and resolving by playerId gave both
 * of them the same side, so one player could never deploy. Falls back to
 * playerId for non-socket callers (tests, tools). O(p), p = 2.
 */
export function getSideForClient(room: Room, socketId: string, playerId: string): PlayerSide | null {
  const bySocket = room.players.find((p) => p.socketId === socketId);
  if (bySocket !== undefined) return bySocket.side;
  return getSide(room, playerId);
}

/** Authoritative hand: engine sim wins when present, else the STUB mirror. */
// O(1) time/space (direct indexed access, no copy).
export function getHand(room: Room, side: PlayerSide): string[] {
  return room.sim !== null ? room.sim.hands[side] : room.hands[side];
}

/**
 * Pocket/deploy extension (§5.3): a side's pocket lane opens once it destroys
 * the enemy princess on that lane (x<9 left, x>=9 right).
 */
// O(t) time single-pass, t=6 towers; O(1) space.
// PERF: was 2x Array.find with closures; now one indexed loop, hoisted id.
export function getPocketFor(room: Room, side: PlayerSide): { left: boolean; right: boolean } {
  const enemy: PlayerSide = side === "blue" ? "red" : "blue";
  const towers = room.state.towers;
  const leftId = `${enemy}-princess-left`;
  const rightId = `${enemy}-princess-right`;
  let left = false;
  let right = false;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (t.destroyed !== true) continue;
    if (t.id === leftId) left = true;
    else if (t.id === rightId) right = true;
    if (left && right) break;
  }
  return { left, right };
}

// --- Tick + broadcast (10Hz, GAME_DESIGN.md §9) ---

export const TICK_MS = 100;

/**
 * End-of-match hook so the bot brain (ai.ts) can stop its think loop without
 * rooms.ts importing it (avoids a cycle). Registered once by index.ts.
 */
let onRoomEnded: ((matchId: string) => void) | null = null;

export function setRoomEndedHandler(fn: ((matchId: string) => void) | null): void {
  onRoomEnded = fn;
}

/** Advance one tick via engine.tickGame, else tick-counter STUB. */
// O(1) registry work + O(u*(u+t)) engine tick (see engine.tickGame) + O(u+t)
// syncWire + one redis publish (stringify lives in redis.publishState).
// PERF: syncWire is zero-alloc steady-state; no per-tick maps/filters.
export function stepRoom(room: Room): "running" | "ended" {
  if (room.state.winner !== undefined || room.sim?.over === true) {
    return "ended";
  }
  const engine = loadEngine();
  const step = engine?.tickGame ?? engine?.tick ?? engine?.step ?? engine?.update;
  if (room.sim !== null && engine !== null && step !== undefined) {
    try {
      const next = (step as (s: SimState, dt?: number) => SimState | void).call(
        engine,
        room.sim,
        TICK_MS / 1000,
      );
      if (next !== undefined && next !== null) {
        room.sim = next;
      }
      syncWire(room);
    } catch (err) {
      console.warn(`[rooms] engine tick failed for ${room.matchId}: ${String(err)}`);
    }
  } else if (room.sim === null) {
    // STUB until the engine lands: advance the clock only (no sim here —
    // movement/combat/elixir stay in backend/src/game/).
    room.state.tick += 1;
    room.state.serverTimeMs = Date.now();
    room.lastBroadcastJson = undefined; // PERF: invalidate stringify cache
  }
  // ISS-N3-004: publishState's JSON.stringify can throw synchronously (e.g.
  // circular/BigInt), which `.catch()` on the promise would not catch. Guard
  // the call site here (redis.ts itself is out of scope for this fix).
  try {
    void publishState(room.matchId, room.state).catch(() => undefined);
  } catch (err) {
    console.warn(`[rooms] publishState stringify failed for ${room.matchId}: ${String(err)} (ISS-N3-004)`);
  }
  return room.state.winner !== undefined || room.sim?.over === true ? "ended" : "running";
}

/** Canonical snapshot broadcast: full GameState on `state:update` (§9). */
// O(1) validation amortized + O(1) emit + socket.io room fan-out O(clients);
// fan-out across matches is O(rooms) (one emit per room per tick, 10Hz).
// PERF (MEMORY#20 stringify-once-per-room): the JSON validation string is
// cached per mutation (syncWire invalidates) — repeat broadcasts of the same
// mutated state stringify once, NOT per-client and NOT per-call.
export function broadcastState(io: Server, room: Room): void {
  // ISS-N3-004: socket.io serializes via JSON — fail closed on unserializable
  // state instead of throwing out of the 10Hz loop.
  if (room.lastBroadcastJson === undefined || room.lastBroadcastTick !== room.state.tick) {
    try {
      room.lastBroadcastJson = JSON.stringify(room.state);
    } catch (err) {
      console.warn(`[rooms] skipping broadcastState stringify failed for ${room.matchId}: ${String(err)} (ISS-N3-004)`);
      return;
    }
    room.lastBroadcastTick = room.state.tick;
  }
  try {
    io.to(room.matchId).emit("state:update", room.state);
  } catch (err) {
    console.warn(`[rooms] broadcastState emit failed for ${room.matchId}: ${String(err)} (ISS-N3-004)`);
  }
}

/**
 * Surrender: the given side loses immediately, the opponent wins. The 10Hz loop
 * notices the winner on its next tick and emits `match:end` to BOTH players, so
 * a forfeit ends the battle for everyone. O(1).
 * Returns false when the match already has a result.
 */
export function forfeit(room: Room, loser: PlayerSide): boolean {
  if (room.state.winner !== undefined || room.sim?.over === true) {
    return false;
  }
  const winner: PlayerSide = loser === "blue" ? "red" : "blue";
  if (room.sim !== null) {
    room.sim.winner = winner;
    room.sim.over = true;
    syncWire(room);
  }
  room.state.winner = winner;
  room.lastBroadcastJson = undefined; // PERF: invalidate stringify cache
  return true;
}

/** Start the 10Hz setInterval loop; idempotent per match. */
export function startTickLoop(io: Server, matchId: string): void {
  const room = rooms.get(matchId);
  if (room === undefined || room.timer !== null) {
    return;
  }
  room.timer = setInterval(() => {
    const current = rooms.get(matchId);
    if (current === undefined) {
      return;
    }
    const status = stepRoom(current);
    // Replay sampling (the battle log "Watch" button). The recorder drops
    // samples that arrive faster than its own interval, so this stays O(1)
    // on the hot path.
    recordReplayFrame(matchId, current.state, Date.now());
    broadcastState(io, current);
    if (status === "ended") {
      io.to(matchId).emit("match:end", {
        matchId,
        winner: current.state.winner,
        crowns: current.state.crowns,
      });
      finishReplay(matchId, current.state.winner, Date.now());
      stopTickLoop(matchId);
      // Bot brain (ai.ts) listens for room end and stops thinking.
      onRoomEnded?.(matchId);
    }
  }, TICK_MS);
  const timer = room.timer as unknown as { unref?: () => void };
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function stopTickLoop(matchId: string): void {
  const room = rooms.get(matchId);
  if (room?.timer !== null && room?.timer !== undefined) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

// --- Card play application (validation happens in index.ts first) ---

export function applyEnginePlay(
  room: Room,
  side: PlayerSide,
  handIndex: number,
  x: number,
  y: number,
  cardIdEcho?: string,
  matchId?: string,
  playerId?: string,
): PlayOutcome {
  const engine = loadEngine();
  const play = engine?.playCard ?? engine?.applyCardPlay ?? engine?.applyPlay;
  if (room.sim !== null && engine !== null && play !== undefined) {
    try {
      const req: DeployInput = {
        handIndex,
        x,
        y,
        ...(cardIdEcho !== undefined ? { cardId: cardIdEcho } : {}),
        ...(matchId !== undefined ? { matchId } : {}),
        ...(playerId !== undefined ? { playerId } : {}),
      };
      const res = (
        play as (s: SimState, sd: PlayerSide, r: DeployInput) => PlayResult | void
      ).call(engine, room.sim, side, req);
      if (res !== undefined && res !== null && typeof res === "object" && "ok" in res) {
        if (!res.ok) {
          return {
            ok: false,
            code: res.code ?? "CARD_REJECTED",
            message: res.message ?? "card rejected",
          };
        }
        syncWire(room);
        return { ok: true };
      }
      // Void mutating engine API: re-sync the wire snapshot.
      syncWire(room);
      return { ok: true };
    } catch (err) {
      return { ok: false, code: "CARD_REJECTED", message: String(err) };
    }
  }
  if (room.sim !== null) {
    // Engine state exists but exposes no play entry — refuse rather than
    // forking a second simulation.
    return { ok: false, code: "CARD_REJECTED", message: "engine play unavailable" };
  }
  // STUB fallback (no engine yet): deduct elixir + rotate hand/queue only.
  // No units/combat here — the engine owns all simulation when it lands.
  const cardId = room.hands[side][handIndex];
  const cost = cardId !== undefined ? getCardCost(cardId) : null;
  if (cardId === undefined || cost === null) {
    return { ok: false, code: "CARD_REJECTED", message: "no card in hand slot" };
  }
  if (room.state.elixir[side] < cost) {
    return { ok: false, code: "NO_ELIXIR", message: "insufficient elixir" };
  }
  room.state.elixir[side] -= cost;
  const next = room.queues[side].shift();
  if (next !== undefined) {
    room.hands[side][handIndex] = next;
    room.queues[side].push(cardId);
  }
  room.state.serverTimeMs = Date.now();
  room.lastBroadcastJson = undefined; // PERF: invalidate stringify cache
  return { ok: true, stub: true };
}
