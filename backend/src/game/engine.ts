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
import { getLevelStats, type LevelStats } from "./levelStats";
import { resolveGameMode, type GameModeConfig } from "./modes";
import {
  CENTER_X,
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
  level: number;
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
  level: number;
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
  /** Phase 14: lifetime in seconds, used for HP wear-down. */
  lifetimeSec?: number;
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
  /** Phase 13: dash (Bandit/Prince/Dark Prince) re-arms once the unit travels. */
  dashReady?: boolean;
  /** Presentation: current attack target for client animation/projectiles. */
  targetId?: string;
  /** Phase 13: ramping-beam (Inferno) stage index + the target it is locked on. */
  rampStage?: number;
  rampTargetId?: string;
  /** Phase 13: minimum attack range (Mortar cannot hit adjacent units). */
  minRange?: number;
  /**
   * Visibility (Phase 19): the unit cannot be targeted by the enemy while
   * `now < invisibleUntil` - unless it is currently revealed. The Royal Ghost
   * deploys hidden, the Tesla starts buried.
   */
  invisibleUntil?: number;
  /** Reveal window: overrides the invisibility while `now < revealedUntil`. */
  revealedUntil?: number;
  /** Charge-up (Sparky): the shot is stored and fired when the charge is done. */
  chargeReadyAt?: number;
  chargeMultiplier?: number;
  /** Lock-on (X-Bow): the unit keeps firing at this target. */
  lockedTargetId?: string;
  /** Curse: the unit is converted to `curseChildId` when the timer expires. */
  cursedUntil?: number;
  curseChildId?: string;
  curseOwner?: PlayerSide;
  /** Presentation flags: suppress decay-only floating damage on the client. */
  decayedThisTick?: boolean;
  hitByAttackThisTick?: boolean;
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
  /** Selected game mode + resolved rules (registry: game/modes.ts). */
  modeId: string;
  mode: GameModeConfig;
  elixir: Record<PlayerSide, number>; // server float 0..mode.elixirCap
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
  cardLevels: Record<PlayerSide, Record<string, number>>;
  towerTroopId: Record<PlayerSide, string | undefined>;
  statVersion: number;
  cardStats: Record<PlayerSide, Record<string, LevelStats>>;
}

/* ---------------- locked constants (§0) ---------------- */

/** Authoritative tick: 10Hz, dt = 100ms. */
export const TICK_DT = 0.1;
export const TICKS_PER_SEC = 10;

export const ELIXIR_START = 8; // all registered modes start at 8 (2026-10-20)
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

function makeTowers(
  profiles?: Record<PlayerSide, LevelStats | undefined>,
  kingLevels?: Record<PlayerSide, number>,
  princessLevels?: Record<PlayerSide, number>,
): SimTower[] {
  return TOWER_SPAWNS.map((s) => {
    const towerLevel =
      s.kind === "king" ? (kingLevels?.[s.owner] ?? 1) : (princessLevels?.[s.owner] ?? kingLevels?.[s.owner] ?? 1);
    const st = towerStatsFor(s.kind, towerLevel);
    const profile = s.kind === "princess" ? profiles?.[s.owner] : undefined;
    const hp = profile?.hitPoints ?? st.hp;
    const damage = profile?.damage ?? st.damage;
    const hitSpeed = profile !== undefined ? profile.hitSpeedMs / 1000 : st.hitSpeed;
    const range = profile?.range ?? st.range;
    return {
      id: s.id,
      kind: s.kind,
      owner: s.owner as PlayerSide,
      level: towerLevel,
      hp,
      maxHp: hp,
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
      damage,
      hitSpeed,
      range,
    } as SimTower;
  });
}

/**
 * Create a match. Decks must be 8 distinct ids (validated lightly here;
 * the net layer enforces BAD_DECK at queue:join per §11 — engine throws
 * on unknown ids so a bad deck can never enter simulation).
 */
/**
 * Deterministic per-match shuffle of the deck order (Phase 14).
 *
 * The opening four cards must not always be the first four in deck order. The
 * shuffle is seeded from `matchId:side` so the authoritative server and every
 * client derive the identical opening hand with no extra wire message, while
 * two different matches still start differently. No `Math.random()` — the engine
 * stays deterministic and replayable.
 */
