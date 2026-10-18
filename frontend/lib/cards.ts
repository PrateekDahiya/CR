/**
 * frontend/lib/cards.ts — client-side card library (Phase 4 deck/lib).
 *
 * Source: docs/GAME_DESIGN.md §1 (12 cards, tournament baseline Level 9).
 * Mirrors backend/src/game/cards.ts CARDS (cost/hp/dps) for deck-builder display
 * + client-side deck validation. Server is authoritative on any disagreement.
 *
 * Pure TS: no socket, no node, no React imports. Tailwind n/a here.
 * Deck rule (§4): exactly 8 distinct ids, max 2 spells.
 */

export type CardKind = "troop" | "spell" | "building";

import { GENERATED_CARD_LIST } from "./cards.generated";

export type CardRarity = "common" | "rare" | "epic" | "legendary" | "champion";

export type CardTargets = "ground" | "air+ground" | "buildings" | "all";

export interface CardInfo {
  id: string;
  name: string;
  type: CardKind;
  /** Elixir cost 1-6. */
  cost: number;
  rarity: CardRarity;
  /** Per-unit HP (multiply by count for squad total). 0 for spells. */
  hp: number;
  /** Damage per hit (per unit). Full spell damage for spells. */
  damage: number;
  /** Convenience: damage / hitSpeed per unit. 0 for spells. */
  dps: number;
  /** Seconds between attacks. 0 for instant spells. */
  hitSpeed: number;
  /** Tiles/sec. 0 = static (Cannon) / spells. */
  speed: number;
  /** Attack range in tiles (0 = cast anywhere for spells). */
  range: number;
  targets: CardTargets;
  /** Troops spawned on play (0 for spells). */
  count: number;
  /** Splash / spell radius in tiles (0 = single-target). */
  radius: number;
  /** Spell damage vs crown towers (40% rule). Undefined for non-spells. */
  towerDamage?: number;
  /** Zap stun seconds. */
  stunSec?: number;
  /** Cannon lifetime (ms). */
  durationMs?: number;
  /** Rock Golem death burst damage. */
  deathBurst?: number;
}

function dps(damage: number, hitSpeed: number): number {
  return hitSpeed > 0 ? damage / hitSpeed : 0;
}

export const DECK_SIZE = 8;
export const MAX_SPELLS = 2;

export const SPELL_IDS: readonly string[] = ["fireball", "arrows", "zap"];

export const CARDS: Record<string, CardInfo> = {
  knight: {
    id: "knight",
    name: "Knight",
    type: "troop",
    cost: 3,
    rarity: "common",
    hp: 1450,
    damage: 165,
    dps: dps(165, 1.1),
    hitSpeed: 1.1,
    speed: 0.9,
    range: 0.8,
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
    dps: dps(95, 1.1),
    hitSpeed: 1.1,
    speed: 0.9,
    range: 5.5, // tie with Cannon — §6.4
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
    dps: dps(210, 1.5),
    hitSpeed: 1.5,
    speed: 0.6,
    range: 0.8,
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
    dps: dps(80, 1.0),
    hitSpeed: 1.0,
    speed: 1.2,
    range: 0.6,
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
    dps: dps(200, 1.0),
    hitSpeed: 1.0,
    speed: 0.9,
    range: 6.0,
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
    damage: 150,
    dps: dps(150, 1.6),
    hitSpeed: 1.6,
    speed: 1.1,
    range: 3.5,
    targets: "air+ground",
    count: 1,
    radius: 1.5,
  },
  "mini-pekka": {
    id: "mini-pekka",
    name: "Mini P.E.K.K.A",
    type: "troop",
    cost: 4,
    rarity: "rare",
    hp: 1100,
    damage: 550,
    dps: dps(550, 1.6),
    hitSpeed: 1.6,
    speed: 1.2,
    range: 0.8,
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
    dps: dps(260, 2.0),
    hitSpeed: 2.0,
    speed: 0.5,
    range: 0.8,
    targets: "buildings",
    count: 1,
    radius: 0,
    deathBurst: 280,
  },
  fireball: {
    id: "fireball",
    name: "Fireball",
    type: "spell",
    cost: 4,
    rarity: "rare",
    hp: 0,
    damage: 700,
    dps: 0,
    hitSpeed: 0,
    speed: 0,
    range: 0,
    targets: "all",
    count: 0,
    radius: 2.5,
    towerDamage: 280,
  },
  arrows: {
    id: "arrows",
    name: "Arrows",
    type: "spell",
    cost: 3,
    rarity: "common",
    hp: 0,
    damage: 300,
    dps: 0,
    hitSpeed: 0,
    speed: 0,
    range: 0,
    targets: "all",
    count: 0,
    radius: 4.0,
    durationMs: 600,
    towerDamage: 120,
  },
  zap: {
    id: "zap",
    name: "Zap",
    type: "spell",
    cost: 2,
    rarity: "common",
    hp: 0,
    damage: 220,
    dps: 0,
    hitSpeed: 0,
    speed: 0,
    range: 0,
    targets: "all",
    count: 0,
    radius: 2.5,
    towerDamage: 88,
    stunSec: 0.5,
  },
  cannon: {
    id: "cannon",
    name: "Cannon",
    type: "building",
    cost: 3,
    rarity: "common",
    hp: 750,
    damage: 210,
    dps: dps(210, 0.8),
    hitSpeed: 0.8,
    speed: 0,
    range: 5.5,
    targets: "ground",
    count: 1,
    radius: 0,
    durationMs: 30_000,
  },
};

