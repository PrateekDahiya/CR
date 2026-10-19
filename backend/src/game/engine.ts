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

import { getCard, getSpawnTemplate } from "./cards";
import type { EffectSpec } from "./cardMechanics";
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
  frozenUntil: number;
  slowUntil: number;
  slowMultiplier: number;
  rageUntil: number;
  rageMultiplier: number;
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
  frozenUntil: number;
  slowUntil: number;
  slowMultiplier: number;
  rageUntil: number;
  rageMultiplier: number;
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
  mechanics?: import("./cardMechanics").CardMechanicSpec;
  shieldHp?: number;
  isClone?: boolean;
  periodicNextAt?: number[];
}

interface DamageField {
  id: number;
  owner: PlayerSide;
  x: number;
  y: number;
  radius: number;
  remainingSec: number;
  intervalSec: number;
  cooldown: number;
  effect: EffectSpec;
  damage: number;
  towerDamage: number;
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
  fields: DamageField[];
  nextFieldId: number;
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

/* ---------------- perf scratch (MEMORY#20: no per-tick allocs) ---------------- */

// O(1) space reused buffers: tick paths must not allocate per-tick on hot
// paths (u<=40 units, t=6 towers). Backing arrays are reused across ticks
// (single-threaded Node — never reentrant); only the length changes.
// PERF: avoids 2x [...units].sort() spreads + 2x filter() arrays per tick.
const _orderedScratch: SimUnit[] = [];

/** Squared Euclidean distance — avoids Math.hypot sqrt in range checks. */
// O(1) time, O(1) space.
// PERF: hot inner loops compare d2 <= (range+EPS)^2 instead of hypot().
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/* ---------------- helpers ---------------- */

function dist(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.hypot(ax - bx, ay - by);
}
// O(1): dist() keeps sqrt ONLY for steering travel math; all range checks
// use dist2() above. PERF: sqrt is ~10-20x costlier than 2 mults+add.

function sideOfRiver(y: number): "blue" | "red" | "river" {
  if (y < 15) return "blue";
  if (y >= 17) return "red";
  return "river";
}

function other(side: PlayerSide): PlayerSide {
  return side === "blue" ? "red" : "blue";
}

/** Pocket unlocked by destroying the enemy princess on each lane side. */
// O(t) time single-pass, t=6 towers; O(1) space (no find() closures).
// PERF: was 2x Array.find scans; now one loop with early-out when both lanes taken.
function pocketFor(state: EngineState, side: PlayerSide): Pocket {
  const foe = other(side);
  const towers = state.towers;
  let leftTaken = false;
  let rightTaken = false;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (t.owner !== foe || t.kind !== "princess" || !t.destroyed) continue;
    if (t.x < 9) leftTaken = true;
    else rightTaken = true;
    if (leftTaken && rightTaken) break;
  }
  return { leftTaken, rightTaken };
}

/** Lowest standing-tower HP fraction for a side (king included). §8.2 */
// O(t) time single-pass, t=6; O(1) space.
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
      frozenUntil: -1,
      slowUntil: -1,
      slowMultiplier: 1,
      rageUntil: -1,
      rageMultiplier: 1,
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
    fields: [],
    nextFieldId: 1,
    bluePlayerId: opts?.bluePlayerId,
    redPlayerId: opts?.redPlayerId,
  };
}

/* ---------------- playCard (validation §11) ---------------- */

/** Deterministic spawn offsets per squad index (no randomness). */
// O(1) time/space: count<=3 bounded; reuses SPAWN_OFFSETS (no per-unit alloc
// beyond the output positions array, max 3 entries, play-time only).
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

function spawnChildUnits(
  state: EngineState,
  side: PlayerSide,
  childId: string,
  x: number,
  y: number,
  count: number,
): string[] {
  const card = getSpawnTemplate(childId);
  if (card === undefined) return [];
  const positions = spawnPositions(count, x, y);
  const ids: string[] = [];
  for (const position of positions) {
    const id = `u${state.nextUnitId++}`;
    ids.push(id);
    state.units.push({
      id,
      cardId: childId,
      owner: side,
      hp: card.hp,
      maxHp: card.hp,
      x: Math.min(Math.max(position.x, 0), 18),
      y: Math.min(Math.max(position.y, 0), 32),
      flying: card.flying === true,
      isBuilding: card.type === "building",
      cooldown: 0,
      stunUntil: -1,
      frozenUntil: -1,
      slowUntil: -1,
      slowMultiplier: 1,
      rageUntil: -1,
      rageMultiplier: 1,
      readyAt: state.timeSec,
      damage: card.damage,
      hitSpeed: card.hitSpeed,
      range: card.range,
      sightRange: card.sightRange,
      speed: card.speed,
      targets: runtimeTargetMask(card),
      splash: runtimeSplashRadius(card),
      mechanics: card.mechanics,
      shieldHp: initialShield(card),
      periodicNextAt: card.mechanics?.periodic?.map(
        (effect) => state.timeSec + Number(effect.intervalMs ?? 0) / 1000,
      ),
    });
  }
  return ids;
}