export function matchDeckOrder(deck: readonly string[], matchId: string, side: PlayerSide): string[] {
  let state = 2166136261 >>> 0;
  const key = `${matchId}:${side}`;
  for (let i = 0; i < key.length; i += 1) {
    state ^= key.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

export function createGame(
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
    /** Game-mode registry id (unknown ids fall back to standard). */
    modeId?: string;
  },
): EngineState {
  const mode = resolveGameMode(opts?.modeId);
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
  const blueOrder = matchDeckOrder(blueDeck, matchId, "blue");
  const redOrder = matchDeckOrder(redDeck, matchId, "red");
  const statVersion = opts?.statVersion ?? 1;
  const cardLevels = { blue: { ...(opts?.blueCardLevels ?? {}) }, red: { ...(opts?.redCardLevels ?? {}) } };
  const cardStats: Record<PlayerSide, Record<string, LevelStats>> = { blue: {}, red: {} };
  for (const side of ["blue", "red"] as const) {
    const deck = side === "blue" ? blueDeck : redDeck;
    for (const id of deck) {
      const card = getCard(id);
      if (card !== undefined) cardStats[side][id] = getLevelStats(card, cardLevels[side][id] ?? 1, "ladder", statVersion);
    }
  }
  const towerProfiles: Record<PlayerSide, LevelStats | undefined> = { blue: undefined, red: undefined };
  const kingLevels: Record<PlayerSide, number> = { blue: 1, red: 1 };
  const princessLevels: Record<PlayerSide, number> = { blue: 1, red: 1 };
  for (const side of ["blue", "red"] as const) {
    const kingLevel = Math.min(16, Math.max(1, Math.trunc(cardLevels[side]["king-tower"] ?? 1)));
    kingLevels[side] = kingLevel;
    const towerId = side === "blue" ? opts?.blueTowerTroopId : opts?.redTowerTroopId;
    const tower = towerId === undefined ? undefined : getCard(towerId);
    const towerLevel = Math.min(16, Math.max(kingLevel, Math.trunc(cardLevels[side][towerId ?? ""] ?? 1)));
    princessLevels[side] = towerLevel;
    // Tower Princess uses the dedicated Crown Tower level table (level 1 is
    // 1,400 HP, not the 1.1x card scaling derived from level 11).
    if (tower !== undefined && towerId !== undefined && towerId !== "tower-princess") {
      towerProfiles[side] = getLevelStats(tower, towerLevel, "ladder", statVersion);
    }
  }
  return {
    matchId,
    tick: 0,
    timeSec: 0,
    serverTimeMs: opts?.startTimeMs ?? 0,
    modeId: mode.id,
    mode,
    elixir: { blue: mode.startElixir, red: mode.startElixir },
    towers: makeTowers(towerProfiles, kingLevels, princessLevels),
    units: [],
    crowns: { blue: 0, red: 0 },
    // Randomized per match: the opening four are not always deck[0..3].
    hands: { blue: blueOrder.slice(0, 4), red: redOrder.slice(0, 4) },
    decks: { blue: blueOrder.slice(), red: redOrder.slice() },
    queue: { blue: blueOrder.slice(4), red: redOrder.slice(4) },
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
    cardLevels,
    towerTroopId: { blue: opts?.blueTowerTroopId, red: opts?.redTowerTroopId },
    statVersion,
    cardStats,
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
  const stats = getLevelStats(card, state.cardLevels[side][childId] ?? 1, "ladder", state.statVersion);
  const positions = spawnPositions(count, x, y);
  const ids: string[] = [];
  for (const position of positions) {
    const id = `u${state.nextUnitId++}`;
    ids.push(id);
    state.units.push({
      id,
      cardId: childId,
      owner: side,
      level: state.cardLevels[side][childId] ?? 1,
       hp: stats.hitPoints,
       maxHp: stats.hitPoints,
      x: Math.min(Math.max(position.x, 0), 18),
      y: Math.min(Math.max(position.y, 0), 32),
       flying: stats.flying,
      isBuilding: card.type === "building",
      cooldown: 0,
      stunUntil: -1,
      frozenUntil: -1,
      slowUntil: -1,
      slowMultiplier: 1,
      rageUntil: -1,
      rageMultiplier: 1,
       readyAt: state.timeSec + stats.deployDelayMs / 1000,
       damage: stats.damage,
       hitSpeed: stats.hitSpeedMs / 1000,
       range: stats.range,
       sightRange: stats.sightRange,
       speed: stats.moveSpeed,
      targets: runtimeTargetMask(card),
      splash: runtimeSplashRadius(card),
      mechanics: card.mechanics,
      shieldHp: initialShield(card),
      minRange: Number(
        card.mechanics?.onAttack?.find((effect) => effect.minimumRange !== undefined)
          ?.minimumRange ?? 0,
      ),
      dashReady: true,
      rampStage: 0,
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

/**
 * Phase 13 — placement classification read from the card's database mechanics.
 * Siege buildings push forward; burrowers may be dropped anywhere.
 */
function isSiegePlacement(card: ReturnType<typeof getCard>): boolean {
  return card?.type === "building" && card?.mechanics?.movement === "siege";
}

function isBurrowPlacement(card: ReturnType<typeof getCard>): boolean {
  return card?.mechanics?.movement === "burrow";
}

function effectTargetMatches(effect: EffectSpec, unit: SimUnit): boolean {
  if (effect.target === "ground" && unit.flying) return false;
  if (effect.target === "air" && !unit.flying) return false;
  if (effect.target === "building" && !unit.isBuilding) return false;
  return true;
}

/**
 * Phase 19 - visibility.
 *
 * A unit is hidden from the enemy while it is invisible (the Royal Ghost
 * deploys hidden, the Tesla starts buried) and becomes visible again when it
 * is revealed. A reveal with a duration is a window: the unit shows itself
 * for that long and hides again (the Tesla pops up to shoot and sinks back).
 */
function isHidden(unit: SimUnit, now: number): boolean {
  const invisibleUntil = unit.invisibleUntil ?? 0;
  if (invisibleUntil <= 0) return false;
  if (now < (unit.revealedUntil ?? 0)) return false;
  return true;
}

/**
 * Statuses that describe the CASTER, not the units in the blast radius:
 * the Royal Ghost deploys hidden and reveals itself when it attacks, the
 * Tesla starts buried, the X-Bow locks on, the Sparky starts charging. They
 * are applied to the attacker itself.
 */
const SELF_STATUSES: ReadonlySet<string> = new Set([
  "invisible",
  "buried",
  "reveal",
  "lockOn",
  "chargeUp",
]);

/**
 * Push the enemy units away from (or pull them towards) a point.
 *
 * `mode: "pull"` is the Tornado: it drags the units into the vortex instead
 * of pushing them out. A pull needs a direction, so a unit exactly on the
 * centre is not moved.
 */
function applyKnockback(
  state: EngineState,
  side: PlayerSide,
  x: number,
  y: number,
  effect: EffectSpec,
): void {
  const knockRadius = Math.max(1, Number(effect.radius ?? 0));
  const pull = effect.mode === "pull";
  const distance = Number(effect.distance ?? (pull ? 0.35 : 0.8));
  for (const unit of state.units) {
    if (unit.owner !== other(side) || unit.hp <= 0) continue;
    const dx = unit.x - x;
    const dy = unit.y - y;
    if (dx * dx + dy * dy > knockRadius * knockRadius) continue;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) continue; // exactly on the centre: no direction
    const sign = pull ? -1 : 1;
    unit.x = Math.min(18, Math.max(0, unit.x + (sign * dx / length) * distance));
    unit.y = Math.min(32, Math.max(0, unit.y + (sign * dy / length) * distance));
  }
}

/**
 * Phase 19 - the curse conversion.
 *
 * A cursed unit becomes the child template (the Cursed Hog, a Goblin) and
 * fights for the caster from then on.
 */
function convertCursedUnit(state: EngineState, unit: SimUnit): void {
  const childId = unit.curseChildId;
  if (childId === undefined) return;
  const template = getSpawnTemplate(childId);
  if (template === undefined) return;
  const stats = getLevelStats(template, unit.level, "ladder", state.statVersion);
  unit.cardId = childId;
  unit.owner = unit.curseOwner ?? unit.owner;
  unit.hp = stats.hitPoints;
  unit.maxHp = stats.hitPoints;
  unit.damage = stats.damage;
  unit.hitSpeed = stats.hitSpeedMs / 1000;
  unit.range = stats.range;
  unit.sightRange = stats.sightRange;
  unit.speed = stats.moveSpeed;
  unit.targets = stats.targets as SimUnit["targets"];
  unit.flying = stats.flying;
  unit.splash = stats.radius;
  unit.mechanics = template.mechanics;
  unit.cursedUntil = undefined;
  unit.curseChildId = undefined;
  unit.curseOwner = undefined;
  unit.invisibleUntil = undefined;
  unit.revealedUntil = undefined;
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
  } else if (status === "heal" && "hp" in target && "maxHp" in target) {
    // Max-HP capped friendly heal (P.E.K.K.A style support effects).
    const maxHp = (target as { maxHp: number }).maxHp;
    target.hp = Math.min(maxHp, target.hp + Number(effect.amount ?? 0));
  } else if (status === "invisible" && "readyAt" in target) {
    // Hidden from the enemy until it is revealed (Royal Ghost).
    target.invisibleUntil = duration > 0 ? now + duration : Number.POSITIVE_INFINITY;
  } else if (status === "reveal" && "readyAt" in target) {
    // A reveal with a duration is a window: visible for that long, then the
    // unit hides again (the Tesla sinks back after it shot).
    target.revealedUntil = duration > 0 ? now + duration : Number.POSITIVE_INFINITY;
  } else if (status === "buried" && "readyAt" in target) {
    // Buried buildings stay hidden (the Tesla) but still fire.
    target.invisibleUntil = Number.POSITIVE_INFINITY;
    target.revealedUntil = 0;
  } else if (status === "chargeUp" && "readyAt" in target) {
    // The shot is stored while the unit charges (Sparky).
    target.chargeReadyAt = now + (duration > 0 ? duration : 2);
    target.chargeMultiplier = Number(effect.multiplier ?? 2);
  } else if (status === "curse" && "readyAt" in target) {
    // The cursed unit fights for the caster: it becomes the child template
    // when the curse runs out - or when it dies (the death conversion hook).
    // The caster's side is filled in by the caller (applyDatabaseEffects).
    target.cursedUntil = duration > 0 ? now + duration : now;
    target.curseChildId = typeof effect.childId === "string" ? effect.childId : "goblin";
  }
  // Phase 13: statuses that describe targeting/visibility bookkeeping rather
  // than a stat mutation are intentionally inert here — they are consumed by
  // attack code (`lockOn`, `chargeUp`) or are presentation-only (`reveal`,
  // `buried`, `invisible`, `curse`, `reflect`). `scripts/audit_card_mechanics.py`
  // keeps this list honest, so a status can never be dropped without a trace.
}

function damageUnit(unit: SimUnit, amount: number): void {
  if (amount <= 0) return;
  unit.hitByAttackThisTick = true;
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
  let amount = Number(effect.amount ?? damage);
  const towerAmount = Math.round(
    Number(
      effect.towerDamage ?? (effect.towerMultiplier !== undefined
        ? amount * Number(effect.towerMultiplier)
        : towerDamage),
    ),
  );

  // Earthquake: buildings in the epicenter take a multiple of troop damage.
  const buildingMultiplier = Number(effect.buildingMultiplier ?? 1);
  // Void: fewer targets inside the circle means a bigger hit.
  const targetCountScaling = effect.targetCountScaling === true;
  const excludeTowers = effect.excludeTowers === true;
  let targetsInArea = 0;
  if (targetCountScaling) {
    for (const unit of state.units) {
      if (unit.owner !== foe || unit.hp <= 0 || !effectTargetMatches(effect, unit)) continue;
      if (dist2(x, y, unit.x, unit.y) <= r2) targetsInArea++;
    }
    // Tuned tiers: 1 target -> x2.0, 2 -> x1.5, 3 -> x1.0, 4+ -> x0.7.
    const tiers = [2, 2, 1.5, 1, 1, 0.7];
    amount *= tiers[Math.min(targetsInArea, tiers.length - 1)];
  }

  for (const unit of state.units) {
    if (unit.owner !== foe || unit.hp <= 0 || !effectTargetMatches(effect, unit)) continue;
    if (dist2(x, y, unit.x, unit.y) > r2) continue;
    damageUnit(unit, unit.isBuilding ? amount * buildingMultiplier : amount);
  }
  if (excludeTowers) return;
  for (const tower of state.towers) {
    if (tower.owner !== foe || tower.destroyed) continue;
    if (dist2(x, y, tower.x, tower.y) <= (radius + 0.5 + RANGE_EPS) ** 2) {
      damageTower(state, tower, towerAmount, side);
    }
  }
}

/**
 * Phase 13 — `chain` effect on spells (Lightning).
 *
 * Strikes up to `maxTargets` highest-HP enemy targets inside the area (buildings
 * and troops), then applies the spell's remaining status effects. Ties break on
 * entity id so the result is deterministic.
 */
function applyChainArea(
  state: EngineState,
  side: PlayerSide,
  x: number,
  y: number,
  effect: EffectSpec,
  damage: number,
  towerDamage: number,
): void {
  const foe = other(side);
  const radius = Number(effect.radius ?? 0) > 0 ? Number(effect.radius) : 12;
  const r2 = (radius + RANGE_EPS) * (radius + RANGE_EPS);
  const maxTargets = Math.max(1, Number(effect.maxTargets ?? 3));
  const candidates: Array<{ id: string; hp: number; unit: SimUnit | null; tower: SimTower | null; d2: number }> = [];
  for (const unit of state.units) {
    if (unit.owner !== foe || unit.hp <= 0 || !effectTargetMatches(effect, unit)) continue;
    const d2 = dist2(x, y, unit.x, unit.y);
    if (d2 <= r2) candidates.push({ id: unit.id, hp: unit.hp, unit, tower: null, d2 });
  }
  for (const tower of state.towers) {
    if (tower.owner !== foe || tower.destroyed) continue;
    const d2 = dist2(x, y, tower.x, tower.y);
    if (d2 <= r2) candidates.push({ id: tower.id, hp: tower.hp, unit: null, tower, d2 });
  }
  candidates.sort((a, b) => (b.hp - a.hp) || (a.id < b.id ? -1 : 1));
  const hits = Math.min(maxTargets, candidates.length);
  for (let i = 0; i < hits; i++) {
    const chosen = candidates[i];
    if (chosen.tower !== null) damageTower(state, chosen.tower, towerDamage, side);
    else if (chosen.unit !== null) damageUnit(chosen.unit, damage);
  }
}

/**
 * Phase 13 — `damage` effect used by rolling projectiles (The Log,
 * Barbarian Barrel). Damages every enemy ground entity along the lane line
 * running from the caster's river edge through the drop point, and never
 * damages Crown Towers beyond the usual spell reduction.
 */
function applyLineDamage(
  state: EngineState,
  side: PlayerSide,
  x: number,
  y: number,
  effect: EffectSpec,
  damage: number,
  towerDamage: number,
): void {
  const foe = other(side);
  const fromY = side === "blue" ? 0 : 32;
  const toY = y;
  const dx = x - CENTER_X;
  const dy = toY - fromY;
  const length2 = Math.max(0.001, dx * dx + dy * dy);
  const width = Math.max(0.8, Number(effect.width ?? 1.2));
  const groundOnly = effect.projectile === "roll";
  let hitAny = false;
  for (const unit of state.units) {
    if (unit.owner !== foe || unit.hp <= 0) continue;
    if (groundOnly && unit.flying) continue;
    const projection = ((unit.x - CENTER_X) * dx + (unit.y - fromY) * dy) / length2;
    if (projection < -0.05 || projection > 1.05) continue;
    const px = CENTER_X + dx * projection;
    const py = fromY + dy * projection;
    if (dist2(px, py, unit.x, unit.y) <= width * width) {
      damageUnit(unit, damage);
      hitAny = true;
    }
  }
  for (const tower of state.towers) {
    if (tower.owner !== foe || tower.destroyed) continue;
    const projection = ((tower.x - CENTER_X) * dx + (tower.y - fromY) * dy) / length2;
    if (projection < -0.05 || projection > 1.05) continue;
    const px = CENTER_X + dx * projection;
    const py = fromY + dy * projection;
    if (dist2(px, py, tower.x, tower.y) <= width * width) {
      damageTower(state, tower, towerDamage, side);
      hitAny = true;
    }
  }
  // A rolled projectile breaks when it connects or when it reaches the far edge,
// releasing exactly one unit (Barbarian Barrel -> one Barbarian).
  if (typeof effect.spawnOnExpire === "string") {
    spawnChildUnits(state, side, effect.spawnOnExpire, x, y, 1);
  }
}

function applyDatabaseEffects(
  state: EngineState,
  side: PlayerSide,
  x: number,
  y: number,
  damage: number,
  towerDamage: number | undefined,
  targeting: string | undefined,
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
      } else if (effect.kind === "damage") {
        // Rolling/log projectiles sweep a lane line instead of a circle.
        if (typeof effect.projectile === "string") {
          applyLineDamage(state, side, x, y, effect, damage, defaultTowerDamage);
        } else {
          applyAreaDamage(state, side, x, y, effect, damage, defaultTowerDamage);
        }
      } else if (effect.kind === "chain") {
        applyChainArea(state, side, x, y, effect, damage, defaultTowerDamage);
      } else if (effect.kind === "status") {
        const statusRadius = radius + RANGE_EPS;
        // An explicit `target` in the effect wins. Otherwise the CARD's own
        // targeting decides the side: a "friendly" card (the Rage spell, the
        // Lumberjack's rage field) must buff the caster's troops - without
        // this the Rage spell buffed the ENEMY (found by the card matrix).
        const targetOwner =
          effect.target === "friendly" || (effect.target === undefined && targeting === "friendly")
            ? side
            : other(side);
        const statusName = typeof effect.status === "string" ? effect.status : "";
        // The caster statuses (reveal / lockOn / chargeUp) belong to the
        // attacker, not to the units in the blast radius.
        if (!SELF_STATUSES.has(statusName)) {
          for (const unit of state.units) {
            if (unit.owner !== targetOwner || unit.hp <= 0 || !effectTargetMatches(effect, unit)) continue;
            if (dist2(x, y, unit.x, unit.y) > statusRadius * statusRadius) continue;
            applyStatus(unit, effect, state.timeSec);
            if (statusName === "curse") {
              unit.curseOwner = side;
              // A curse without a duration converts at once (the Mother
              // Witch turns the troop she hits into a hog right away).
              if ((unit.cursedUntil ?? 0) <= state.timeSec) convertCursedUnit(state, unit);
            }
          }
        }
        for (const tower of state.towers) {
          if (tower.owner !== targetOwner || tower.destroyed) continue;
          if (dist2(x, y, tower.x, tower.y) > (statusRadius + 0.5) ** 2) continue;
          applyStatus(tower, effect, state.timeSec);
        }
      } else if (effect.kind === "knockback") {
        applyKnockback(state, side, x, y, effect);
        // A knockback with a duration is a sustained force (the Tornado pulls
        // the units in on every tick instead of a single impulse).
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
            damage: 0,
            towerDamage: 0,
          });
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
        state.elixir[other(side)] = Math.min(state.mode.elixirCap, state.elixir[other(side)] + amount);
      } else if (effect.kind === "levelUp") {
        // Royal Chef: periodically level up the strongest eligible friendly troop.
        const excludeBuildings = effect.excludeBuildings === true;
        const minHealthRatio = Number(effect.minHealthRatio ?? 0);
        let best: SimUnit | null = null;
        for (const unit of state.units) {
          if (unit.owner !== side || unit.hp <= 0) continue;
          if (excludeBuildings && unit.isBuilding) continue;
          if (unit.maxHp > 0 && unit.hp / unit.maxHp < minHealthRatio) continue;
          if (best === null || unit.maxHp > best.maxHp) best = unit;
        }
        if (best !== null) {
          const growth = Number(effect.levelPerCycle ?? 0.12);
          best.maxHp = Math.round(best.maxHp * (1 + growth));
          best.hp = Math.min(best.maxHp, best.hp + Math.round(best.maxHp * growth));
          best.damage = Math.round(best.damage * (1 + growth));
        }
      }
      // `teleport` and `dash` are unit-scoped: they need the entity being moved,
      // so they resolve in `applyUnitScopedEffects` / `tryDash`, not here.
    }
  }
}

