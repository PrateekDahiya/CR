/**
 * frontend/lib/deckGenerator.ts — shared random deck generator (Phase 14).
 *
 * ONE generator serves both the player's Random Deck button and the AI, so a
 * bot deck and a button deck obey exactly the same rules.
 *
 * Strategy (not "pick 8 at random and hope"):
 *   1. Filter the pool to playable, classified cards with unique ids.
 *   2. Represent the seven mandatory roles as explicit predicates.
 *   3. Repeatedly pick the role with the fewest still-available candidates
 *      (minimum remaining values), choose a candidate at random from that role,
 *      and recurse.
 *   4. Backtrack when a choice would strand a role that nothing else can fill.
 *   5. Once every role is covered, keep filling to exactly eight cards, choosing
 *      by weighted score so decks stay varied *and* balanced.
 *   6. Validate before returning. A genuine failure is reported with the exact
 *      unsatisfied roles — the requirements are never quietly relaxed.
 *
 * The search is bounded by `maxNodes`; it cannot spin forever.
 */

import { DECK_SIZE, getCard, type CardInfo } from "./cards";
import {
  MANDATORY_ROLES,
  cardRoles,
  providesBigSpell,
  providesBuilding,
  providesRanged,
  providesSmallSpell,
  providesSplash,
  providesTank,
  providesWinCondition,
  hasRole,
  type MandatoryRole,
} from "./cardRoles";
import {
  ELIXIR_SOFT_MAX,
  ELIXIR_SOFT_MIN,
  analyseQuality,
  rolesCoveredBy,
  validateGeneratedDeck,
  type DeckValidationResult,
} from "./deckValidation";

export type RandomFn = () => number;

export interface DeckGeneratorOptions {
  /** Injectable RNG so tests are deterministic. */
  random?: RandomFn;
  /** Hard cap on explored nodes, so a pathological pool cannot hang a tick. */
  maxNodes?: number;
  /** Cards that must never be generated (e.g. the player's current deck). */
  exclude?: readonly string[];
  /** Prefer to differ from this ordered deck (used to avoid AI repeats). */
  avoidOrdered?: readonly string[];
}

export interface DeckGenerationFailure {
  ok: false;
  unsatisfiedRoles: MandatoryRole[];
  problems: string[];
  nodesExplored: number;
  reason: "no_valid_deck" | "search_budget_exhausted";
}

export interface DeckGenerationSuccess {
  ok: true;
  deck: string[];
  validation: DeckValidationResult;
  nodesExplored: number;
}

export type DeckGenerationResult = DeckGenerationSuccess | DeckGenerationFailure;

/** Which mandatory role a card can cover. */
function coveredRoles(card: CardInfo): MandatoryRole[] {
  const covered: MandatoryRole[] = [];
  if (providesBuilding(card.id, card.type)) covered.push("building");
  if (providesBigSpell(card.id, card.type)) covered.push("big_spell");
  if (providesSmallSpell(card.id, card.type)) covered.push("small_spell");
  if (providesTank(card.id)) covered.push("tank");
  if (providesRanged(card.id, card.type)) covered.push("ranged");
  if (providesSplash(card.id, card.type)) covered.push("splash");
  if (providesWinCondition(card.id)) covered.push("win_condition");
  return covered;
}

function makeRandom(seed?: number): RandomFn {
  if (seed === undefined) return Math.random;
  // mulberry32 — small, fast, deterministic.
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: RandomFn): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

/**
 * Filter a pool down to cards that can legally occupy a deck slot:
 * known, playable, and classified. Unclassified cards are dropped so the
 * generator can never emit a card whose roles it cannot reason about.
 */
export function playablePool(pool: readonly string[]): CardInfo[] {
  const seen = new Set<string>();
  const cards: CardInfo[] = [];
  for (const id of pool) {
    if (seen.has(id)) continue;
    seen.add(id);
    const card = getCard(id);
    if (card === undefined) continue;
    if (card.type === "tower") continue;
    if (cardRoles(id).length === 0) continue; // unclassified cards are not usable
    cards.push(card);
  }
  return cards;
}

