/**
 * Runtime card index.
 *
 * Card facts are generated from the catalog and mechanics are hydrated from
 * MySQL before matchmaking. There is intentionally no hand-written card list
 * here: adding a catalog row is enough to make it visible to the engine.
 */

import { GENERATED_CARDS } from "./cards.generated.js";
import type { CardMechanicSpec } from "./cardMechanics.js";

export type CardKind = "troop" | "spell" | "building" | "tower";
export type TargetMask = "ground" | "air+ground" | "buildings" | "all";
export type Rarity = "common" | "rare" | "epic" | "legendary" | "champion";

export interface CardDef {
  id: string;
  name: string;
  type: CardKind;
  cost: number;
  rarity: Rarity;
  hp: number;
  damage: number;
  hitSpeed: number;
  dps: number;
  speed: number;
  range: number;
  sightRange: number;
  targets: TargetMask;
  count: number;
  radius: number;
  durationMs?: number;
  deployDelaySec?: number;
  stunSec?: number;
  deathBurst?: number;
  deathBurstRadius?: number;
  towerDamage?: number;
  flying?: boolean;
  /** Loaded from the database before a match starts. */
  mechanics?: CardMechanicSpec;
}

export const SPAWN_TEMPLATES: Record<string, CardDef> = {};

function fromGenerated(card: (typeof GENERATED_CARDS)[string]): CardDef {
  return {
    id: card.id,
    name: card.name,
    type: card.type as CardKind,
    cost: card.cost,
    rarity: card.rarity as Rarity,
    hp: card.hp,
    damage: card.damage,
    hitSpeed: card.hitSpeed,
    dps: card.dps,
    speed: card.speed,
    range: card.range,
    sightRange: card.sightRange,
    targets: card.targets as TargetMask,
    count: card.count,
    radius: card.radius,
    ...(card.flying ? { flying: true } : {}),
    ...(card.towerDamage !== undefined ? { towerDamage: card.towerDamage } : {}),
    ...(card.durationMs !== undefined ? { durationMs: card.durationMs } : {}),
    ...(card.stunSec !== undefined ? { stunSec: card.stunSec } : {}),
  };
}

/** The 108 catalog rows are the only card facts used by the server. */
export const CARDS: Record<string, CardDef> = Object.fromEntries(
  Object.entries(GENERATED_CARDS).map(([id, card]) => [id, fromGenerated(card)]),
);

export const CARD_LIST: CardDef[] = Object.values(CARDS);

export function getCard(id: string): CardDef | undefined {
  return CARDS[id];
}

export function getSpawnTemplate(id: string): CardDef | undefined {
  return SPAWN_TEMPLATES[id] ?? CARDS[id];
}

export function isSpell(id: string): boolean {
  return CARDS[id]?.type === "spell";
}

export function isBuilding(id: string): boolean {
  return CARDS[id]?.type === "building";
}

export function isTowerTroop(id: string): boolean {
  return CARDS[id]?.type === "tower" || CARDS[id]?.mechanics?.towerTroop === true;
}

export function isPlayableCard(id: string): boolean {
  return CARDS[id] !== undefined;
}

/** Apply database mechanics to the in-memory card index before matchmaking. */
export function hydrateCardMechanics(records: Record<string, CardMechanicSpec>): void {
  for (const [id, mechanics] of Object.entries(records)) {
    const card = CARDS[id];
    if (card !== undefined) card.mechanics = mechanics;
  }
}

export function hydrateSpawnTemplates(records: Record<string, CardDef>): void {
  for (const [id, template] of Object.entries(records)) SPAWN_TEMPLATES[id] = template;
}

/** All known cards are deployable in this clone, including tower profiles. */
export function validateDeck(deck: string[]): { code: string; message: string } | null {
  if (!Array.isArray(deck) || deck.length !== 8) {
    return { code: "BAD_DECK", message: "deck must contain exactly 8 cards" };
  }
  const seen = new Set<string>();
  let spells = 0;
  for (const id of deck) {
    const card = CARDS[id];
    if (!card) return { code: "BAD_DECK", message: `unknown card: ${id}` };
    // Phase 15: tower troops configure the crown tower and are selected before a
    // match, so they can never occupy a deck slot.
    if (card.type === "tower" || card.mechanics?.towerTroop === true) {
      return { code: "BAD_DECK", message: `${id} is a tower troop and cannot be in a deck` };
    }
    if (seen.has(id)) return { code: "BAD_DECK", message: `duplicate card: ${id}` };
    seen.add(id);
    if (card.type === "spell") spells += 1;
  }
  if (spells > 2) return { code: "BAD_DECK", message: "at most 2 spells per deck" };
  return null;
}