function runtimeTargetMask(card: ReturnType<typeof getCard>): SimUnit["targets"] {
  const target = card?.mechanics?.targeting;
  return target === "ground" || target === "air+ground" || target === "buildings" || target === "all"
    ? target
    : (card?.targets ?? "ground");
}

function runtimeSplashRadius(card: ReturnType<typeof getCard>): number {
  if (card?.mechanics?.attack !== "splash") return card?.flying === true ? card.radius : 0;
  const effectRadius = card.mechanics.onAttack?.find((effect) => effect.kind === "areaDamage")?.radius;
  return Number(effectRadius ?? card.radius);
}

function initialShield(card: ReturnType<typeof getCard>): number | undefined {
  const effect = card?.mechanics?.onDeploy?.find(
    (item) => item.kind === "status" && item.status === "shield",
  );
  return effect === undefined ? undefined : Number(effect.amount ?? 0);
}

function fail(code: string, message: string): PlayResult {
  return { ok: false, code, message };
}

function effectTargetMatches(effect: EffectSpec, unit: SimUnit): boolean {
  if (effect.target === "ground" && unit.flying) return false;
  if (effect.target === "air" && !unit.flying) return false;
  if (effect.target === "building" && !unit.isBuilding) return false;
  return true;
}

function applyStatus(
  target: SimUnit | SimTower,
  effect: EffectSpec,
  now: number,
): void {
  const status = typeof effect.status === "string" ? effect.status : "";
  const duration = Math.max(0, Number(effect.durationMs ?? 0) / 1000);
  if (status === "stun" || status === "freeze") {
    const until = now + duration;
    target.stunUntil = Math.max(target.stunUntil, until);
    if (status === "freeze") target.frozenUntil = Math.max(target.frozenUntil, until);
    if (target.cooldown < duration) target.cooldown = duration;
  } else if (status === "slow") {
    target.slowUntil = Math.max(target.slowUntil, now + duration);
    target.slowMultiplier = Math.min(target.slowMultiplier, Number(effect.multiplier ?? 0.65));
  } else if (status === "rage") {
    target.rageUntil = Math.max(target.rageUntil, now + duration);
    target.rageMultiplier = Math.max(target.rageMultiplier, Number(effect.multiplier ?? 1.35));
  } else if (status === "shield" && "shieldHp" in target) {
    target.shieldHp = Math.max(target.shieldHp ?? 0, Number(effect.amount ?? 0));
  }
}

function damageUnit(unit: SimUnit, amount: number): void {
  if (amount <= 0) return;
  const shield = unit.shieldHp ?? 0;
  if (shield > 0) {
    const absorbed = Math.min(shield, amount);
    unit.shieldHp = shield - absorbed;
    amount -= absorbed;
  }
  unit.hp -= amount;
}

function applyAreaDamage(
  state: EngineState,
  side: PlayerSide,
  x: number,
  y: number,
  effect: EffectSpec,
  damage: number,
  towerDamage: number,
): void {
  const foe = other(side);
  const radius = Math.max(0, Number(effect.radius ?? 0));
  const r = radius + RANGE_EPS;
  const r2 = r * r;
  const amount = Number(effect.amount ?? damage);
  const towerAmount = Number(
    effect.towerDamage ?? (effect.towerMultiplier !== undefined
      ? amount * Number(effect.towerMultiplier)
      : towerDamage),
  );
  for (const unit of state.units) {
    if (unit.owner !== foe || unit.hp <= 0 || !effectTargetMatches(effect, unit)) continue;
    if (dist2(x, y, unit.x, unit.y) <= r2) damageUnit(unit, amount);
  }
  for (const tower of state.towers) {
    if (tower.owner !== foe || tower.destroyed) continue;
    if (dist2(x, y, tower.x, tower.y) <= (radius + 0.5 + RANGE_EPS) ** 2) {
      damageTower(state, tower, towerAmount, side);
    }
  }
}

