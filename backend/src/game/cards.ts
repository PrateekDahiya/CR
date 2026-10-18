/**
 * backend/src/game/cards.ts — normative card table (Phase 3 engine).
 *
 * Source: docs/GAME_DESIGN.md §1 (12 cards, tournament baseline / Level 9).
 * Pure TS: no socket/redis/node imports. Deterministic — plain data + lookups.
 *
 * Conventions:
 * - `hp` / `damage` are PER-UNIT values. Total squad HP = hp * count.
 *   (Archers 300x2, Skeletons 80x3 — see §1 fix notes.)
 * - `speed` in tiles/sec (1 tile = 1 arena unit). 0 = static (Cannon).
 * - `range` in tiles; melee ≈ 0.6–0.8, ranged up to 6.0.
 * - Spell `damage` = full damage vs troops; `towerDamage` = 40% vs
 *   crown towers (§1 header: "Crown-tower damage = 40% of full spell damage").
 * - `sightRange` (aggro distance) is engine tuning — GAME_DESIGN locks tower
 *   sight (7.5 / 7.0, §6.1) but not troop sight. Values below are starting
 *   points, documented here so playtests can adjust without touching engine.
 */

import { GENERATED_CARDS } from "./cards.generated.js";

export type CardKind = "troop" | "spell" | "building";

/** What this entity can target. 'all' only appears on spells (hit anything). */
export type TargetMask = "ground" | "air+ground" | "buildings" | "all";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface CardDef {
  id: string; // e.g. 'knight' — matches shared/types.ts Card.id
  name: string; // display name
  type: CardKind;
  cost: number; // elixir 1–6
  rarity: Rarity;
  /** Per-unit HP (multiply by count for squad total). 0 for spells. */
  hp: number;
  /** Damage per hit (per unit). Full spell damage for spells. */
  damage: number;
  /** Seconds between attacks. 0 for instant spells. */
  hitSpeed: number;
  /** Convenience: damage / hitSpeed (per unit). */
  dps: number;
  /** Tiles/sec. 0 = static (Cannon). */
  speed: number;
  /** Attack range in tiles. */
  range: number;
  /** Aggro/acquire distance in tiles (troops/buildings; engine tuning). */
  sightRange: number;
  targets: TargetMask;
  /** Troops spawned on play (1 for most). */
  count: number;
  /** Splash / spell radius in tiles (0 = single-target). */
  radius: number;
  /** Cannon lifetime 30s lives here (ms, mirrors CardStats.durationMs). */
  durationMs?: number;
  /** Cannon deploy delay 1.0s — cannot act until built. */
  deployDelaySec?: number;
  /** Zap stun 0.5s (mirrors CardStats.stunMs). */
  stunSec?: number;
  /** Rock Golem death burst damage (area 2.0 tiles). */
  deathBurst?: number;
  deathBurstRadius?: number;
  /** Spell damage vs crown towers (40% rule). Undefined for non-spells. */
  towerDamage?: number;
  /** True for flying troops (cross river anywhere — §5.2). */
  flying?: boolean;
}

function dps(damage: number, hitSpeed: number): number {
  return hitSpeed > 0 ? damage / hitSpeed : 0;
}

