/**
 * backend/src/game/engine.ts — authoritative 10Hz battle engine (Phase 3).
 *
 * Implements docs/GAME_DESIGN.md §§5–11 (EXE order §9):
 *   (1) validated actions [via playCard between ticks] → (2) elixir regen →
 *   (3) movement → (4) combat, towers-before-troops (§6.4) →
 *   (5) destruction / king-activation / win → (6) broadcast [net layer].
 *
 * Pure TS: no socket/redis/node imports. Deterministic — fixed iteration
 * order (towers, then units by id), sequential integer ids, no Math.random,
 * no Date.now() (serverTimeMs integrates from dt; pass startTimeMs in).
 *
 * Wire compatibility: SimTower/SimUnit carry position as {x,y} and the
 * state mirrors shared/types.ts GameState keys (matchId/tick/serverTimeMs/
 * elixir/towers/units/crowns/winner/endsAtMs) plus engine-internal fields
 * (hands/decks/queue/timeSec/overtime/over/counters). The net layer maps
 * SimTower/SimUnit → shared Tower/Unit when emitting `state:update`.
 */

import { getCard } from "./cards";
import {
  Pocket,
  TOWER_SPAWNS,
  isInArena,
  isInDeployZone,
  isOnBridge,
  isOnRiver,
  isOnTowerFootprint,
  nearestBridgeX,
  towerStatsFor,
} from "./arena";

export type PlayerSide = "blue" | "red";

/** Deploy intent — mirrors shared/types.ts DeployRequest (handIndex wins). */
export interface DeployInput {
  handIndex: number; // 0..3
  x: number; // arena units [0,18]
  y: number; // arena units [0,32]
  cardId?: string; // back-compat echo; mismatch → CARD_REJECTED
  at?: { x: number; y: number }; // back-compat alias for x/y
  clientTick?: number; // stale rejection when |Δ| > 5 (§11.4)
  matchId?: string; // must match state when present
  playerId?: string; // informational (access checked in net layer §11.5)
}

export type PlayResult =
  | { ok: true; cardId: string; unitIds: string[] }
  | { ok: false; code: string; message: string };

export interface SimTower {
  id: string;
  kind: "king" | "princess";
  owner: PlayerSide;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  destroyed: boolean;
  /** King starts INACTIVE (§6.2); princesses start active. */
  active: boolean;
  cooldown: number; // sec until next shot
  stunUntil: number; // timeSec — stunned while timeSec < stunUntil
  damage: number;
  hitSpeed: number;
  range: number;
}

export interface SimUnit {
  id: string;
  cardId: string;
  owner: PlayerSide;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  flying: boolean;
  isBuilding: boolean;
  cooldown: number;
  stunUntil: number;
  readyAt: number; // spawn + deploy delay (Cannon 1.0s)
  expiresAt?: number; // Cannon lifetime 30s
  damage: number;
  hitSpeed: number;
  range: number;
  sightRange: number;
  speed: number;
  targets: "ground" | "air+ground" | "buildings" | "all";
  splash: number; // baby-dragon splash radius, 0 = single-target
  deathBurst?: number;
  deathBurstRadius?: number;
}

export interface EngineState {
  matchId: string;
  tick: number; // +1 per tick (10Hz)
  timeSec: number; // authoritative clock (§9: tick count is truth)
  serverTimeMs: number;
  elixir: Record<PlayerSide, number>; // server float 0–10 (§7)
  towers: SimTower[]; // 6 total
  units: SimUnit[];
  crowns: Record<PlayerSide, number>;
  hands: Record<PlayerSide, string[]>; // 4-card hands (card ids)
  decks: Record<PlayerSide, string[]>; // full 8 (reference)
  queue: Record<PlayerSide, string[]>; // next-card queue
  winner?: PlayerSide | "draw";
  over: boolean;
  overtime: boolean;
  endsAtMs?: number;
  nextUnitId: number;
  playTicks: Record<PlayerSide, number[]>; // recent play ticks (rate cap)
  bluePlayerId?: string;
  redPlayerId?: string;
}

