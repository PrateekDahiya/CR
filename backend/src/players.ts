/**
 * players.ts — player state: identity, trophies, wallet, card collection and
 * multiple decks. Single in-memory store (the dev/preview persistence layer);
 * db.ts keeps its own minimal user rows for the legacy meta routes.
 *
 * Perf (MEMORY#20): every getter/mutator is O(1) hash work except
 * listDecks (O(d), d = decks per player, max ~10) and the player table
 * (O(n log n) sort on read, n = players).
 */

import { CARDS, CARD_LIST } from "./game/cards.js";

export const DECK_SIZE = 8;
const isBattleCard = (id: string): boolean => CARDS[id] !== undefined;

/** Starter deck (same list as the frontend fallback). */
const DECK_FALLBACK: string[] = CARD_LIST
  .filter((card) => card.type !== "tower")
  .slice(0, DECK_SIZE)
  .map((card) => card.id);

export interface Player {
  playerId: string;
  name: string;
  trophies: number;
  coins: number;
  gems: number;
  wins: number;
  losses: number;
  draws: number;
  /** Card id -> level (1..16). Owned cards only. */
  cards: Record<string, number>;
  /** Crown-tower troop id -> level (1..16); progressed independently. */
  towerLevels: Record<string, number>;
  decks: Deck[];
  activeDeckId: string | null;
  createdAtMs: number;
}

export interface Deck {
  id: string;
  name: string;
  cards: string[];
  levels: Record<string, number>;
  towerTroopId?: string;
}

/** Trophy/coin payout per result (real-CR-like: win is worth playing). */
export const REWARDS = {
  win: { trophies: 30, coins: 60 },
  draw: { trophies: 10, coins: 20 },
  loss: { trophies: -20, coins: 5 },
} as const;

const players = new Map<string, Player>();
let seq = 0;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

function defaultName(playerId: string): string {
  const short = playerId.replace(/^(guest|p)[-_]?/i, "");
  return short.length > 0 ? short.slice(0, 12) : "Player";
}

function starterDeck(name = "Battle Deck"): Deck {
  return { id: nextId("deck"), name, cards: [...DECK_FALLBACK], levels: Object.fromEntries(DECK_FALLBACK.map((id) => [id, 1])) };
}

/**
 * Cards a brand-new account starts with.
 *
 * Covers every mandatory deck role (building, big spell, small spell, tank,
 * ranged, splash, win condition) so a random deck can always be generated from
 * a fresh account, while leaving the rest of the catalog to the shop.
 */
const STARTER_COLLECTION: string[] = [
  "cannon", // building
  "fireball", // big spell
  "arrows", // small spell
  "zap", // small spell
  "giant", // tank + win condition
  "musketeer", // ranged
  "baby-dragon", // ranged splash
  "knight", // filler
  "archers", // filler
  "skeletons", // filler
];

/** Creates on first sight. O(1). */
export function ensurePlayer(playerId: string): Player {
  const existing = players.get(playerId);
  if (existing !== undefined) return existing;
  const deck = starterDeck();
  const player: Player = {
    playerId,
    name: defaultName(playerId),
    trophies: 0,
    coins: 500,
    gems: 20,
    wins: 0,
    losses: 0,
    draws: 0,
    // Phase 14 fix: a new player owns the STARTER collection, not the whole
    // 108-card catalog. Granting every catalog card left the shop with nothing
    // to sell (every deal resolved as "already owned"), which made the economy
    // dead. The deck builder remains card-agnostic, so all 108 cards stay
    // usable in battle; the shop simply has inventory again.
    cards: Object.fromEntries(STARTER_COLLECTION.map((id) => [id, 9])),
    towerLevels: Object.fromEntries(
      Object.values(CARDS)
        .filter((card) => card.type === "tower")
        .map((card) => [card.id, 1]),
    ),
    decks: [deck],
    activeDeckId: deck.id,
    createdAtMs: Date.now(),
  };
  players.set(playerId, player);
  return player;
}

export function getPlayer(playerId: string): Player | undefined {
  return players.get(playerId);
}

export function setName(playerId: string, name: string): Player {
  const p = ensurePlayer(playerId);
  const clean = name.trim().slice(0, 16);
  if (clean.length > 0) p.name = clean;
  return p;
}

/** O(d) deck list for one player. */
export function listDecks(playerId: string): Deck[] {
  return ensurePlayer(playerId).decks.map((d) => ({ ...d, cards: [...d.cards], levels: { ...d.levels } }));
}

export function getDeck(playerId: string, deckId: string): Deck | undefined {
  return ensurePlayer(playerId).decks.find((d) => d.id === deckId);
}