function applyDatabaseEffects(
  state: EngineState,
  side: PlayerSide,
  x: number,
  y: number,
  damage: number,
  towerDamage: number | undefined,
  ...effectLists: Array<EffectSpec[] | undefined>
): void {
  const defaultTowerDamage = towerDamage ?? damage * 0.4;
  for (const list of effectLists) {
    if (list === undefined) continue;
    for (const effect of list) {
      const radius = Number(effect.radius ?? 0);
      if (effect.kind === "areaDamage") {
        const volleys = Math.max(1, Number(effect.volleyCount ?? 1));
        const effectDamage = damage / volleys;
        const effectTowerDamage = defaultTowerDamage / volleys;
        applyAreaDamage(state, side, x, y, effect, effectDamage, effectTowerDamage);
        const duration = Number(effect.durationMs ?? 0) / 1000;
        const interval = Number(effect.intervalMs ?? 0) / 1000;
        if (duration > 0 && interval > 0) {
          state.fields.push({
            id: state.nextFieldId++,
            owner: side,
            x,
            y,
            radius,
            remainingSec: Math.max(0, duration - interval),
            intervalSec: interval,
            cooldown: interval,
            effect,
            damage: effectDamage,
            towerDamage: effectTowerDamage,
          });
        }
      } else if (effect.kind === "status") {
        const statusRadius = radius + RANGE_EPS;
        const targetOwner = effect.target === "friendly" ? side : other(side);
        for (const unit of state.units) {
          if (unit.owner !== targetOwner || unit.hp <= 0 || !effectTargetMatches(effect, unit)) continue;
          if (dist2(x, y, unit.x, unit.y) <= statusRadius * statusRadius) applyStatus(unit, effect, state.timeSec);
        }
        for (const tower of state.towers) {
          if (tower.owner !== targetOwner || tower.destroyed) continue;
          if (dist2(x, y, tower.x, tower.y) <= (statusRadius + 0.5) ** 2) applyStatus(tower, effect, state.timeSec);
        }
      } else if (effect.kind === "knockback") {
        const knockRadius = Math.max(1, radius);
        for (const unit of state.units) {
          if (unit.owner !== other(side) || unit.hp <= 0) continue;
          const dx = unit.x - x;
          const dy = unit.y - y;
          if (dx * dx + dy * dy > knockRadius * knockRadius) continue;
          const length = Math.max(0.001, Math.hypot(dx, dy));
          const distance = Number(effect.distance ?? 0.8);
          unit.x = Math.min(18, Math.max(0, unit.x + (dx / length) * distance));
          unit.y = Math.min(32, Math.max(0, unit.y + (dy / length) * distance));
        }
      } else if (effect.kind === "clone") {
        const cloneRadius = Math.max(0, radius);
        const originalCount = state.units.length;
        for (let i = 0; i < originalCount; i++) {
          const original = state.units[i];
          if (original.owner !== side || original.hp <= 0 || original.isBuilding) continue;
          if (dist2(x, y, original.x, original.y) > (cloneRadius + RANGE_EPS) ** 2) continue;
          state.units.push({ ...original, id: `u${state.nextUnitId++}`, hp: 1, maxHp: 1, isClone: true });
        }
      } else if (effect.kind === "spawn" || effect.kind === "split") {
        const childId = typeof effect.childId === "string" ? effect.childId : "";
        const count = Math.max(1, Math.min(20, Number(effect.count ?? 1)));
        spawnChildUnits(state, side, childId, x, y, count);
        const duration = Number(effect.durationMs ?? 0) / 1000;
        const interval = Number(effect.intervalMs ?? 0) / 1000;
        if (effect.kind === "spawn" && duration > 0 && interval > 0) {
          state.fields.push({
            id: state.nextFieldId++, owner: side, x, y, radius,
            remainingSec: Math.max(0, duration - interval), intervalSec: interval,
            cooldown: interval, effect, damage, towerDamage: defaultTowerDamage,
          });
        }
      } else if (effect.kind === "elixir") {
        const amount = Math.max(0, Number(effect.amount ?? 0));
        state.elixir[other(side)] = Math.min(ELIXIR_CAP, state.elixir[other(side)] + amount);
      }
    }
  }
}

