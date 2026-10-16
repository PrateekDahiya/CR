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
  hitPoints: number;
  maxHitPoints: number;
  position: Vec2;
  destroyed: boolean;
}

export interface Unit {
  id: string;
  cardId: string;
  owner: PlayerSide;
  hitPoints: number;
  maxHitPoints: number;
  position: Vec2;
  targetId?: string;
}

export interface GameState {
  matchId: string;
  tick: number;
  serverTimeMs: number;
  elixir: Record<PlayerSide, number>;
  towers: Tower[];
  units: Unit[];
  crowns: Record<PlayerSide, number>;
  winner?: PlayerSide | "draw";
  endsAtMs?: number;
}

export interface RoomPlayer {
  playerId: string;
  side: PlayerSide;
  socketId: string;
  deck: string[];
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
  elixir: Record<PlayerSide, number>;
  towers: Array<{
    id: string;
    kind: "king" | "princess";
    owner: PlayerSide;
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
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    targetId?: string;
  }>;
  crowns: Record<PlayerSide, number>;
  winner?: PlayerSide | "draw";
  endsAtMs?: number;
  over?: boolean;
  hands: Record<PlayerSide, string[]>;
  queue: Record<PlayerSide, string[]>;
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
    opts?: { bluePlayerId?: string; redPlayerId?: string; startTimeMs?: number },
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
function buildInitialState(matchId: string): GameState {
  return {
    matchId,
    tick: 0,
    serverTimeMs: Date.now(),
    elixir: { blue: 5, red: 5 },
    towers: [
      buildTower("blue-king", "king", "blue", 2400, 8.5, 3.5),
      buildTower("blue-princess-left", "princess", "blue", 1400, 3.5, 6.5),
      buildTower("blue-princess-right", "princess", "blue", 1400, 13.5, 6.5),
      buildTower("red-king", "king", "red", 2400, 8.5, 27.5),
      buildTower("red-princess-left", "princess", "red", 1400, 3.5, 24.5),
      buildTower("red-princess-right", "princess", "red", 1400, 13.5, 24.5),
    ],
    units: [],
    crowns: { blue: 0, red: 0 },
  };
}

/** Live-units broadcast cap, GAME_DESIGN.md §9: N = 40 (ISS-N3-001). Towers never truncated. */
export const MAX_LIVE_UNITS = 40;

/** Map authoritative sim state onto the wire snapshot (flat x/y → position). */
function syncWire(room: Room): void {
  const sim = room.sim;
  if (sim === null) {
    return;
  }
  const s = room.state;
  s.matchId = room.matchId;
  s.tick = sim.tick;
  s.serverTimeMs = sim.serverTimeMs;
  s.elixir = { blue: sim.elixir.blue, red: sim.elixir.red };
  s.towers = sim.towers.map((t) => ({
    id: t.id,
    kind: t.kind,
    owner: t.owner,
    hitPoints: t.hp,
    maxHitPoints: t.maxHp,
    position: { x: t.x, y: t.y },
    destroyed: t.destroyed,
  }));
  // ISS-N3-001: enforce §9 live-units cap N=40 on the broadcast path (towers untouched).
  let liveUnits = sim.units;
  if (sim.units.length > MAX_LIVE_UNITS) {
    console.warn(
      `[rooms] truncating units ${sim.units.length}->${MAX_LIVE_UNITS} for ${room.matchId} (§9 N=40 cap, ISS-N3-001)`,
    );
    liveUnits = sim.units.slice(0, MAX_LIVE_UNITS);
  }
  s.units = liveUnits.map((u) => ({
    id: u.id,
    cardId: u.cardId,
    owner: u.owner,
    hitPoints: u.hp,
    maxHitPoints: u.maxHp,
    position: { x: u.x, y: u.y },
    ...(u.targetId !== undefined ? { targetId: u.targetId } : {}),
  }));
  s.crowns = { blue: sim.crowns.blue, red: sim.crowns.red };
  s.winner = sim.winner;
  s.endsAtMs = sim.endsAtMs;
  room.hands = { blue: [...sim.hands.blue], red: [...sim.hands.red] };
  room.queues = { blue: [...sim.queue.blue], red: [...sim.queue.red] };
}

// --- Registry ---

const rooms = new Map<string, Room>();

export interface RoomSeed {
  playerId: string;
  socketId: string;
  deck: string[];
}

export function createRoom(matchId: string, blue: RoomSeed, red: RoomSeed): Room {
  const existing = rooms.get(matchId);
  if (existing !== undefined) {
    return existing;
  }
  const engine = loadEngine();
  let sim: SimState | null = null;
  if (engine?.createGame !== undefined) {
    try {
      sim =
        engine.createGame(matchId, [...blue.deck], [...red.deck], {
          bluePlayerId: blue.playerId,
          redPlayerId: red.playerId,
          startTimeMs: Date.now(),
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
  const room: Room = {
    matchId,
    players: [
      { playerId: blue.playerId, side: "blue", socketId: blue.socketId, deck: [...blue.deck] },
      { playerId: red.playerId, side: "red", socketId: red.socketId, deck: [...red.deck] },
    ],
    state: buildInitialState(matchId),
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
    startedAtMs: Date.now(),
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
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.playerId === playerId)) {
      return room;
    }
  }
  return undefined;
}

export function getSide(room: Room, playerId: string): PlayerSide | null {
  return room.players.find((p) => p.playerId === playerId)?.side ?? null;
}

/** Authoritative hand: engine sim wins when present, else the STUB mirror. */
export function getHand(room: Room, side: PlayerSide): string[] {
  return room.sim !== null ? room.sim.hands[side] : room.hands[side];
}

/**
 * Pocket/deploy extension (§5.3): a side's pocket lane opens once it destroys
 * the enemy princess on that lane (x<9 left, x>=9 right).
 */
export function getPocketFor(room: Room, side: PlayerSide): { left: boolean; right: boolean } {
  const enemy: PlayerSide = side === "blue" ? "red" : "blue";
  const destroyed = (id: string): boolean =>
    room.state.towers.find((t) => t.id === id)?.destroyed === true;
  return {
    left: destroyed(`${enemy}-princess-left`),
    right: destroyed(`${enemy}-princess-right`),
  };
}

// --- Tick + broadcast (10Hz, GAME_DESIGN.md §9) ---

export const TICK_MS = 100;

/** Advance one tick via engine.tickGame, else tick-counter STUB. */
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
export function broadcastState(io: Server, room: Room): void {
  // ISS-N3-004: socket.io serializes via JSON — fail closed on unserializable
  // state instead of throwing out of the 10Hz loop.
  try {
    JSON.stringify(room.state);
  } catch (err) {
    console.warn(`[rooms] skipping broadcastState stringify failed for ${room.matchId}: ${String(err)} (ISS-N3-004)`);
    return;
  }
  io.to(room.matchId).emit("state:update", room.state);
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
    broadcastState(io, current);
    if (status === "ended") {
      io.to(matchId).emit("match:end", {
        matchId,
        winner: current.state.winner,
        crowns: current.state.crowns,
      });
      stopTickLoop(matchId);
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
  return { ok: true, stub: true };
}