export const CARDS: Record<string, CardDef> = {
  knight: {
    id: "knight",
    name: "Knight",
    type: "troop",
    cost: 3,
    rarity: "common",
    hp: 1450,
    damage: 165,
    hitSpeed: 1.1,
    dps: dps(165, 1.1), // 150
    speed: 0.9, // med
    range: 0.8, // melee
    sightRange: 5.5,
    targets: "ground",
    count: 1,
    radius: 0,
  },
  archers: {
    id: "archers",
    name: "Archers",
    type: "troop",
    cost: 3,
    rarity: "common",
    hp: 300, // x2 = 600 total — survives full Zap (220), §1 row 2
    damage: 95,
    hitSpeed: 1.1,
    dps: dps(95, 1.1), // ~86 each, 172 total
    speed: 0.9, // med
    range: 5.5, // tie with Cannon — §6.4
    sightRange: 5.5,
    targets: "air+ground",
    count: 2,
    radius: 0,
  },
  giant: {
    id: "giant",
    name: "Giant",
    type: "troop",
    cost: 5,
    rarity: "rare",
    hp: 3400,
    damage: 210,
    hitSpeed: 1.5,
    dps: dps(210, 1.5), // 140
    speed: 0.6, // slow
    range: 0.8, // melee
    sightRange: 8.0, // buildings only — sees towers/cannon far
    targets: "buildings",
    count: 1,
    radius: 0,
  },
  skeletons: {
    id: "skeletons",
    name: "Skeletons",
    type: "troop",
    cost: 1,
    rarity: "common",
    hp: 80, // x3 = 240 total
    damage: 80,
    hitSpeed: 1.0,
    dps: dps(80, 1.0), // 80 each, 240 total
    speed: 1.2, // fast
    range: 0.6, // melee
    sightRange: 5.5,
    targets: "ground",
    count: 3,
    radius: 0,
  },
  musketeer: {
    id: "musketeer",
    name: "Musketeer",
    type: "troop",
    cost: 4,
    rarity: "rare",
    hp: 600, // one-shot by Fireball (700) — intended, §1 row 9
    damage: 200,
    hitSpeed: 1.0,
    dps: dps(200, 1.0), // 200 — highest single-target ranged
    speed: 0.9, // med
    range: 6.0, // longest troop range (still < tower 7.5/7.0)
    sightRange: 6.0,
    targets: "air+ground",
    count: 1,
    radius: 0,
  },
  "baby-dragon": {
    id: "baby-dragon",
    name: "Baby Dragon",
    type: "troop",
    cost: 4,
    rarity: "epic",
    hp: 1100,
    damage: 150, // splash
    hitSpeed: 1.6,
    dps: dps(150, 1.6), // ~94 splash
    speed: 1.1, // fast
    range: 3.5,
    sightRange: 5.0,
    targets: "air+ground",
    count: 1,
    radius: 1.5, // splash radius — engine tuning (spec gives dmg only)
    flying: true, // only flying splash; crosses river anywhere
  },
  "mini-pekka": {
    id: "mini-pekka",
    name: "Mini P.E.K.K.A",
    type: "troop",
    cost: 4,
    rarity: "rare",
    hp: 1100,
    damage: 550,
    hitSpeed: 1.6,
    dps: dps(550, 1.6), // ~344 glass cannon
    speed: 1.2, // fast
    range: 0.8, // melee
    sightRange: 5.5,
    targets: "ground",
    count: 1,
    radius: 0,
  },
  "rock-golem": {
    id: "rock-golem",
    name: "Rock Golem",
    type: "troop",
    cost: 6,
    rarity: "epic",
    hp: 4300,
    damage: 260,
    hitSpeed: 2.0,
    dps: dps(260, 2.0), // 130
    speed: 0.5, // slow (slowest in pool)
    range: 0.8, // melee
    sightRange: 8.0, // buildings only
    targets: "buildings",
    count: 1,
    radius: 0,
    deathBurst: 280, // area 2.0 on death — §1 row 8
    deathBurstRadius: 2.0,
  },
  fireball: {
    id: "fireball",
    name: "Fireball",
    type: "spell",
    cost: 4,
    rarity: "rare",
    hp: 0,
    damage: 700, // one-shots Musketeer (600) + Archers (300)
    hitSpeed: 0, // instant (0.8s travel is client visual)
    dps: 0,
    speed: 0,
    range: 0, // cast anywhere
    sightRange: 0,
    targets: "all",
    count: 0,
    radius: 2.5,
    towerDamage: 280, // 40% rule
  },
  arrows: {
    id: "arrows",
    name: "Arrows",
    type: "spell",
    cost: 3,
    rarity: "common",
    hp: 0,
    damage: 300, // 3 volleys x100, 0.6s duration (visual)
    hitSpeed: 0,
    dps: 0,
    speed: 0,
    range: 0,
    sightRange: 0,
    targets: "all",
    count: 0,
    radius: 4.0,
    durationMs: 600,
    towerDamage: 120, // 40% rule
  },
  zap: {
    id: "zap",
    name: "Zap",
    type: "spell",
    cost: 2,
    rarity: "common",
    hp: 0,
    damage: 220, // kills Skeletons; NOT full-HP Archers (300 > 220)
    hitSpeed: 0, // instant
    dps: 0,
    speed: 0,
    range: 0,
    sightRange: 0,
    targets: "all",
    count: 0,
    radius: 2.5,
    towerDamage: 88, // 40% rule
    stunSec: 0.5, // resets/retargets — §1 row 11
  },
  cannon: {
    id: "cannon",
    name: "Cannon",
    type: "building",
    cost: 3,
    rarity: "common",
    hp: 750,
    damage: 210,
    hitSpeed: 0.8,
    dps: dps(210, 0.8), // ~262
    speed: 0, // static
    range: 5.5, // tie with Archers — §6.4
    sightRange: 5.5,
    targets: "ground", // dead weight vs air — §3
    count: 1,
    radius: 0,
    durationMs: 30_000, // lifetime 30s — §1 row 12
    deployDelaySec: 1.0, // deploy time 1.0s — §1 row 12
  },
};