function fieldPhase(state: EngineState, dt: number): void {
  const fields = state.fields;
  let write = 0;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    field.remainingSec -= dt;
    field.cooldown -= dt;
    if (field.cooldown <= 0) {
      if (field.effect.kind === "spawn" && typeof field.effect.childId === "string") {
        spawnChildUnits(
          state,
          field.owner,
          field.effect.childId,
          field.x,
          field.y,
          Math.max(1, Number(field.effect.count ?? 1)),
        );
      } else {
        applyAreaDamage(state, field.owner, field.x, field.y, field.effect, field.damage, field.towerDamage);
      }
      field.cooldown += field.intervalSec;
    }
    if (field.remainingSec > 0) fields[write++] = field;
  }
  fields.length = write;
}

function periodicPhase(state: EngineState): void {
  for (const unit of state.units) {
    if (unit.hp <= 0 || unit.mechanics?.periodic === undefined || unit.periodicNextAt === undefined) continue;
    for (let i = 0; i < unit.mechanics.periodic.length; i++) {
      const effect = unit.mechanics.periodic[i];
      const nextAt = unit.periodicNextAt[i] ?? Infinity;
      if (state.timeSec + CLOCK_EPS < nextAt) continue;
      const interval = Math.max(0.1, Number(effect.intervalMs ?? 0) / 1000);
      unit.periodicNextAt[i] = nextAt + interval;
      if (effect.kind === "elixir") {
        state.elixir[unit.owner] = Math.min(ELIXIR_CAP, state.elixir[unit.owner] + Number(effect.amount ?? 0));
      } else if (effect.kind === "spawn" && typeof effect.childId === "string") {
        spawnChildUnits(state, unit.owner, effect.childId, unit.x, unit.y, Math.max(1, Number(effect.count ?? 1)));
      }
    }
  }
}

function isFrozen(entity: { frozenUntil: number }, now: number): boolean {
  return now < entity.frozenUntil;
}

function speedMultiplier(
  entity: { slowUntil: number; slowMultiplier: number; rageUntil: number; rageMultiplier: number },
  now: number,
): number {
  const slow = now < entity.slowUntil ? entity.slowMultiplier : 1;
  const enraged = now < entity.rageUntil ? entity.rageMultiplier : 1;
  return slow * enraged;
}

/**
 * Validate + apply a DeployRequest. Synchronous — success/failure is
 * returned as an Ack-style PlayResult; the net layer mirrors async
 * failures onto the error/error:game twins (§11 ack-vs-event rule).
 * No state mutation on reject. Rate + stale enforced per §11.4.
 */