export function activeDeck(playerId: string): Deck {
  const p = ensurePlayer(playerId);
  const active = p.decks.find((d) => d.id === p.activeDeckId) ?? p.decks[0];
  return active ?? starterDeck();
}

/** Creates a deck (optionally from cards). O(d) to insert. */
export function createDeck(playerId: string, name?: string, cards?: string[]): Deck {
  const p = ensurePlayer(playerId);
  const clean = normalizeCards(cards);
  const selected = clean ?? [...DECK_FALLBACK];
  const deck: Deck = {
    id: nextId("deck"),
    name: (name ?? `Deck ${p.decks.length + 1}`).trim().slice(0, 20) || `Deck ${p.decks.length + 1}`,
    cards: selected,
    levels: Object.fromEntries(selected.map((id) => [id, ensurePlayer(playerId).cards[id] ?? 1])),
  };
  p.decks.push(deck);
  if (p.activeDeckId === null) p.activeDeckId = deck.id;
  return { ...deck, cards: [...deck.cards], levels: { ...deck.levels } };
}

/** Updates name/cards. O(d). Unknown ids or an invalid 8-card set are rejected. */
export function updateDeck(
  playerId: string,
  deckId: string,
  patch: { name?: string; cards?: string[]; levels?: Record<string, number>; towerTroopId?: string },
): Deck | null {
  const p = ensurePlayer(playerId);
  const deck = p.decks.find((d) => d.id === deckId);
  if (deck === undefined) return null;
  if (typeof patch.name === "string") {
    const clean = patch.name.trim().slice(0, 20);
    if (clean.length > 0) deck.name = clean;
  }
  if (Array.isArray(patch.cards)) {
    const clean = normalizeCards(patch.cards);
    if (clean === null) return null;
    deck.cards = clean;
    deck.levels = Object.fromEntries(clean.map((id) => [id, deck.levels[id] ?? p.cards[id] ?? 1]));
  }
  if (patch.levels !== undefined) deck.levels = { ...deck.levels, ...patch.levels };
  if (patch.towerTroopId !== undefined) deck.towerTroopId = patch.towerTroopId;
  return { ...deck, cards: [...deck.cards], levels: { ...deck.levels } };
}

/** Picks the deck used for the next match. O(d). */
export function selectDeck(playerId: string, deckId: string): Deck | null {
  const p = ensurePlayer(playerId);
  if (!p.decks.some((d) => d.id === deckId)) return null;
  p.activeDeckId = deckId;
  const deck = p.decks.find((d) => d.id === deckId);
  return deck === undefined ? null : { ...deck, cards: [...deck.cards] };
}

export function deleteDeck(playerId: string, deckId: string): boolean {
  const p = ensurePlayer(playerId);
  if (p.decks.length <= 1) return false; // always keep one deck
  const idx = p.decks.findIndex((d) => d.id === deckId);
  if (idx === -1) return false;
  p.decks.splice(idx, 1);
  if (p.activeDeckId === deckId) p.activeDeckId = p.decks[0]?.id ?? null;
  return true;
}

/** 8 unique engine-known cards, or null. O(k) with k = input length. */
export function normalizeCards(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const id = String(raw);
    if (!isBattleCard(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === DECK_SIZE) break;
  }
  if (out.length !== DECK_SIZE) return null;
  return out;
}

/** Award/redeem wallet amounts. O(1). Returns false when funds are short. */
export function adjustWallet(
  playerId: string,
  delta: { coins?: number; gems?: number },
): boolean {
  const p = ensurePlayer(playerId);
  const coins = delta.coins ?? 0;
  const gems = delta.gems ?? 0;
  if (p.coins + coins < 0 || p.gems + gems < 0) return false;
  p.coins += coins;
  p.gems += gems;
  return true;
}

/** Grants cards (by id, +level delta). O(k). */
export function grantCards(playerId: string, ids: string[], level = 1): void {
  const p = ensurePlayer(playerId);
  for (const id of ids) {
    if (!isBattleCard(id)) continue;
    p.cards[id] = Math.min(15, (p.cards[id] ?? 0) + level);
  }
}

export function ownsCard(playerId: string, cardId: string): boolean {
  return (ensurePlayer(playerId).cards[cardId] ?? 0) > 0;
}

export const CARD_MAX_LEVEL = 16;

/** Coin cost to take a card from `level` to `level + 1`. O(1). */
export function cardUpgradeCost(level: number): number {
  return Math.round(200 * Math.pow(1.35, Math.max(0, level - 1)));
}