/* ---------------- locked constants (§0) ---------------- */

/** Authoritative tick: 10Hz, dt = 100ms. */
export const TICK_DT = 0.1;
export const TICKS_PER_SEC = 10;

export const ELIXIR_START = 5;
export const ELIXIR_CAP = 10;
export const ELIXIR_SINGLE_SEC = 2.8; // 1 per 2.8s (t < 120s)
export const ELIXIR_DOUBLE_SEC = 1.4; // 1 per 1.4s (t >= 120s + all OT)
export const DOUBLE_AT_SEC = 120;
export const REGULATION_SEC = 180;
export const OVERTIME_SEC = 60;
export const HARD_CAP_SEC = 240;
/** OT trigger epsilon: tied crowns + |Δ lowest-tower-HP%| ≤ 0.5% → OT. §8.2 */
export const HP_PCT_EPS = 0.005;

/** Anti-cheat (§11.4): stale window ±5 ticks, burst cap 5 plays/s/side. */
export const STALE_WINDOW_TICKS = 5;
export const MAX_PLAYS_PER_SEC = 5;

/**
 * Float epsilon for accumulated-clock boundary checks (0.1s steps do not
 * sum exactly in binary — without this, t=180s fires a tick late).
 */
const CLOCK_EPS = 1e-9;

/**
 * Distance epsilon for range/radius checks. Positions integrate in
 * binary floats, so an entity exactly at range N can measure N+1ulp —
 * without this, attackers stall forever on the boundary (verified bug).
 * 1e-6 tiles is gameplay-invisible but dwarfs float error (~1e-13).
 */
const RANGE_EPS = 1e-6;

/* ---------------- helpers ---------------- */

function dist(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.hypot(ax - bx, ay - by);
}

function sideOfRiver(y: number): "blue" | "red" | "river" {
  if (y < 15) return "blue";
  if (y >= 17) return "red";
  return "river";
}

function other(side: PlayerSide): PlayerSide {
  return side === "blue" ? "red" : "blue";
}

/** Pocket unlocked by destroying the enemy princess on each lane side. */
function pocketFor(state: EngineState, side: PlayerSide): Pocket {
  const foe = other(side);
  const left = state.towers.find(
    (t) => t.owner === foe && t.kind === "princess" && t.x < 9,
  );
  const right = state.towers.find(
    (t) => t.owner === foe && t.kind === "princess" && t.x >= 9,
  );
  return {
    leftTaken: left !== undefined && left.destroyed,
    rightTaken: right !== undefined && right.destroyed,
  };
}

/** Lowest standing-tower HP fraction for a side (king included). §8.2 */
function lowestTowerHpPct(state: EngineState, side: PlayerSide): number {
  let min = 1;
  let any = false;
  for (const t of state.towers) {
    if (t.owner !== side || t.destroyed) continue;
    any = true;
    const pct = t.hp / t.maxHp;
    if (pct < min) min = pct;
  }
  return any ? min : 0;
}

/* ---------------- create ---------------- */

function makeTowers(): SimTower[] {
  return TOWER_SPAWNS.map((s) => {
    const st = towerStatsFor(s.kind);
    return {
      id: s.id,
      kind: s.kind,
      owner: s.owner as PlayerSide,
      hp: st.hp,
      maxHp: st.hp,
      x: s.x,
      y: s.y,
      destroyed: false,
      active: s.kind === "princess", // king starts INACTIVE (§6.2)
      cooldown: 0,
      stunUntil: -1,
      damage: st.damage,
      hitSpeed: st.hitSpeed,
      range: st.range,
    } as SimTower;
  });
}

/**
 * Create a match. Decks must be 8 distinct ids (validated lightly here;
 * the net layer enforces BAD_DECK at queue:join per §11 — engine throws
 * on unknown ids so a bad deck can never enter simulation).
 */