// O(1) time + O(1) space: every sub-check is bounded (t=6 towers, k<=5
// recent play ticks, squad count<=3, queue len 4). No filter/map allocs.
// PERF: in-place playTicks compaction + push; towers passed by ref (no map).
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
  const ticks = state.playTicks[side];
  // O(k) k<=5 bounded → O(1): compact in place, no filter() alloc.
  // PERF: reuse backing array; same observable filtering as before.
  let kept = 0;
  for (let i = 0; i < ticks.length; i++) {
    if (state.tick - ticks[i] < TICKS_PER_SEC) ticks[kept++] = ticks[i];
  }
  ticks.length = kept;
  if (kept >= MAX_PLAYS_PER_SEC) {
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
  if (card.type === "spell" && card.mechanics === undefined) {
    return fail("CARD_REJECTED", "card mechanics are not loaded");
  }

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
    // PERF: pass live towers by ref — SimTower {x,y,destroyed} matches the
    // footprint structural type, so no .map() alloc (was 6 objects/play).
    if (isOnTowerFootprint(x, y, state.towers)) {
      return fail("BAD_POSITION", "inside tower footprint");
    }
  }

  // ---- accepted: deduct, cycle, spawn (visible next tick) ----
  state.elixir[side] = Math.max(0, state.elixir[side] - card.cost);
  ticks.push(state.tick); // O(1) amortized; replaces [...recent, tick] spread

  // CR-style rotation: played card to back of queue, next card into slot.
  const nextId = state.queue[side].shift();
  if (nextId === undefined) {
    // Cannot happen with 8-card decks (4 hand + 4 queue); guard anyway.
    return fail("CARD_REJECTED", "empty card queue");
  }
  state.queue[side].push(playedId);
  state.hands[side][req.handIndex] = nextId;

  if (card.type === "spell") {
    applyDatabaseEffects(state, side, x, y, card.damage, card.towerDamage, card.mechanics?.onDeploy, card.mechanics?.onAttack);
    return { ok: true, cardId: card.id, unitIds: [] };
  }

  const isBuilding = card.type === "building";
  const replaceSelf = card.mechanics?.onDeploy?.some(
    (effect) => effect.kind === "spawn" && effect.replaceSelf === true,
  ) === true;
  const positions = replaceSelf ? [] : spawnPositions(card.count, x, y);
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
      frozenUntil: -1,
      slowUntil: -1,
      slowMultiplier: 1,
      rageUntil: -1,
      rageMultiplier: 1,
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
      targets: runtimeTargetMask(card),
      splash: runtimeSplashRadius(card),
      deathBurst: card.deathBurst,
      deathBurstRadius: card.deathBurstRadius,
      mechanics: card.mechanics,
      shieldHp: initialShield(card),
      periodicNextAt: card.mechanics?.periodic?.map(
        (effect) => state.timeSec + Number(effect.intervalMs ?? 0) / 1000,
      ),
    });
  }
  if (card.mechanics?.onDeploy !== undefined) {
    applyDatabaseEffects(
      state,
      side,
      x,
      y,
      card.damage,
      card.towerDamage,
      card.mechanics.onDeploy,
    );
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
  // O(t+b) single-pass, t=6 towers, b<=u buildings; O(1) space.
  // PERF: squared distances (no sqrt); hoisted towers/units; no closures.
  const towers = state.towers;
  let bestTower: SimTower | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (t.owner === owner || t.destroyed) continue;
    const d2 = dist2(x, y, t.x, t.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestTower = t;
    }
  }
  let bestB: SimUnit | null = null;
  let bestB2 = Infinity;
  if (includeBuildings) {
    const units = state.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.owner === owner || !u.isBuilding || u.hp <= 0) continue;
      const d2 = dist2(x, y, u.x, u.y);
      if (d2 < bestB2) {
        bestB2 = d2;
        bestB = u;
      }
    }
  }
  if (bestB !== null && bestB2 < bestD2) return { kind: "unit", unit: bestB };
  if (bestTower !== null) return { kind: "tower", tower: bestTower };
  return null;
}

/** Troop acquire: sight-filtered candidates, else nearest tower. §6.3 */
// O(u+t) per unit single-pass with AABB+sight early-outs; O(1) space.
// PERF: dist2 + dx/dy box reject before multiply; hoisted owner/sight/targets.
// NOTE: per-tick total is O(u*(u+t)) worst-case (u<=40 → <=1840 dist2 ops,
// sub-ms); true O(u+t)/tick needs a spatial hash — deferred (see tickGame).
function acquireUnitTarget(
  state: EngineState,
  u: SimUnit,
): { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit } | null {
  if (u.targets === "buildings") {
    return nearestEnemyTower(state, u.owner, u.x, u.y, true);
  }
  const sight = u.sightRange + RANGE_EPS;
  const sight2 = sight * sight;
  const ux = u.x;
  const uy = u.y;
  const owner = u.owner;
  const groundOnly = u.targets === "ground";
  const units = state.units;
  let best: SimUnit | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    if (e.owner === owner || e.hp <= 0) continue;
    if (groundOnly && e.flying) continue;
    const dx = ux - e.x;
    if (dx > sight || dx < -sight) continue; // AABB early-out on sight box
    const dy = uy - e.y;
    if (dy > sight || dy < -sight) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 <= sight2 && d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  if (best) return { kind: "unit", unit: best };
  return nearestEnemyTower(state, u.owner, ux, uy, false);
}