/**
 * Soft-quality score for a filler card: rewards cards that complement what is
 * already selected. Only used to pick among *valid* candidates, and applied
 * with weighted randomness so the generator does not emit the same deck.
 */
function fillerWeight(card: CardInfo, selected: readonly CardInfo[]): number {
  let weight = 1;
  const haveAntiAir = selected.filter((c) => c.type !== "spell" && hasRole(c.id, "anti_air")).length;
  const haveKiller = selected.filter((c) => c.type !== "spell" && hasRole(c.id, "tank_killer")).length;
  const haveSplash = selected.filter((c) => providesSplash(c.id, c.type)).length;
  const average = selected.reduce((sum, c) => sum + c.cost, 0) / Math.max(1, selected.length);

  if (card.type !== "spell" && hasRole(card.id, "anti_air") && haveAntiAir < 2) weight += 2.2;
  if (card.type !== "spell" && hasRole(card.id, "tank_killer") && haveKiller < 1) weight += 1.8;
  if (providesSplash(card.id, card.type) && haveSplash < 1) weight += 1.2;
  if (card.cost <= 2) weight += 0.8;
  if (card.cost <= 3 && hasRole(card.id, "cycle")) weight += 0.6;
  // Nudge the running average back toward the soft band.
  if (average < ELIXIR_SOFT_MIN && card.cost >= 4) weight += 1.0;
  if (average > ELIXIR_SOFT_MAX && card.cost <= 3) weight += 1.0;
  // Avoid stacking several very expensive tanks.
  if (hasRole(card.id, "tank") && card.cost >= 6) weight *= 0.4;
  if (card.type === "spell" && hasRole(card.id, "big_spell") && average < ELIXIR_SOFT_MIN) weight += 0.5;
  return Math.max(0.05, weight);
}