/**
 * Merge the generated full-catalog table (scripts/generate_card_table.py) with
 * the hand-tuned baseline above. Baseline ids win, so the 12 tournament cards
 * keep their exact stats while every other catalog card becomes playable.
 * O(n) once at module load, n = catalog size (108).
 */
function mergeGenerated(): void {
  for (const [id, g] of Object.entries(GENERATED_CARDS)) {
    if (CARDS[id] !== undefined) continue; // hand-tuned baseline wins
    CARDS[id] = {
      id: g.id,
      name: g.name,
      type: g.type,
      cost: g.cost,
      rarity: g.rarity as Rarity,
      hp: g.hp,
      damage: g.damage,
      hitSpeed: g.hitSpeed,
      dps: g.dps,
      speed: g.speed,
      range: g.range,
      sightRange: g.sightRange,
      targets: g.targets as TargetMask,
      count: g.count,
      radius: g.radius,
      ...(g.flying ? { flying: true } : {}),
      ...(g.towerDamage !== undefined ? { towerDamage: g.towerDamage } : {}),
      ...(g.durationMs !== undefined ? { durationMs: g.durationMs } : {}),
      ...(g.stunSec !== undefined ? { stunSec: g.stunSec } : {}),
    };
  }
}

mergeGenerated();

/** Every playable card id (catalog order is alphabetical from the generator). */
export const CARD_LIST: CardDef[] = Object.values(CARDS);

export function getCard(id: string): CardDef | undefined {
  return CARDS[id];
}

export function isSpell(id: string): boolean {
  return CARDS[id]?.type === "spell";
}

export function isBuilding(id: string): boolean {
  return CARDS[id]?.type === "building";
}

/**
 * Deck-construction rule (§4): exactly 8 distinct ids from the pool,
 * max 2 spells. Returns an error code or null when legal.
 */
export function validateDeck(deck: string[]): { code: string; message: string } | null {
  if (!Array.isArray(deck) || deck.length !== 8) {
    return { code: "BAD_DECK", message: "deck must contain exactly 8 cards" };
  }
  const seen = new Set<string>();
  let spells = 0;
  for (const id of deck) {
    const card = CARDS[id];
    if (!card) return { code: "BAD_DECK", message: `unknown card: ${id}` };
    if (seen.has(id)) return { code: "BAD_DECK", message: `duplicate card: ${id}` };
    seen.add(id);
    if (card.type === "spell") spells += 1;
  }
  if (spells > 2) return { code: "BAD_DECK", message: "at most 2 spells per deck" };
  return null;
}