/** Tower acquire: nearest enemy entity in range (incl. Cannon). §6.3 */
// O(u) single-pass with AABB+range early-outs; O(1) space.
// PERF: dist2, no sqrt; hoisted tower x/y/owner/range.
function acquireTowerTarget(state: EngineState, t: SimTower): SimUnit | null {
  const r = t.range + RANGE_EPS;
  const r2 = r * r;
  const tx = t.x;
  const ty = t.y;
  const owner = t.owner;
  const units = state.units;
  let best: SimUnit | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    if (e.owner === owner || e.hp <= 0) continue;
    const dx = tx - e.x;
    if (dx > r || dx < -r) continue;
    const dy = ty - e.y;
    if (dy > r || dy < -r) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2 && d2 < bestD2) {
      bestD2 = d2;
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
  // O(t) t=6. PERF: indexed loop, hoisted owner/kind.
  const towers = state.towers;
  const owner = t.owner;
  for (let i = 0; i < towers.length; i++) {
    const k = towers[i];
    if (k.owner === owner && k.kind === "king" && !k.destroyed) k.active = true;
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
  if (isFrozen(u, state.timeSec)) return;
  const target = acquireUnitTarget(state, u);
  if (!target) return;
  const tx = target.kind === "tower" ? target.tower.x : target.unit.x;
  const ty = target.kind === "tower" ? target.tower.y : target.unit.y;
  // O(u+t) acquire (see acquireUnitTarget) + O(1) steering.
  // PERF: range check via dist2 (no sqrt); sqrt only for travel below.
  const ux = u.x;
  const uy = u.y;
  const r = u.range + RANGE_EPS;
  {
    const dx = ux - tx;
    const dy = uy - ty;
    if (dx * dx + dy * dy <= r * r) return; // in range — combat handles it
  }

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
  const travel = Math.min(u.speed * speedMultiplier(u, state.timeSec) * dt, Math.max(0, dd - stopAt));
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
  // O(t*u) time, t=6 constant → O(u); O(1) space. PERF: indexed, hoisted clock.
  const towers = state.towers;
  const now = state.timeSec;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (t.destroyed || !t.active) continue;
    if (now < t.stunUntil || isFrozen(t, now)) continue;
    t.cooldown -= dt * speedMultiplier(t, now);
    if (t.cooldown > 0) continue;
    const target = acquireTowerTarget(state, t);
    if (!target) continue;
    damageUnit(target, t.damage); // hitscan on the firing tick (§6.5)
    if (target.hp <= 0 && target.deathBurst) {
      golemBurst(state, target);
    }
    t.cooldown = t.hitSpeed;
  }
  // Sweep unit deaths from tower fire before troops shoot (§6.4).
  sweepDeadUnits(state);
}

function applyMultiTargetAttack(
  state: EngineState,
  attacker: SimUnit,
  primary: { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit },
): void {
  const pattern = attacker.mechanics?.attack;
  if (pattern !== "chain" && pattern !== "pierce") return;
  const chainEffect = attacker.mechanics?.onAttack?.find((effect) => effect.kind === "chain");
  const maxTargets = Math.max(1, Number(chainEffect?.maxTargets ?? 3));
  const hitIds = new Set<string>([primary.kind === "tower" ? primary.tower.id : primary.unit.id]);
  let lastX = primary.kind === "tower" ? primary.tower.x : primary.unit.x;
  let lastY = primary.kind === "tower" ? primary.tower.y : primary.unit.y;

  if (pattern === "chain") {
    for (let hit = 1; hit < maxTargets; hit++) {
      let best: SimUnit | SimTower | null = null;
      let bestDistance = Infinity;
      for (const unit of state.units) {
        if (unit.owner === attacker.owner || unit.hp <= 0 || hitIds.has(unit.id)) continue;
        const distance = dist2(lastX, lastY, unit.x, unit.y);
        if (distance < bestDistance && distance <= 4.5 * 4.5) {
          best = unit;
          bestDistance = distance;
        }
      }
      for (const tower of state.towers) {
        if (tower.owner === attacker.owner || tower.destroyed || hitIds.has(tower.id)) continue;
        const distance = dist2(lastX, lastY, tower.x, tower.y);
        if (distance < bestDistance && distance <= 4.5 * 4.5) {
          best = tower;
          bestDistance = distance;
        }
      }
      if (best === null) break;
      hitIds.add(best.id);
      if ("hp" in best && "maxHp" in best && "kind" in best) {
        damageTower(state, best, attacker.damage, attacker.owner);
        lastX = best.x;
        lastY = best.y;
      } else {
        damageUnit(best, attacker.damage);
        lastX = best.x;
        lastY = best.y;
      }
      if (attacker.mechanics?.onAttack !== undefined) {
        applyDatabaseEffects(state, attacker.owner, lastX, lastY, attacker.damage, undefined, attacker.mechanics.onAttack);
      }
    }
  } else {
    const tx = primary.kind === "tower" ? primary.tower.x : primary.unit.x;
    const ty = primary.kind === "tower" ? primary.tower.y : primary.unit.y;
    const vx = tx - attacker.x;
    const vy = ty - attacker.y;
    const length2 = Math.max(0.001, vx * vx + vy * vy);
    for (const unit of state.units) {
      if (unit.owner === attacker.owner || unit.hp <= 0 || hitIds.has(unit.id)) continue;
      const projection = ((unit.x - attacker.x) * vx + (unit.y - attacker.y) * vy) / length2;
      if (projection <= 0 || projection >= 1.05) continue;
      const px = attacker.x + vx * projection;
      const py = attacker.y + vy * projection;
      if (dist2(px, py, unit.x, unit.y) <= 0.6 * 0.6) damageUnit(unit, attacker.damage);
    }
  }
}

