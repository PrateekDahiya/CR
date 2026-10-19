/**
 * backend/src/game/botDeck.ts — AI deck generation (Phase 14).
 *
 * The AI no longer uses a fixed list of three hardcoded decks. At match start
 * it generates a fresh, role-valid eight-card deck from the real catalog using
 * the SAME role table the player's Random Deck button uses
 * (`shared/card-roles.json`, generated from `frontend/lib/cardRoles.ts`).
 *
 * The deck is chosen once per match and stored in the room, so it never changes
 * mid-match. Consecutive matches avoid repeating the identical ordered deck
 * whenever another valid arrangement is available.
 */

import fs from "node:fs";
import path from "node:path";
import { CARDS } from "./cards.js";

export const MANDATORY_ROLES = [
  "building",
  "big_spell",
  "small_spell",
  "tank",
  "ranged",
  "splash",
  "win_condition",
] as const;
export type MandatoryRole = (typeof MANDATORY_ROLES)[number];

interface CardFact {
  id: string;
  type: string;
  cost: number;
  tags: readonly string[];
}

let roleTableCache: { roles: string[]; cardRoles: Record<string, string[]> } | null = null;

/** Load `shared/card-roles.json` (one source of truth with the frontend). */
function loadRoleTable(): { roles: string[]; cardRoles: Record<string, string[]> } {
  if (roleTableCache !== null) return roleTableCache;
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "shared", "card-roles.json"),
    path.resolve(process.cwd(), "..", "shared", "card-roles.json"),
    path.resolve(process.cwd(), "shared", "card-roles.json"),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
        roles: string[];
        cardRoles: Record<string, string[]>;
      };
      roleTableCache = parsed;
      return parsed;
    } catch {
      continue;
    }
  }
  throw new Error("shared/card-roles.json not found — run python scripts/generate_role_table.py");
}

/** Role tags for a card id, from the shared table. Empty when unclassified. */
export function cardTags(cardId: string): readonly string[] {
  return loadRoleTable().cardRoles[cardId] ?? [];
}

export function hasRole(card: CardFact, role: string): boolean {
  return card.tags.includes(role);
}

/** True when the shared role table marks this card with `role`. */
export function cardHasRole(cardId: string, role: string): boolean {
  return cardTags(cardId).includes(role);
}

/** Which mandatory roles a card can satisfy. */
export function coveredRoles(card: CardFact): MandatoryRole[] {
  const covered: MandatoryRole[] = [];
  if (card.type === "building" || hasRole(card, "building")) covered.push("building");
  if (card.type === "spell" && hasRole(card, "big_spell")) covered.push("big_spell");
  if (card.type === "spell" && hasRole(card, "small_spell")) covered.push("small_spell");
  if (hasRole(card, "tank")) covered.push("tank");
  if (card.type !== "spell" && hasRole(card, "ranged")) covered.push("ranged");
  // The mandatory splash role is a troop/attacking building, never an area spell.
  if (card.type !== "spell" && hasRole(card, "splash")) covered.push("splash");
  if (hasRole(card, "win_condition")) covered.push("win_condition");
  return covered;
}