/** Weighted pick without replacement. */
function weightedPick(
  candidates: readonly CardInfo[],
  selected: readonly CardInfo[],
  random: RandomFn,
): CardInfo {
  const weights = candidates.map((card) => fillerWeight(card, selected));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return candidates[Math.floor(random() * candidates.length)];
  let roll = random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Is it still possible to cover every uncovered role with what remains? */
function rolesStillSatisfiable(
  uncovered: readonly MandatoryRole[],
  remaining: readonly CardInfo[],
): boolean {
  for (const role of uncovered) {
    let possible = false;
    for (const card of remaining) {
      if (coveredRoles(card).includes(role)) {
        possible = true;
        break;
      }
    }
    if (!possible) return false;
  }
  return true;
}

interface SearchContext {
  pool: CardInfo[];
  roleCandidates: Map<MandatoryRole, CardInfo[]>;
  random: RandomFn;
  maxNodes: number;
  avoidOrdered?: readonly string[];
  nodes: number;
}

/**
 * Backtracking fill. `selected` is mutated on the way down and restored on the
 * way out, so the caller always sees a consistent deck.
 */
function search(ctx: SearchContext, selected: CardInfo[]): boolean {
  if (selected.length === DECK_SIZE) return true;
  if (ctx.nodes++ > ctx.maxNodes) return false;

  const chosen = new Set(selected.map((card) => card.id));
  const remaining = ctx.pool.filter((card) => !chosen.has(card.id));

  const covered = new Set<MandatoryRole>();
  for (const card of selected) {
    for (const role of coveredRoles(card)) covered.add(role);
  }
  const uncovered = MANDATORY_ROLES.filter((role) => !covered.has(role));

  // --- Role-constrained selection with minimum remaining values ---
  if (uncovered.length > 0) {
    // A role is still satisfiable only if a *remaining* card covers it.
    const viableRoles = uncovered.filter((role) =>
      remaining.some((card) => coveredRoles(card).includes(role)),
    );
    if (viableRoles.length === 0) return false; // cannot cover everything -> backtrack

    if (!rolesStillSatisfiable(uncovered, remaining)) return false;

    // MRV: pick the role with the fewest available candidates.
    let bestRole: MandatoryRole = viableRoles[0];
    let bestCandidates: CardInfo[] = [];
    for (const role of viableRoles) {
      const candidates = remaining.filter((card) => coveredRoles(card).includes(role));
      if (bestCandidates.length === 0 || candidates.length < bestCandidates.length) {
        bestRole = role;
        bestCandidates = candidates;
      }
    }
    // Randomised ordering keeps decks varied; trying several candidates is the
    // backtracking: a bad first pick simply returns false and we try the next.
    for (const card of shuffle(bestCandidates, ctx.random)) {
      selected.push(card);
      if (search(ctx, selected)) return true;
      selected.pop();
      if (ctx.nodes > ctx.maxNodes) return false;
    }
    return false;
  }

  // --- All roles covered: fill to eight with weighted, balanced picks ---
  const ordered = shuffle(remaining, ctx.random);
  // Bias the first attempts towards higher-quality fillers so the deck is
  // usually good, but keep the order randomised so it is not always the same.
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

/**
 * Generate one valid eight-card deck.
 *
 * On failure it reports which mandatory roles could not be satisfied instead of
 * returning a deck that quietly breaks the rules.
 */
export function generateRandomDeck(
  pool: readonly string[],
  options: DeckGeneratorOptions = {},
): DeckGenerationResult {
  const random = options.random ?? makeRandom();
  const maxNodes = options.maxNodes ?? 4000;
  const excluded = new Set(options.exclude ?? []);
  const cards = playablePool(pool).filter((card) => !excluded.has(card.id));

  if (cards.length < DECK_SIZE) {
    return {
      ok: false,
      unsatisfiedRoles: [...MANDATORY_ROLES],
      problems: [`playable pool has only ${cards.length} usable cards, need ${DECK_SIZE}`],
      nodesExplored: 0,
      reason: "no_valid_deck",
    };
  }

  const roleCandidates = new Map<MandatoryRole, CardInfo[]>();
  for (const role of MANDATORY_ROLES) {
    roleCandidates.set(role, cards.filter((card) => coveredRoles(card).includes(role)));
  }

  const unsatisfiable = MANDATORY_ROLES.filter(
    (role) => (roleCandidates.get(role) ?? []).length === 0,
  );
  if (unsatisfiable.length > 0) {
    return {
      ok: false,
      unsatisfiedRoles: unsatisfiable,
      problems: [`no card in the pool can cover: ${unsatisfiable.join(", ")}`],
      nodesExplored: 0,
      reason: "no_valid_deck",
    };
  }

  const ctx: SearchContext = {
    pool: cards,
    roleCandidates,
    random,
    maxNodes,
    avoidOrdered: options.avoidOrdered,
    nodes: 0,
  };

  // A few independent attempts: each is a bounded search, and the optional
  // "avoid the previous ordered deck" rule needs more than one candidate.
  const attempts = options.avoidOrdered === undefined ? 1 : 8;
  let lastFailure: MandatoryRole[] = [...MANDATORY_ROLES];

  for (let attempt = 0; attempt < attempts; attempt++) {
    const selected: CardInfo[] = [];
    if (!search(ctx, selected)) continue;
    const deck = selected.map((card) => card.id);
    if (
      options.avoidOrdered !== undefined &&
      deck.join(",") === options.avoidOrdered.join(",")
    ) {
      continue; // identical to last match — try again
    }
    const validation = validateGeneratedDeck(deck);
    if (!validation.ok) {
      lastFailure = validation.unsatisfiedRoles;
      continue;
    }
    return { ok: true, deck, validation, nodesExplored: ctx.nodes };
  }

  return {
    ok: false,
    unsatisfiedRoles: lastFailure,
    problems: [
      `no deck satisfied all mandatory roles within ${maxNodes} search nodes`,
      "check card role classification — a role with too few candidates will fail here",
    ],
    nodesExplored: ctx.nodes,
    reason: ctx.nodes > maxNodes ? "search_budget_exhausted" : "no_valid_deck",
  };
}

/** Convenience wrapper for callers that only need a deck or `null`. */
export function tryGenerateRandomDeck(
  pool: readonly string[],
  options: DeckGeneratorOptions = {},
): string[] | null {
  const result = generateRandomDeck(pool, options);
  return result.ok ? result.deck : null;
}

export { analyseQuality };