/** Fill + sort the shared scratch with live unit refs in id order (deterministic). */
// O(u log u) time, O(1) amortized space (backing reused across ticks).
// PERF: replaces per-phase [...units].sort() spread allocs (was 2/tick).
// Comparator is byte-identical to the original (lexicographic id).
function sortedUnits(state: EngineState): SimUnit[] {
  const src = state.units;
  _orderedScratch.length = 0;
  for (let i = 0; i < src.length; i++) _orderedScratch.push(src[i]);
  _orderedScratch.sort((a, b) => (a.id < b.id ? -1 : 1));
  return _orderedScratch;
}

function unitPhase(state: EngineState, dt: number): void {
  // O(u*(u+t)) worst-case single target-selection pass per unit (§6.4 order
  // preserved: towers already fired + swept above). O(1) extra space via scratch.
  // PERF: zero-alloc order reuse; dist2 range checks; splash AABB early-out.
  const ordered = sortedUnits(state);
  const now = state.timeSec;
  const units = state.units;
  for (let oi = 0; oi < ordered.length; oi++) {
    const u = ordered[oi];
    if (u.hp <= 0) continue;
    if (now < u.stunUntil || isFrozen(u, now)) continue;
    if (now < u.readyAt) continue; // Cannon deploy 1.0s
    u.cooldown -= dt * speedMultiplier(u, now);
    const target = acquireUnitTarget(state, u);
    if (!target) continue;
    const tx = target.kind === "tower" ? target.tower.x : target.unit.x;
    const ty = target.kind === "tower" ? target.tower.y : target.unit.y;
    const ux = u.x;
    const uy = u.y;
    const r = u.range + RANGE_EPS;
    {
      const dx = ux - tx;
      const dy = uy - ty;
      if (dx * dx + dy * dy > r * r) continue;
    }
    if (u.cooldown > 0) continue;
    if (target.kind === "tower") {
      damageTower(state, target.tower, u.damage, u.owner);
      if (state.over) return;
    } else {
      damageUnit(target.unit, u.damage);
      if (u.splash > 0) {
        const sr = u.splash + RANGE_EPS;
        const sr2 = sr * sr;
        const tid = target.unit.id;
        const uowner = u.owner;
        const udmg = u.damage;
        for (let i = 0; i < units.length; i++) {
          const e = units[i];
          if (e.owner === uowner || e.hp <= 0 || e.id === tid) continue;
          if (u.targets === "ground" && e.flying) continue;
          const dx = tx - e.x;
          if (dx > sr || dx < -sr) continue;
          const dy = ty - e.y;
          if (dy > sr || dy < -sr) continue;
          if (dx * dx + dy * dy <= sr2) damageUnit(e, udmg);
        }
      }
      if (target.unit.hp <= 0 && target.unit.deathBurst) {
        golemBurst(state, target.unit);
      }
    }
    applyMultiTargetAttack(state, u, target);
    if (u.mechanics?.onAttack !== undefined) {
      applyDatabaseEffects(
        state,
        u.owner,
        tx,
        ty,
        u.damage,
        undefined,
        u.mechanics.onAttack,
      );
    }
    u.cooldown = u.hitSpeed > 0 ? u.hitSpeed / speedMultiplier(u, now) : 0;
    if (state.over) return;
  }
  sweepDeadUnits(state);
}