/**
 * Full catalog (108 cards) generated by scripts/generate_card_table.py from the
 * same source as the server table, so client and engine never disagree on cost
 * or stats. The hand-tuned 12 above win; the rest fill in without overwriting.
 * O(n) once at module load, n = catalog size (108).
 */
for (const c of GENERATED_CARD_LIST) {
  if (CARDS[c.id] === undefined) CARDS[c.id] = c;
}

/** Every playable card (full catalog). */
export const CARD_LIST: CardInfo[] = Object.values(CARDS);

export function getCard(id: string): CardInfo | undefined {
  return CARDS[id];
}

export function isSpell(id: string): boolean {
  return CARDS[id]?.type === "spell";
}

export function countSpells(deck: readonly string[]): number {
  return deck.filter((id) => isSpell(id)).length;
}

export function averageCost(deck: readonly string[]): number {
  if (deck.length === 0) return 0;
  const total = deck.reduce((sum, id) => sum + (CARDS[id]?.cost ?? 0), 0);
  return total / deck.length;
}

export interface DeckValidation {
  valid: boolean;
  error?: string;
}

/**
 * Deck-construction rule (§4): exactly 8 distinct known ids, max 2 spells.
 * Client-side mirror of backend validateDeck (BAD_DECK). Server wins on disagreement.
 */
export function validateDeck(deck: readonly string[]): DeckValidation {
  if (!Array.isArray(deck) || deck.length !== DECK_SIZE) {
    return { valid: false, error: `deck must contain exactly ${DECK_SIZE} cards` };
  }
  const seen = new Set<string>();
  let spells = 0;
  for (const id of deck) {
    const card = CARDS[id];
    if (!card) return { valid: false, error: `unknown card: ${id}` };
    if (seen.has(id)) return { valid: false, error: `duplicate card: ${id}` };
    seen.add(id);
    if (card.type === "spell") spells += 1;
  }
  if (spells > MAX_SPELLS) {
    return { valid: false, error: `at most ${MAX_SPELLS} spells per deck` };
  }
  return { valid: true };
}

/** Example starter decks (§4) — both legal. */
export const STARTER_DECK_BALANCED: string[] = [
  "knight",
  "archers",
  "musketeer",
  "baby-dragon",
  "giant",
  "skeletons",
  "fireball",
  "cannon",
];

export const STARTER_DECK_HEAVY: string[] = [
  "rock-golem",
  "giant",
  "mini-pekka",
  "knight",
  "archers",
  "musketeer",
  "zap",
  "cannon",
];