export function createGame(
  matchId: string,
  blueDeck: string[],
  redDeck: string[],
  opts?: { bluePlayerId?: string; redPlayerId?: string; startTimeMs?: number },
): EngineState {
  for (const [label, deck] of [
    ["blue", blueDeck],
    ["red", redDeck],
  ] as Array<[string, string[]]>) {
    if (!Array.isArray(deck) || deck.length !== 8) {
      throw new Error(`[engine] ${label} deck must have exactly 8 cards`);
    }
    for (const id of deck) {
      if (!getCard(id)) throw new Error(`[engine] unknown card: ${id}`);
    }
  }
  return {
    matchId,
    tick: 0,
    timeSec: 0,
    serverTimeMs: opts?.startTimeMs ?? 0,
    elixir: { blue: ELIXIR_START, red: ELIXIR_START },
    towers: makeTowers(),
    units: [],
    crowns: { blue: 0, red: 0 },
    hands: { blue: blueDeck.slice(0, 4), red: redDeck.slice(0, 4) },
    decks: { blue: blueDeck.slice(), red: redDeck.slice() },
    queue: { blue: blueDeck.slice(4), red: redDeck.slice(4) },
    winner: undefined,
    over: false,
    overtime: false,
    endsAtMs: undefined,
    nextUnitId: 1,
    playTicks: { blue: [], red: [] },
    bluePlayerId: opts?.bluePlayerId,
    redPlayerId: opts?.redPlayerId,
  };
}

/* ---------------- playCard (validation §11) ---------------- */

/** Deterministic spawn offsets per squad index (no randomness). */
const SPAWN_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [-0.45, 0.1],
  [0.45, 0.1],
  [0, -0.5],
  [0, 0.5],
];

function spawnPositions(
  count: number,
  x: number,
  y: number,
): Array<{ x: number; y: number }> {
  if (count <= 1) return [{ x, y }];
  if (count === 2)
    return [
      { x: x - 0.4, y },
      { x: x + 0.4, y },
    ];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const o = SPAWN_OFFSETS[i % SPAWN_OFFSETS.length];
    out.push({ x: x + o[0], y: y + o[1] });
  }
  return out;
}

function fail(code: string, message: string): PlayResult {
  return { ok: false, code, message };
}

function applySpell(
  state: EngineState,
  side: PlayerSide,
  cardId: string,
  x: number,
  y: number,
): void {
  const foe = other(side);
  if (cardId === "fireball" || cardId === "arrows" || cardId === "zap") {
    const radius = cardId === "fireball" ? 2.5 : cardId === "arrows" ? 4.0 : 2.5;
    const dmg = cardId === "fireball" ? 700 : cardId === "arrows" ? 300 : 220;
    const towerDmg = cardId === "fireball" ? 280 : cardId === "arrows" ? 120 : 88;
    const stun = cardId === "zap" ? 0.5 : 0;
    for (const u of state.units) {
      if (u.owner !== foe || u.hp <= 0) continue;
      if (dist(x, y, u.x, u.y) <= radius + RANGE_EPS) {
        u.hp -= dmg;
        if (stun > 0) {
          const until = state.timeSec + stun;
          if (until > u.stunUntil) u.stunUntil = until;
          u.cooldown = Math.max(u.cooldown, stun); // reset/retarget
        }
      }
    }
    for (const t of state.towers) {
      if (t.owner !== foe || t.destroyed) continue;
      if (dist(x, y, t.x, t.y) <= radius + 0.5 + RANGE_EPS) {
        damageTower(state, t, towerDmg, side);
        if (stun > 0) {
          const until = state.timeSec + stun;
          if (until > t.stunUntil) t.stunUntil = until;
          t.cooldown = Math.max(t.cooldown, stun);
        }
      }
    }
  }
}

/**
 * Validate + apply a DeployRequest. Synchronous — success/failure is
 * returned as an Ack-style PlayResult; the net layer mirrors async
 * failures onto the error/error:game twins (§11 ack-vs-event rule).
 * No state mutation on reject. Rate + stale enforced per §11.4.
 */