export type TowerUpgradeResult =
  | { ok: true; towerId: string; level: number; cost: number; coins: number }
  | { ok: false; code: "BAD_TOWER" | "MAX_LEVEL" | "NO_COINS"; message: string; level: number; cost: number };

/** Upgrade one crown tower troop by one level (separate from card levels). */
export function upgradeTower(playerId: string, towerId: string): TowerUpgradeResult {
  const p = ensurePlayer(playerId);
  if (CARDS[towerId]?.type !== "tower") {
    return { ok: false, code: "BAD_TOWER", message: "unknown tower troop", level: 0, cost: 0 };
  }
  const current = p.towerLevels[towerId] ?? 1;
  if (current >= CARD_MAX_LEVEL) {
    return { ok: false, code: "MAX_LEVEL", message: "tower is already at max level", level: current, cost: 0 };
  }
  const cost = cardUpgradeCost(current);
  if (p.coins < cost) {
    return { ok: false, code: "NO_COINS", message: "not enough coins", level: current, cost };
  }
  p.coins -= cost;
  p.towerLevels[towerId] = current + 1;
  return { ok: true, towerId, level: current + 1, cost, coins: p.coins };
}

export type UpgradeResult =
  | { ok: true; cardId: string; level: number; cost: number; coins: number }
  | { ok: false; code: "NOT_OWNED" | "MAX_LEVEL" | "NO_COINS"; message: string; level: number; cost: number };

/**
 * Upgrades one owned card by one level and charges the player's coins.
 * Deck level snapshots containing the card are refreshed so the next match
 * uses the new level immediately. O(k), k = decks per player.
 */
export function upgradeCard(playerId: string, cardId: string): UpgradeResult {
  const p = ensurePlayer(playerId);
  const current = p.cards[cardId] ?? 0;
  if (!isBattleCard(cardId) || current <= 0) {
    return { ok: false, code: "NOT_OWNED", message: "card is not owned", level: current, cost: 0 };
  }
  if (current >= CARD_MAX_LEVEL) {
    return { ok: false, code: "MAX_LEVEL", message: "card is already at max level", level: current, cost: 0 };
  }
  const cost = cardUpgradeCost(current);
  if (p.coins < cost) {
    return { ok: false, code: "NO_COINS", message: "not enough coins", level: current, cost };
  }
  p.coins -= cost;
  const next = current + 1;
  p.cards[cardId] = next;
  for (const deck of p.decks) {
    if (deck.cards.includes(cardId)) deck.levels[cardId] = next;
  }
  return { ok: true, cardId, level: next, cost, coins: p.coins };
}

/**
 * Applies a match result to both players. O(1) per player.
 * Returns the per-player trophy deltas so the UI can show +/-
 */
export function applyMatchResult(input: {
  blueId: string | null;
  redId: string | null;
  winner: "blue" | "red" | "draw";
  crowns?: { blue: number; red: number };
}): { playerId: string; trophyDelta: number; coinDelta: number }[] {
  const out: { playerId: string; trophyDelta: number; coinDelta: number }[] = [];
  const apply = (pid: string | null, result: "win" | "loss" | "draw") => {
    if (pid === null || pid.length === 0 || pid.startsWith("bot-")) return;
    const p = ensurePlayer(pid);
    const reward = REWARDS[result];
    p.trophies = Math.max(0, p.trophies + reward.trophies);
    p.coins += reward.coins;
    if (result === "win") p.wins += 1;
    else if (result === "loss") p.losses += 1;
    else p.draws += 1;
    out.push({ playerId: pid, trophyDelta: reward.trophies, coinDelta: reward.coins });
  };
  if (input.winner === "draw") {
    apply(input.blueId, "draw");
    apply(input.redId, "draw");
  } else {
    apply(input.blueId, input.winner === "blue" ? "win" : "loss");
    apply(input.redId, input.winner === "red" ? "win" : "loss");
  }
  return out;
}

/** Player table rows sorted by trophies. O(n log n) read, n = players. */
export function playerTable(limit = 50): Array<
  Player & { rank: number; winRate: number }
> {
  return [...players.values()]
    .sort((a, b) => b.trophies - a.trophies || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((p, i) => {
      const games = p.wins + p.losses + p.draws;
      return {
        ...p,
        cards: { ...p.cards },
        decks: p.decks.map((d) => ({ ...d, cards: [...d.cards] })),
        rank: i + 1,
        winRate: games === 0 ? 0 : Math.round((p.wins / games) * 100),
      };
    });
}

/** Convenience for shop cards: every engine card id. O(1) array copy. */
export function allCardIds(): string[] {
  return Object.keys(CARDS);
}

export function resetPlayers(): void {
  players.clear();
  seq = 0;
}