/**
 * Phase 13 — unit-scoped `teleport` (Miner burrow, Goblin Drill, Fisherman
 * hook). Runs once, immediately after the unit is created for deploy effects.
 */
function applyUnitScopedEffects(
  state: EngineState,
  side: PlayerSide,
  unit: SimUnit,
  lists: Array<EffectSpec[] | undefined>,
): void {
  for (const list of lists) {
    if (list === undefined) continue;
    for (const effect of list) {
      if (effect.kind !== "teleport") continue;
      const foe = other(side);
      if (effect.mode === "hook") {
        // Fisherman: pull the nearest enemy troop inside hook range toward it.
        const hookRange = Number(effect.range ?? 7) + RANGE_EPS;
        let best: SimUnit | null = null;
        let bestD2 = Infinity;
        for (const other of state.units) {
          if (other.owner !== foe || other.hp <= 0) continue;
          const d2 = dist2(unit.x, unit.y, other.x, other.y);
          if (d2 <= hookRange * hookRange && d2 < bestD2) {
            bestD2 = d2;
            best = other;
          }
        }
        if (best !== null) {
          const dx = unit.x - best.x;
          const dy = unit.y - best.y;
          const length = Math.max(0.001, Math.hypot(dx, dy));
          const pull = Math.max(0, length - unit.range);
          best.x = Math.min(Math.max(0, best.x + (dx / length) * pull), 18);
          best.y = Math.min(Math.max(0, best.y + (dy / length) * pull), 32);
        }
        continue;
      }
      // Burrow: the unit emerges at the drop point (already its position), so
      // the mechanic is that it is *allowed* to be dropped anywhere and takes
      // no bridge pathing on the way in. No-op beyond an explicit clamp.
      unit.x = Math.min(Math.max(unit.x, 0), 18);
      unit.y = Math.min(Math.max(unit.y, 0), 32);
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
      } else if (field.effect.kind === "knockback") {
        // A sustained push/pull (the Tornado drags the units in every tick).
        applyKnockback(state, field.owner, field.x, field.y, field.effect);
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
        state.elixir[unit.owner] = Math.min(state.mode.elixirCap, state.elixir[unit.owner] + Number(effect.amount ?? 0));
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
  // Phase 15: tower troops are profiles for the crown tower, never hand cards.
  // They are selected before a match; they can never be deployed from the hand.
  if (card.type === "tower" || card.mechanics?.towerTroop === true) {
    return fail("CARD_REJECTED", "tower troops are selected before a match, not played from the hand");
  }
  const stats = state.cardStats[side][card.id] ?? getLevelStats(card, state.cardLevels[side][card.id] ?? 1, "ladder", state.statVersion);

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
    // Phase 13: siege buildings (X-Bow, Mortar) may be placed forward on the
    // enemy half. They never move, so the own-half-only rule made them unable
    // to ever reach a tower from the river (10.5 tiles > their range).
    const siege = isSiegePlacement(card);
    const burrower = isBurrowPlacement(card);
    const anywhere = siege || burrower;
    if (!anywhere && !isInDeployZone(side, x, y, pocket)) {
      return fail("BAD_POSITION", "outside legal deploy zone");
    }
    if (anywhere && isOnRiver(y)) {
      return fail("BAD_POSITION", "cannot deploy on the river");
    }
    if (!anywhere) {
      // PERF: pass live towers by ref — SimTower {x,y,destroyed} matches the
      // footprint structural type, so no .map() alloc (was 6 objects/play).
      if (isOnTowerFootprint(x, y, state.towers)) {
        return fail("BAD_POSITION", "inside tower footprint");
      }
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
    applyDatabaseEffects(
      state,
      side,
      x,
      y,
      stats.damage,
      stats.towerDamage,
      card.mechanics?.targeting,
      withTerminalRelease(card.mechanics?.onDeploy, card.mechanics?.onDeath),
      card.mechanics?.onAttack,
    );
    return { ok: true, cardId: card.id, unitIds: [] };
  }

  const isBuilding = card.type === "building";
  const replaceSelf = card.mechanics?.onDeploy?.some(
    (effect) => effect.kind === "spawn" && effect.replaceSelf === true,
  ) === true;
  const positions = replaceSelf ? [] : spawnPositions(stats.count, x, y);
  const unitIds: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const id = `u${state.nextUnitId++}`;
    unitIds.push(id);
    state.units.push({
      id,
      cardId: card.id,
      owner: side,
      level: state.cardLevels[side][card.id] ?? 1,
      hp: stats.hitPoints,
      maxHp: stats.hitPoints,
      x: Math.min(Math.max(p.x, 0), 18),
      y: Math.min(Math.max(p.y, 0), 32),
       flying: stats.flying,
      isBuilding,
      cooldown: 0,
      stunUntil: -1,
      frozenUntil: -1,
      slowUntil: -1,
      slowMultiplier: 1,
      rageUntil: -1,
      rageMultiplier: 1,
       readyAt: state.timeSec + stats.deployDelayMs / 1000,
       expiresAt:
         stats.durationMs > 0
           ? state.timeSec + stats.durationMs / 1000
           : undefined,
       lifetimeSec: stats.durationMs > 0 ? stats.durationMs / 1000 : undefined,
       damage: stats.damage,
       hitSpeed: stats.hitSpeedMs / 1000,
       range: stats.range,
       sightRange: stats.sightRange,
       speed: stats.moveSpeed,
       // Phase 3 retains mechanic-defined target semantics; level rows own the
       // numeric block while the mechanics table remains the behavior source.
       targets: runtimeTargetMask(card),
       splash: card.mechanics?.attack === "splash" ? stats.radius : 0,
       deathBurst: stats.deathBurst,
       deathBurstRadius: stats.deathBurstRadius,
      mechanics: card.mechanics,
      shieldHp: initialShield(card),
      minRange: Number(
        card.mechanics?.onAttack?.find((effect) => effect.minimumRange !== undefined)
          ?.minimumRange ?? 0,
      ),
      dashReady: true,
      rampStage: 0,
      periodicNextAt: card.mechanics?.periodic?.map(
        (effect) => state.timeSec + Number(effect.intervalMs ?? 0) / 1000,
      ),
    });
    applyUnitScopedEffects(state, side, state.units[state.units.length - 1], [
      card.mechanics?.onDeploy,
    ]);
    // Phase 19: the deploy statuses that hide the unit (the Royal Ghost
    // deploys invisible, the Tesla starts buried) belong to the unit itself.
    applyCasterStatusEffects(state, state.units[state.units.length - 1], card.mechanics?.onDeploy, null);
  }
  if (card.mechanics?.onDeploy !== undefined) {
    applyDatabaseEffects(
      state,
      side,
      x,
      y,
       stats.damage,
       stats.towerDamage,
      card.mechanics.targeting,
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
    // Phase 19: a hidden unit (invisible Royal Ghost, buried Tesla) cannot be
    // targeted by the enemy.
    if (isHidden(e, state.timeSec)) continue;
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
    // Phase 19: the towers cannot shoot a hidden unit.
    if (isHidden(e, state.timeSec)) continue;
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
  if (state.mode.winCondition === "first-tower" && !state.over) {
    // Takedown: any tower destroyed (princess or king) wins immediately.
    endMatch(state, bySide);
    return;
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
  // Phase 13: a dash must resolve while the target is still out of contact
  // range, so it is attempted before ordinary walking rather than in the
  // attack phase (by then `moveUnit` has already closed the gap).
  if (tryDash(state, u, target)) return;
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
  // Phase 13: a dash re-arms once the unit has actually travelled again.
  u.dashReady = true;
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
        applyDatabaseEffects(state, attacker.owner, lastX, lastY, attacker.damage, undefined, attacker.mechanics?.targeting, attacker.mechanics?.onAttack);
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

/**
 * Phase 13 — declared minimum attack range (Mortar cannot hit units that walk
 * inside its dead zone). Returns 0 when the card does not declare one.
 */
function minimumRangeOf(u: SimUnit): number {
  if (u.minRange !== undefined) return u.minRange;
  const effect = u.mechanics?.onAttack?.find((item) => item.minimumRange !== undefined);
  return effect === undefined ? 0 : Math.max(0, Number(effect.minimumRange));
}

function targetInRange(
  u: SimUnit,
  tx: number,
  ty: number,
): boolean {
  const max = u.range + RANGE_EPS;
  const dx = u.x - tx;
  const dy = u.y - ty;
  if (dx * dx + dy * dy > max * max) return false;
  const min = minimumRangeOf(u) - RANGE_EPS;
  if (min <= 0) return true;
  return dx * dx + dy * dy >= min * min;
}

/**
 * Phase 13 — dash / charge (Bandit, Prince, Dark Prince, Mega Knight, Battle
 * Ram, Ram Rider, Golden Knight, Boss Bandit).
 *
 * When the unit has closed to at least `minimumDistance` from its target it
 * blinks into contact range and lands one hit at `multiplier` damage instead of
 * its normal attack. The dash re-arms only after the unit travels again, so a
 * unit cannot chain-dash from a standing start.
 */
function tryDash(
  state: EngineState,
  u: SimUnit,
  target: { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit },
): boolean {
  const effect = u.mechanics?.onAttack?.find((item) => item.kind === "dash");
  if (effect === undefined) return false;
  if (u.dashReady === false) return false;
  if (u.isBuilding) return false;

  const tx = target.kind === "tower" ? target.tower.x : target.unit.x;
  const ty = target.kind === "tower" ? target.tower.y : target.unit.y;
  const minimumDistance = Math.max(0, Number(effect.minimumDistance ?? 0));
  const distance = dist(u.x, u.y, tx, ty);
  if (distance < minimumDistance + RANGE_EPS) return false;
  // Upper bound: a dash is a short engage, not a map-wide blink. Without this a
  // unit whose only target is a distant tower (towers are acquired with no sight
  // limit) teleported most of the arena in a single tick. Bounded by the unit's
  // own sight range, which is also roughly Clash Royale's dash reach.
  const maximumDistance = Math.max(
    minimumDistance,
    Number(effect.maxDistance ?? u.sightRange),
  );
  if (distance > maximumDistance + RANGE_EPS) return false;

  // Blink right up to the target (a dash lands adjacent, it does not stop at a
  // ranged standoff), clamped into the arena.
  const dx = tx - u.x;
  const dy = ty - u.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const contact = Math.max(0, Math.min(u.range, 1.2));
  const travel = Math.max(0, length - contact);
  u.x = Math.min(Math.max(0, u.x + (dx / length) * travel), 18);
  u.y = Math.min(Math.max(0, u.y + (dy / length) * travel), 32);
  u.dashReady = false;

  const multiplier = Number(effect.multiplier ?? 2);
  const dashDamage = u.damage * multiplier;
  if (target.kind === "tower") damageTower(state, target.tower, dashDamage, u.owner);
  else damageUnit(target.unit, dashDamage);

  // Remaining onAttack effects (Dark Prince splash, Mega Knight landing) still
  // resolve at the impact point.
  applyDatabaseEffects(state, u.owner, tx, ty, dashDamage, undefined, u.mechanics?.targeting, u.mechanics?.onAttack);
  u.cooldown = u.hitSpeed > 0 ? u.hitSpeed / speedMultiplier(u, state.timeSec) : 0;
  return true;
}

/**
 * Phase 15 — give a rolling projectile its terminal payload.
 *
 * A rolled card (Barbarian Barrel) declares what it releases in `onDeath`, but
 * `onDeath` can never fire for a spell because no entity is created. This copies
 * that spawn onto the roll effect as `spawnOnExpire`, so the barrel breaks and
 * releases exactly one Barbarian when it connects or reaches the far edge.
 */
function withTerminalRelease(
  onDeploy: EffectSpec[] | undefined,
  onDeath: EffectSpec[] | undefined,
): EffectSpec[] | undefined {
  if (onDeploy === undefined || onDeath === undefined) return onDeploy;
  const release = onDeath.find(
    (effect) => effect.kind === "spawn" && typeof effect.childId === "string",
  );
  if (release === undefined) return onDeploy;
  let touched = false;
  const patched = onDeploy.map((effect) => {
    if (effect.kind !== "damage" || typeof effect.projectile !== "string") return effect;
    if (effect.spawnOnExpire !== undefined) return effect;
    touched = true;
    return { ...effect, spawnOnExpire: release.childId as string };
  });
  return touched ? patched : onDeploy;
}

/**
 * Phase 15 — suicide attack (Fire Spirit, Ice Spirit).
 *
 * The spirit leaps onto its target from anywhere in sight, resolves its
 * `onAttack` effects at the impact point (area damage, plus the Ice Spirit's
 * freeze), and dies. It is a single-hit, single-use unit — never a repeated
 * attacker.
 *
 * Returns true when the unit consumed its life (so the caller skips the normal
 * attack), false when it is not a suicide unit.
 */
function trySuicide(
  state: EngineState,
  u: SimUnit,
  target: { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit },
): boolean {
if (u.mechanics?.attack !== "suicide") return false;
  if (u.hp <= 0) return false;

  const tx = target.kind === "tower" ? target.tower.x : target.unit.x;
  const ty = target.kind === "tower" ? target.tower.y : target.unit.y;
  const distance = dist(u.x, u.y, tx, ty);

  // Spirits only jump from a short distance; at close range they walk into the
  // target and detonate on contact (Clash Royale behaviour). A jump from across
  // the map would be a teleport, not a spirit hop.
  const jumpRange = Math.max(u.range, 2.5);
  if (distance > jumpRange) return false;

  // Leap onto the target (a short hop, not a map-wide blink).
  u.x = Math.min(Math.max(tx, 0), 18);
  u.y = Math.min(Math.max(ty, 0), 32);

  // Detonate: its own damage plus whatever the data declares (area + freeze).
  if (target.kind === "tower") damageTower(state, target.tower, u.damage, u.owner);
  else damageUnit(target.unit, u.damage);
  if (u.mechanics?.onAttack !== undefined) {
    applyDatabaseEffects(state, u.owner, tx, ty, u.damage, undefined, u.mechanics?.targeting, u.mechanics.onAttack);
  }

  // Self-destruct: the spirit is spent.
  u.hp = 0;
  return true;
}

/**
 * Phase 14 — building wear-down.
 *
 * A timed building (Cannon, Barbarian Hut, Tesla, Mortar, ...) loses HP over
 * its lifetime and expires when the timer runs out. The rate is derived from
 * `maxHp / lifetime` so HP lands on exactly 0 at expiry, which means the unit
 * dies through the normal death path and still resolves `onDeath` payloads
 * (a Goblin Cage releases its goblin when its timer ends, as in the real game).
 * Shields are NOT consumed by wear-down.
 *
 * O(u) single pass, no allocation.
 */
function lifetimeDecayPhase(state: EngineState, dt: number): void {
  const now = state.timeSec;
  for (const u of state.units) {
    if (u.hp <= 0 || u.expiresAt === undefined || u.maxHp <= 0) continue;
    const lifetime = u.lifetimeSec;
    if (lifetime === undefined || lifetime <= 0) continue;
    const before = u.hp;
    u.hp = Math.max(0, u.hp - (u.maxHp / lifetime) * dt);
    if (u.hp < before) u.decayedThisTick = true;
    // Never outlive the timer, even under a large dt.
    if (u.hp <= 0 && now < u.expiresAt) u.hp = 0;
  }
}

/**
 * Phase 13 — ramping beam (Inferno Dragon, Inferno Tower, Mighty Miner).
 * Damage escalates while the same target stays locked and resets the moment the
 * beam is interrupted, retargeted, or the target dies.
 */
function tryRamp(
  state: EngineState,
  u: SimUnit,
  target: { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit },
): number {
  const effect = u.mechanics?.onAttack?.find((item) => item.kind === "ramp");
  if (effect === undefined) return 1;
  const targetId = target.kind === "tower" ? target.tower.id : target.unit.id;
  if (u.rampTargetId !== targetId) {
    u.rampTargetId = targetId;
    u.rampStage = 0;
  }
  const stage = Math.min(5, (u.rampStage ?? 0) + 1);
  u.rampStage = stage;
  const multipliers = effect.multipliers;
  if (Array.isArray(multipliers) && multipliers.length > 0) {
    return Number(multipliers[Math.min(stage - 1, multipliers.length - 1)] ?? 1);
  }
  // Legacy fallback: 30% -> 240% of base damage across six ticks.
  return Number(effect.multiplierPerStage ?? 0.4) * stage + 0.3;
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
    if (now < u.stunUntil || isFrozen(u, now)) {
      u.targetId = undefined;
      // A stun resets the stored shot (the Sparky loses its charge).
      u.chargeReadyAt = undefined;
      continue;
    }
    if (now < u.readyAt) {
      u.targetId = undefined;
      continue; // Cannon deploy 1.0s
    }
    // Phase 19: a cursed unit turns into the child template when the curse
    // runs out (it fights for the caster from then on).
    if (u.cursedUntil !== undefined && now >= u.cursedUntil) {
      convertCursedUnit(state, u);
    }
    u.cooldown -= dt * speedMultiplier(u, now);
    // Phase 19: charge-up (Sparky). While the unit charges it does not shoot;
    // when the charge completes it fires the stored shot and starts over.
    let chargeMultiplier = 1;
    let chargeFired = false;
    if (u.chargeReadyAt !== undefined && u.chargeReadyAt > 0) {
      if (now < u.chargeReadyAt) {
        u.targetId = undefined;
        continue; // still charging
      }
      chargeMultiplier = u.chargeMultiplier ?? 2;
      chargeFired = true;
    }
    // Phase 19: lock-on (X-Bow). The unit keeps firing at the locked target
    // until it dies or leaves the range.
    let target: { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit } | null = null;
    if (u.lockedTargetId !== undefined) {
      for (let i = 0; i < units.length; i++) {
        const locked = units[i];
        if (locked.id !== u.lockedTargetId || locked.hp <= 0 || locked.owner === u.owner) continue;
        target = { kind: "unit", unit: locked };
        break;
      }
      if (target === null) u.lockedTargetId = undefined;
    }
    if (target === null) target = acquireUnitTarget(state, u);
    if (!target) {
      u.targetId = undefined;
      continue;
    }
    const tx = target.kind === "tower" ? target.tower.x : target.unit.x;
    const ty = target.kind === "tower" ? target.tower.y : target.unit.y;
    u.targetId = target.kind === "tower" ? target.tower.id : target.unit.id;
    // Phase 13: a declared minimum range creates a dead zone (Mortar).
    // Phase 15: suicide units (Fire Spirit, Ice Spirit) leap onto the target,
// detonate once and die. This runs BEFORE the range check because a spirit
// jumps from wherever it is, and without it they behaved like ordinary troops
// that walked and hit repeatedly.
if (trySuicide(state, u, target)) {
      if (state.over) return;
      continue;
    }
    if (!targetInRange(u, tx, ty)) continue;
    if (u.cooldown > 0) continue;
    const rampMultiplier = tryRamp(state, u, target);
    // A normal (non-dash) hit re-arms the dash for the next engagement.
    u.dashReady = true;
    const hitDamage = u.damage * rampMultiplier * chargeMultiplier;
    if (target.kind === "tower") {
      damageTower(state, target.tower, hitDamage, u.owner);
      if (state.over) return;
    } else {
      damageUnit(target.unit, hitDamage);
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
        u.mechanics?.targeting,
        u.mechanics.onAttack,
      );
    }
    // Phase 19: the caster statuses (reveal / lockOn / chargeUp) apply to the
    // attacker itself - the Royal Ghost reveals itself when it attacks, the
    // X-Bow locks onto its target, the Sparky starts charging.
    applyCasterStatusEffects(state, u, u.mechanics?.onAttack, target);
    if (chargeFired) {
      // The stored shot was fired: the Sparky starts charging again.
      u.chargeReadyAt = undefined;
      u.chargeMultiplier = undefined;
    }
    u.cooldown = u.hitSpeed > 0 ? u.hitSpeed / speedMultiplier(u, now) : 0;
    if (state.over) return;
  }
  sweepDeadUnits(state);
}

/**
 * Phase 19 - apply the statuses that describe the caster.
 *
 * `reveal` makes a hidden unit visible again, `lockOn` keeps the unit firing
 * at its target and `chargeUp` stores the shot for a heavy hit.
 */
function applyCasterStatusEffects(
  state: EngineState,
  unit: SimUnit,
  effects: EffectSpec[] | undefined,
  target: { kind: "tower"; tower: SimTower } | { kind: "unit"; unit: SimUnit } | null,
): void {
  if (effects === undefined) return;
  const now = state.timeSec;
  for (const effect of effects) {
    if (effect.kind !== "status") continue;
    const status = typeof effect.status === "string" ? effect.status : "";
    // Only the caster statuses belong to the attacker: a stun or a slow in
    // the same effect list still hits the units in the blast radius.
    if (!SELF_STATUSES.has(status)) continue;
    if (status === "lockOn") {
      if (target === null) continue;
      unit.lockedTargetId = target.kind === "tower" ? target.tower.id : target.unit.id;
      continue;
    }
    applyStatus(unit, effect, now);
  }
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
      applyDatabaseEffects(state, unit.owner, unit.x, unit.y, unit.damage, undefined, unit.mechanics?.targeting, unit.mechanics.onDeath);
    }
    // Phase 19: the death conversion hook - a cursed unit that dies rises as
    // the child template and fights for the caster.
    if (unit.cursedUntil !== undefined && unit.cursedUntil > 0) {
      convertCursedUnit(state, unit);
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

  // Presentation-only hit vs lifetime-decay flags, cleared every tick.
  for (const unit of state.units) {
    unit.decayedThisTick = false;
    unit.hitByAttackThisTick = false;
  }

  // (2) elixir regen — server float, cap from the mode registry. Standard
  // keeps the t>=120s double window; modes with a fixed multiplier (e.g.
  // Infinite Elixir 8x) apply it for the whole match instead.
  const mode = state.mode;
  const fixedRate = mode.elixirRateMultiplier !== 1;
  const doubleRate = !fixedRate && mode.doubleElixir !== false && state.timeSec + CLOCK_EPS >= DOUBLE_AT_SEC;
  const perSec = fixedRate
    ? ELIXIR_SINGLE_SEC / mode.elixirRateMultiplier
    : doubleRate
      ? ELIXIR_DOUBLE_SEC
      : ELIXIR_SINGLE_SEC;
  const cap = mode.elixirCap;
  state.elixir.blue = Math.min(cap, state.elixir.blue + step / perSec);
  state.elixir.red = Math.min(cap, state.elixir.red + step / perSec);

  // Database-defined persistent area effects (Poison, Earthquake, Rage, etc.)
  // resolve before movement and combat on the authoritative clock.
  fieldPhase(state, step);
  periodicPhase(state);

  // (2b) building wear-down: every timed building bleeds HP across its
  // lifetime and dies when the timer runs out (Clash Royale behaviour). Rate
  // is maxHp/lifetime so HP reaches exactly 0 at expiry, which also runs the
  // normal death path (spawner death payloads such as Goblin Cage's goblin).
  lifetimeDecayPhase(state, step);

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
      if (u.expiresAt !== undefined && !(now < u.expiresAt)) {
        // Lifetime expiry still resolves spawn-on-death payloads (Goblin Cage).
        if (u.mechanics?.onDeath !== undefined) {
          applyDatabaseEffects(state, u.owner, u.x, u.y, u.damage, undefined, u.mechanics?.targeting, u.mechanics.onDeath);
        }
        continue;
      }
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