export function playCard(
  state: EngineState,
  side: PlayerSide,
  req: DeployInput,
): PlayResult {
  if (state.over) return fail("CARD_REJECTED", "match is over");
  if (req.matchId !== undefined && req.matchId !== state.matchId) {
    return fail("CARD_REJECTED", "wrong match");
  }

  // 1. hand index (§11.3)
  if (!Number.isInteger(req.handIndex) || req.handIndex < 0 || req.handIndex > 3) {
    return fail("BAD_HAND_INDEX", "handIndex must be 0..3");
  }

  // 2. clock/rate (§11.4) — checked before mutation
  if (
    req.clientTick !== undefined &&
    Math.abs(req.clientTick - state.tick) > STALE_WINDOW_TICKS
  ) {
    return fail("STALE_TICK", "client tick outside ±5 window");
  }
  const recent = state.playTicks[side].filter((t) => state.tick - t < TICKS_PER_SEC);
  state.playTicks[side] = recent;
  if (recent.length >= MAX_PLAYS_PER_SEC) {
    return fail("RATE_LIMITED", "burst cap 5 card:play/s/side");
  }

  // 3. hand contents (§11.3) — handIndex is truth, cardId echo only
  const hand = state.hands[side];
  const playedId = hand[req.handIndex];
  if (!playedId) return fail("BAD_HAND_INDEX", "empty hand slot");
  if (req.cardId !== undefined && req.cardId !== playedId) {
    return fail("CARD_REJECTED", "cardId echo does not match hand");
  }
  const card = getCard(playedId);
  if (!card) return fail("CARD_REJECTED", `unknown card: ${playedId}`);

  // 4. elixir (§11.1) — server table only, client cost ignored
  if (state.elixir[side] + 1e-9 < card.cost) {
    return fail("NO_ELIXIR", "insufficient elixir");
  }

  // 5. position (§11.2) — resolve back-compat `at` alias
  const x = req.at !== undefined ? req.at.x : req.x;
  const y = req.at !== undefined ? req.at.y : req.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return fail("BAD_POSITION", "non-numeric position");
  }
  if (card.type === "spell") {
    if (!isInArena(x, y)) return fail("BAD_POSITION", "spell outside arena");
  } else {
    const pocket = pocketFor(state, side);
    if (!isInDeployZone(side, x, y, pocket)) {
      return fail("BAD_POSITION", "outside legal deploy zone");
    }
    const footprint = state.towers.map((t) => ({
      x: t.x,
      y: t.y,
      destroyed: t.destroyed,
    }));
    if (isOnTowerFootprint(x, y, footprint)) {
      return fail("BAD_POSITION", "inside tower footprint");
    }
  }

  // ---- accepted: deduct, cycle, spawn (visible next tick) ----
  state.elixir[side] = Math.max(0, state.elixir[side] - card.cost);
  state.playTicks[side] = [...recent, state.tick];

  // CR-style rotation: played card to back of queue, next card into slot.
  const nextId = state.queue[side].shift();
  if (nextId === undefined) {
    // Cannot happen with 8-card decks (4 hand + 4 queue); guard anyway.
    return fail("CARD_REJECTED", "empty card queue");
  }
  state.queue[side].push(playedId);
  state.hands[side][req.handIndex] = nextId;

  if (card.type === "spell") {
    applySpell(state, side, card.id, x, y);
    return { ok: true, cardId: card.id, unitIds: [] };
  }

  const isBuilding = card.type === "building";
  const positions = spawnPositions(card.count, x, y);
  const unitIds: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const id = `u${state.nextUnitId++}`;
    unitIds.push(id);
    state.units.push({
      id,
      cardId: card.id,
      owner: side,
      hp: card.hp,
      maxHp: card.hp,
      x: Math.min(Math.max(p.x, 0), 18),
      y: Math.min(Math.max(p.y, 0), 32),
      flying: card.flying === true,
      isBuilding,
      cooldown: 0,
      stunUntil: -1,
      readyAt: state.timeSec + (card.deployDelaySec ?? 0),
      expiresAt:
        card.durationMs !== undefined
          ? state.timeSec + card.durationMs / 1000
          : undefined,
      damage: card.damage,
      hitSpeed: card.hitSpeed,
      range: card.range,
      sightRange: card.sightRange,
      speed: card.speed,
      targets: card.targets,
      splash: card.radius && card.flying ? card.radius : 0,
      deathBurst: card.deathBurst,
      deathBurstRadius: card.deathBurstRadius,
    });
  }
  return { ok: true, cardId: card.id, unitIds };
}