/** Rock Golem death burst: 280 to enemy units + towers in area 2.0. §1 */
// O(u+t) single-pass, dist2 + AABB early-outs; O(1) space.
function golemBurst(state: EngineState, dead: SimUnit): void {
  const radius = dead.deathBurstRadius ?? 2.0;
  const dmg = dead.deathBurst ?? 0;
  if (dmg <= 0) return;
  const foe = other(dead.owner);
  const r = radius + RANGE_EPS;
  const r2 = r * r;
  const dx0 = dead.x;
  const dy0 = dead.y;
  const units = state.units;
  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    if (e.owner !== foe || e.hp <= 0 || e.id === dead.id) continue;
    const dx = dx0 - e.x;
    if (dx > r || dx < -r) continue;
    const dy = dy0 - e.y;
    if (dy > r || dy < -r) continue;
    if (dx * dx + dy * dy <= r2) damageUnit(e, dmg);
  }
  const tr = radius + 0.5 + RANGE_EPS;
  const tr2 = tr * tr;
  const towers = state.towers;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (t.owner !== foe || t.destroyed) continue;
    const dx = dx0 - t.x;
    if (dx > tr || dx < -tr) continue;
    const dy = dy0 - t.y;
    if (dy > tr || dy < -tr) continue;
    if (dx * dx + dy * dy <= tr2) {
      damageTower(state, t, dmg, dead.owner);
    }
  }
}

function sweepDeadUnits(state: EngineState): void {
  // O(u) in-place compaction preserving id order; O(1) space.
  // PERF: was filter() (new array + closure per call, 2x/tick); now zero-alloc.
  const arr = state.units;
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const unit = arr[i];
    if (unit.hp > 0) {
      arr[w++] = unit;
      continue;
    }
    if (unit.mechanics?.onDeath !== undefined) {
      applyDatabaseEffects(state, unit.owner, unit.x, unit.y, unit.damage, undefined, unit.mechanics.onDeath);
    }
  }
  arr.length = w;
}

/* ---------------- tick ---------------- */

/**
 * Advance the simulation by dt seconds (server passes TICK_DT = 0.1).
 * dt is clamped to (0, 0.5] — the server ignores client clocks and never
 * integrates variable-step physics (§10 anti-speedhack corollary).
 * Mutates + returns state (frozen once over).
 */
// O(u*(u+t)) worst-case per tick, u<=40 units, t=6 towers — bounded (~2k
// dist2 ops, sub-ms; p95 budget 5ms). Per-phase breakdown: elixir O(1),
// movement O(u*(u+t)) [one acquire per unit], towers O(t*u), troops
// O(u*(u+t)) [single target-selection pass per unit with AABB early-outs],
// sweep+expiry O(u) fused, clock/win O(t). O(1) amortized space: sorted-order
// scratch + in-place sweeps, no per-tick arrays/closures/sqrt.
// PERF: true O(u+t)/tick would need a spatial hash over sight ranges —
// deferred micro-opt (u<=40 keeps the constant tiny; correctness first).
// Early-out: returns immediately when over (frozen); stun/not-ready skip
// before any acquire; range checks use dist2.
export function tickGame(state: EngineState, dt: number = TICK_DT): EngineState {
  if (state.over) return state; // O(1) early-out once decided
  const step = Number.isFinite(dt) && dt > 0 && dt <= 0.5 ? dt : TICK_DT;

  // (2) elixir regen — server float, cap 10, double from t=120s incl. OT.
  const doubleRate = state.timeSec + CLOCK_EPS >= DOUBLE_AT_SEC;
  const perSec = doubleRate ? ELIXIR_DOUBLE_SEC : ELIXIR_SINGLE_SEC;
  state.elixir.blue = Math.min(ELIXIR_CAP, state.elixir.blue + step / perSec);
  state.elixir.red = Math.min(ELIXIR_CAP, state.elixir.red + step / perSec);

  // Database-defined persistent area effects (Poison, Earthquake, Rage, etc.)
  // resolve before movement and combat on the authoritative clock.
  fieldPhase(state, step);
  periodicPhase(state);

  // (3) movement — deterministic id order via shared scratch (no spread/sort alloc).
  const ordered = sortedUnits(state);
  const tickNow = state.timeSec;
  for (let i = 0; i < ordered.length; i++) {
    const u = ordered[i];
    if (u.hp <= 0) continue;
    if (tickNow < u.stunUntil) continue;
    moveUnit(state, u, step);
  }

  // (4) combat — towers before troops (§6.4)
  towerPhase(state, step);
  if (!state.over) unitPhase(state, step);

  // Cannon lifetime expiry (30s) fused with the dead-sweep: single O(u)
  // in-place pass, no filter() alloc. Uses pre-increment clock like before.
  // Not a kill → no death burst (expiry only drops the building).
  {
    const now = tickNow;
    const arr = state.units;
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const u = arr[i];
      if (u.hp <= 0) continue;
      if (u.expiresAt !== undefined && !(now < u.expiresAt)) continue;
      arr[w++] = u;
    }
    arr.length = w;
  }

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