/** Playable, classified cards available to the generator. */
export function botDeckPool(): CardFact[] {
  const { cardRoles } = loadRoleTable();
  const pool: CardFact[] = [];
  for (const card of Object.values(CARDS)) {
    if (card.type === "tower") continue;
    const tags = cardRoles[card.id];
    if (tags === undefined || tags.length === 0) continue;
    pool.push({ id: card.id, type: card.type, cost: card.cost, tags });
  }
  return pool;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

function fillerWeight(card: CardFact, selected: readonly CardFact[]): number {
  let weight = 1;
  const antiAir = selected.filter((c) => c.type !== "spell" && hasRole(c, "anti_air")).length;
  const killers = selected.filter((c) => c.type !== "spell" && hasRole(c, "tank_killer")).length;
  const avg = selected.reduce((sum, c) => sum + c.cost, 0) / Math.max(1, selected.length);
  if (card.type !== "spell" && hasRole(card, "anti_air") && antiAir < 2) weight += 2.2;
  if (card.type !== "spell" && hasRole(card, "tank_killer") && killers < 1) weight += 1.8;
  if (card.cost <= 2) weight += 0.8;
  if (avg < 3.0 && card.cost >= 4) weight += 1.0;
  if (avg > 4.2 && card.cost <= 3) weight += 1.0;
  if (hasRole(card, "tank") && card.cost >= 6) weight *= 0.4;
  return Math.max(0.05, weight);
}

interface Ctx {
  pool: CardFact[];
  random: () => number;
  maxNodes: number;
  nodes: number;
}

function search(ctx: Ctx, selected: CardFact[]): boolean {
  if (selected.length === 8) return true;
  if (ctx.nodes++ > ctx.maxNodes) return false;

  const chosen = new Set(selected.map((card) => card.id));
  const remaining = ctx.pool.filter((card) => !chosen.has(card.id));
  const covered = new Set<MandatoryRole>();
  for (const card of selected) {
    for (const role of coveredRoles(card)) covered.add(role);
  }
  const uncovered = MANDATORY_ROLES.filter((role) => !covered.has(role));

  if (uncovered.length > 0) {
    // Every uncovered role must still be satisfiable, or this branch is dead.
    for (const role of uncovered) {
      if (!remaining.some((card) => coveredRoles(card).includes(role))) return false;
    }
    // Minimum remaining values: satisfy the scarcest role first.
    let best: CardFact[] | null = null;
    for (const role of uncovered) {
      const candidates = remaining.filter((card) => coveredRoles(card).includes(role));
      if (candidates.length === 0) return false;
      if (best === null || candidates.length < best.length) best = candidates;
    }
    for (const card of shuffle(best ?? [], ctx.random)) {
      selected.push(card);
      if (search(ctx, selected)) return true;
      selected.pop();
      if (ctx.nodes > ctx.maxNodes) return false;
    }
    return false;
  }

  const ordered = shuffle(remaining, ctx.random);
  const candidates = ordered
    .slice()
    .sort((a, b) => fillerWeight(b, selected) - fillerWeight(a, selected))
    .slice(0, Math.min(5, ordered.length));
  const rest = ordered.filter((card) => !candidates.includes(card));
  for (const card of [...candidates, ...rest]) {
    selected.push(card);
    if (search(ctx, selected)) return true;
    selected.pop();
    if (ctx.nodes > ctx.maxNodes) return false;
  }
  return false;
}

export interface BotDeckResult {
  ok: boolean;
  deck: string[];
  unsatisfiedRoles: MandatoryRole[];
  problems: string[];
}

/**
 * Generate one valid eight-card AI deck.
 *
 * `avoidOrdered` (the previous match's ordered deck) is honoured when another
 * valid arrangement exists: several bounded attempts are made before giving up.
 */
export function generateBotDeck(options: {
  random?: () => number;
  avoidOrdered?: readonly string[];
  maxNodes?: number;
  attempts?: number;
} = {}): BotDeckResult {
  const random = options.random ?? Math.random;
  const maxNodes = options.maxNodes ?? 4000;
  const pool = botDeckPool();
  if (pool.length < 8) {
    return {
      ok: false,
      deck: [],
      unsatisfiedRoles: [...MANDATORY_ROLES],
      problems: [`only ${pool.length} classified playable cards available`],
    };
  }

  const attempts = options.avoidOrdered === undefined ? 1 : (options.attempts ?? 8);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ctx: Ctx = { pool, random, maxNodes, nodes: 0 };
    const selected: CardFact[] = [];
    if (!search(ctx, selected)) continue;
    const deck = selected.map((card) => card.id);
    if (options.avoidOrdered !== undefined && deck.join(",") === options.avoidOrdered.join(",")) {
      continue;
    }
    return { ok: true, deck, unsatisfiedRoles: [], problems: [] };
  }

  return {
    ok: false,
    deck: [],
    unsatisfiedRoles: [...MANDATORY_ROLES],
    problems: [`no valid AI deck found within ${attempts} attempts (${maxNodes} nodes each)`],
  };
}

/**
 * Deck for one match. Stable for a given matchId *seed* option, but random by
 * default so two consecutive practice matches get different decks.
 */
export function botDeckFor(matchId: string, previous?: readonly string[]): string[] {
  const result = generateBotDeck(
    previous === undefined ? {} : { avoidOrdered: previous },
  );
  if (result.ok) return result.deck;
  // Falling back to a hardcoded deck would silently break the role rules, so
  // surface the reason instead. Any role-valid pool always succeeds in practice.
  throw new Error(`AI deck generation failed: ${result.problems.join("; ")} (match ${matchId})`);
}