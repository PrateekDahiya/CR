/**
 * Client card index. Card facts come from the generated catalog, which is
 * produced from the database content endpoint. There is no separate hand-
 * written 12-card client list.
 */

import { GENERATED_CARD_LIST } from "./cards.generated";

export type CardKind = "troop" | "spell" | "building" | "tower";
export type CardRarity = "common" | "rare" | "epic" | "legendary" | "champion";
export type CardTargets = "ground" | "air+ground" | "buildings" | "all" | "none";

export interface CardInfo {
  id: string;
  name: string;
  type: CardKind;
  cost: number;
  rarity: CardRarity;
  hp: number;
  damage: number;
  dps: number;
  hitSpeed: number;
  speed: number;
  range: number;
  targets: CardTargets;
  count: number;
  radius: number;
  towerDamage?: number;
  stunSec?: number;
  durationMs?: number;
  deathBurst?: number;
  description: string;
  splashRadius?: number;
  dashDamage?: number;
  dashRadius?: number;
  chargeDamage?: number;
  deathDamage?: number;
  spawnDamage?: number;
  shieldHp?: number;
}

export const DECK_SIZE = 8;
export const MAX_SPELLS = 2;

export const CARDS: Record<string, CardInfo> = Object.fromEntries(
  GENERATED_CARD_LIST.map((card) => [card.id, card]),
);

export const CARD_LIST: CardInfo[] = Object.values(CARDS);
export const SPELL_IDS: readonly string[] = CARD_LIST.filter((card) => card.type === "spell").map((card) => card.id);

export function getCard(id: string): CardInfo | undefined {
  return CARDS[id];
}

export function isSpell(id: string): boolean {
  return CARDS[id]?.type === "spell";
}

export function isTowerTroop(id: string): boolean {
  return CARDS[id]?.type === "tower";
}

export function countSpells(deck: readonly string[]): number {
  return deck.filter(isSpell).length;
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
  "golem",
  "giant",
  "mini-pekka",
  "knight",
  "archers",
  "musketeer",
  "zap",
  "cannon",
];