/* ---------------- combat ---------------- */

function nearestEnemyTower(
  state: EngineState,
  owner: PlayerSide,
  x: number,
  y: number,
  includeBuildings: boolean,
): { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit } | null {
  let best: { d: number; tower: SimTower } | null = null;
  for (const t of state.towers) {
    if (t.owner === owner || t.destroyed) continue;
    const d = dist(x, y, t.x, t.y);
    if (!best || d < best.d) best = { d, tower: t };
  }
  let bestB: { d: number; unit: SimUnit } | null = null;
  if (includeBuildings) {
    for (const u of state.units) {
      if (u.owner === owner || !u.isBuilding || u.hp <= 0) continue;
      const d = dist(x, y, u.x, u.y);
      if (!bestB || d < bestB.d) bestB = { d, unit: u };
    }
  }
  if (bestB && (!best || bestB.d < best.d)) return { kind: "unit", unit: bestB.unit };
  if (best) return { kind: "tower", tower: best.tower };
  return null;
}

/** Troop acquire: sight-filtered candidates, else nearest tower. §6.3 */
function acquireUnitTarget(
  state: EngineState,
  u: SimUnit,
): { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit } | null {
  if (u.targets === "buildings") {
    return nearestEnemyTower(state, u.owner, u.x, u.y, true);
  }
  let best: SimUnit | null = null;
  let bestD = Infinity;
  for (const e of state.units) {
    if (e.owner === u.owner || e.hp <= 0) continue;
    if (u.targets === "ground" && (e.flying || false)) continue;
    const d = dist(u.x, u.y, e.x, e.y);
    if (d <= u.sightRange + RANGE_EPS && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) return { kind: "unit", unit: best };
  return nearestEnemyTower(state, u.owner, u.x, u.y, false);
}

/** Tower acquire: nearest enemy entity in range (incl. Cannon). §6.3 */
function acquireTowerTarget(state: EngineState, t: SimTower): SimUnit | null {
  let best: SimUnit | null = null;
  let bestD = Infinity;
  for (const e of state.units) {
    if (e.owner === t.owner || e.hp <= 0) continue;
    const d = dist(t.x, t.y, e.x, e.y);
    if (d <= t.range + RANGE_EPS && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Tower damage path: king takes any damage → activates (§6.2);
 * destruction → crowns + friendly-king activation + sudden-death/win.
 */
function damageTower(
  state: EngineState,
  t: SimTower,
  dmg: number,
  bySide: PlayerSide,
): void {
  if (t.destroyed || dmg <= 0) return;
  t.hp -= dmg;
  if (t.kind === "king" && !t.active) t.active = true; // any damage wakes king
  if (t.hp > 0) return;
  t.hp = 0;
  t.destroyed = true;

  if (t.kind === "king") {
    state.crowns[bySide] = 3; // ceremonial 3 crowns
    endMatch(state, bySide);
    return;
  }
  // Princess destroyed: crown + activate friendly king (§6.2).
  state.crowns[bySide] += 1;
  for (const k of state.towers) {
    if (k.owner === t.owner && k.kind === "king" && !k.destroyed) k.active = true;
  }
  if (state.overtime && !state.over) {
    endMatch(state, bySide); // sudden-death: first blood wins (§8.1)
  }
}

function endMatch(state: EngineState, winner: PlayerSide | "draw"): void {
  if (state.over) return;
  state.over = true;
  state.winner = winner;
  state.endsAtMs = state.serverTimeMs;
}

/** Stoppage decision: crowns → lowest standing-tower HP% → draw. §8.2 */
function decideStoppage(state: EngineState): PlayerSide | "draw" | null {
  if (state.crowns.blue !== state.crowns.red) {
    return state.crowns.blue > state.crowns.red ? "blue" : "red";
  }
  const b = lowestTowerHpPct(state, "blue");
  const r = lowestTowerHpPct(state, "red");
  // Lower HP% means MORE damaged — the LESS damaged side wins. §8.2 ex:
  // towers 600/1400 vs 900/1400 → 900-side (opponent more damaged) wins,
  // i.e. winner = side whose ENEMY is weakest. Symmetric form: the side
  // with the HIGHER own lowest-HP% wins.
  const delta = Math.abs(b - r);
  if (delta <= HP_PCT_EPS) return null; // tie → OT at 180s, draw at 240s
  return b > r ? "blue" : "red";
}

function moveUnit(state: EngineState, u: SimUnit, dt: number): void {
  if (u.isBuilding || u.speed <= 0) return;
  const target = acquireUnitTarget(state, u);
  if (!target) return;
  const tx = target.kind === "tower" ? target.tower.x : target.unit.x;
  const ty = target.kind === "tower" ? target.tower.y : target.unit.y;
  const d = dist(u.x, u.y, tx, ty);
  if (d <= u.range + RANGE_EPS) return; // in range — combat handles the rest

  // Ground troops funnel through bridges; fliers fly straight. §5.2
  let wx = tx;
  let wy = ty;
  if (!u.flying) {
    const from = sideOfRiver(u.y);
    const to = sideOfRiver(ty);
    if (from !== to && to !== "river") {
      const bx = nearestBridgeX(u.x);
      if (from === "river") {
        // On the bridge: walk off toward the target side exit.
        wx = bx;
        wy = to === "red" ? 17.5 : 14.5;
      } else {
        // Head onto the nearest bridge crossing.
        wx = bx;
        wy = 15.5;
      }
    }
  }
  const dd = dist(u.x, u.y, wx, wy);
  if (dd <= 1e-9) return;
  // Stop at the edge of attack range (no orbiting).
  const stopAt = wx === tx && wy === ty ? u.range : 0;
  const travel = Math.min(u.speed * dt, Math.max(0, dd - stopAt));
  if (travel <= 0) return;
  u.x += ((wx - u.x) / dd) * travel;
  u.y += ((wy - u.y) / dd) * travel;
  u.x = Math.min(Math.max(u.x, 0), 18);
  u.y = Math.min(Math.max(u.y, 0), 32);
  // Ground units never rest inside the river off-bridge: nudge to lane.
  if (!u.flying && isOnRiver(u.y) && !isOnBridge(u.x, u.y)) {
    u.x += (nearestBridgeX(u.x) - u.x) * 0.2;
  }
}

function towerPhase(state: EngineState, dt: number): void {
  // Same-tick order: tower shots resolve before troop shots. §6.4
  for (const t of state.towers) {
    if (t.destroyed || !t.active) continue;
    if (state.timeSec < t.stunUntil) continue;
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const target = acquireTowerTarget(state, t);
    if (!target) continue;
    target.hp -= t.damage; // hitscan on the firing tick (§6.5)
    if (target.hp <= 0 && target.deathBurst) {
      golemBurst(state, target);
    }
    t.cooldown = t.hitSpeed;
  }
  // Sweep unit deaths from tower fire before troops shoot (§6.4).
  sweepDeadUnits(state);
}

function unitPhase(state: EngineState, dt: number): void {
  const ordered = [...state.units].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const u of ordered) {
    if (u.hp <= 0) continue;
    if (state.timeSec < u.stunUntil) continue;
    if (state.timeSec < u.readyAt) continue; // Cannon deploy 1.0s
    u.cooldown -= dt;
    const target = acquireUnitTarget(state, u);
    if (!target) continue;
    const tx = target.kind === "tower" ? target.tower.x : target.unit.x;
    const ty = target.kind === "tower" ? target.tower.y : target.unit.y;
    if (dist(u.x, u.y, tx, ty) > u.range + RANGE_EPS) continue;
    if (u.cooldown > 0) continue;
    if (target.kind === "tower") {
      damageTower(state, target.tower, u.damage, u.owner);
      if (state.over) return;
    } else {
      target.unit.hp -= u.damage;
      if (u.splash > 0) {
        for (const e of state.units) {
          if (e.owner === u.owner || e.hp <= 0 || e.id === target.unit.id) continue;
          if (dist(tx, ty, e.x, e.y) <= u.splash + RANGE_EPS) e.hp -= u.damage;
        }
      }
      if (target.unit.hp <= 0 && target.unit.deathBurst) {
        golemBurst(state, target.unit);
      }
    }
    u.cooldown = u.hitSpeed > 0 ? u.hitSpeed : 0;
    if (state.over) return;
  }
  sweepDeadUnits(state);
}

/** Rock Golem death burst: 280 to enemy units + towers in area 2.0. §1 */
function golemBurst(state: EngineState, dead: SimUnit): void {
  const radius = dead.deathBurstRadius ?? 2.0;
  const dmg = dead.deathBurst ?? 0;
  if (dmg <= 0) return;
  const foe = other(dead.owner);
  for (const e of state.units) {
    if (e.owner !== foe || e.hp <= 0 || e.id === dead.id) continue;
    if (dist(dead.x, dead.y, e.x, e.y) <= radius + RANGE_EPS) e.hp -= dmg;
  }
  for (const t of state.towers) {
    if (t.owner !== foe || t.destroyed) continue;
    if (dist(dead.x, dead.y, t.x, t.y) <= radius + 0.5 + RANGE_EPS) {
      damageTower(state, t, dmg, dead.owner);
    }
  }
}

function sweepDeadUnits(state: EngineState): void {
  state.units = state.units.filter((u) => u.hp > 0);
}

/* ---------------- tick ---------------- */

/**
 * Advance the simulation by dt seconds (server passes TICK_DT = 0.1).
 * dt is clamped to (0, 0.5] — the server ignores client clocks and never
 * integrates variable-step physics (§10 anti-speedhack corollary).
 * Mutates + returns state (frozen once over).
 */
export function tickGame(state: EngineState, dt: number = TICK_DT): EngineState {
  if (state.over) return state;
  const step = Number.isFinite(dt) && dt > 0 && dt <= 0.5 ? dt : TICK_DT;

  // (2) elixir regen — server float, cap 10, double from t=120s incl. OT.
  const doubleRate = state.timeSec + CLOCK_EPS >= DOUBLE_AT_SEC;
  const perSec = doubleRate ? ELIXIR_DOUBLE_SEC : ELIXIR_SINGLE_SEC;
  for (const side of ["blue", "red"] as PlayerSide[]) {
    state.elixir[side] = Math.min(ELIXIR_CAP, state.elixir[side] + step / perSec);
  }

  // (3) movement
  const ordered = [...state.units].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const u of ordered) {
    if (u.hp <= 0) continue;
    if (state.timeSec < u.stunUntil) continue;
    moveUnit(state, u, step);
  }

  // (4) combat — towers before troops (§6.4)
  towerPhase(state, step);
  if (!state.over) unitPhase(state, step);

  // Cannon lifetime expiry (30s) — not a kill, no burst.
  const now = state.timeSec;
  state.units = state.units.filter(
    (u) => u.expiresAt === undefined || now < u.expiresAt,
  );

  // (5) clock / win
  state.tick += 1;
  state.timeSec += step;
  state.serverTimeMs += step * 1000;

  if (!state.over) {
    if (!state.overtime && state.timeSec + CLOCK_EPS >= REGULATION_SEC) {
      const decision = decideStoppage(state);
      if (decision === null) {
        state.overtime = true; // tied within epsilon → sudden-death OT
      } else {
        endMatch(state, decision);
      }
    } else if (state.overtime && state.timeSec + CLOCK_EPS >= HARD_CAP_SEC) {
      const decision = decideStoppage(state);
      endMatch(state, decision === null ? "draw" : decision);
    }
  }
  return state;
}
