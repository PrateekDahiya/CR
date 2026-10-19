/**
 * frontend/lib/deckValidation.ts — deck requirements + diagnostics (Phase 14).
 *
 * Two layers:
 *   - HARD: eight distinct playable cards and all seven mandatory roles.
 *   - SOFT: deck-quality preferences (anti-air answers, a tank killer, a cheap
 *     cycle card, a sensible average cost). These never reject a deck — a
 *     legitimate beatdown deck may sit outside the target elixir band.
 */

import {
  MANDATORY_ROLES,
  providesBigSpell,
  providesBuilding,
  providesRanged,
  providesSmallSpell,
  providesSplash,
  providesTank,
  providesWinCondition,
  cardRoles,
  hasRole,
  type MandatoryRole,
} from "./cardRoles";
import { DECK_SIZE, getCard, type CardInfo } from "./cards";

export const ELIXIR_SOFT_MIN = 3.0;
export const ELIXIR_SOFT_MAX = 4.2;

export interface DeckQuality {
  averageElixir: number;
  antiAirAnswers: number;
  tankKillers: number;
  cheapCycleCards: number;
  bigSpells: number;
  smallSpells: number;
  heavyFrontline: number;
  avgCycleCost: number;
}

export interface DeckValidationResult {
  ok: boolean;
  /** Exactly what went wrong — never silently weakened. */
  problems: string[];
  unsatisfiedRoles: MandatoryRole[];
  /** Cards present but unusable (unknown id, tower troop, not in catalog). */
  invalidCards: string[];
  duplicateCards: string[];
  quality: DeckQuality;
  softWarnings: string[];
}

/** Every mandatory role a card satisfies, for coverage maths. */
export function rolesCoveredBy(card: CardInfo): MandatoryRole[] {
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

export function isPlayableCard(id: string): boolean {
  const card = getCard(id);
  return card !== undefined && card.type !== "tower";
}

export function averageElixir(deck: readonly string[]): number {
  if (deck.length === 0) return 0;
  let total = 0;
  let counted = 0;
  for (const id of deck) {
    const card = getCard(id);
    if (card === undefined) continue;
    total += card.cost;
    counted++;
  }
  return counted === 0 ? 0 : total / counted;
}

export function analyseQuality(deck: readonly string[]): DeckQuality {
  let antiAirAnswers = 0;
  let tankKillers = 0;
  let cheapCycleCards = 0;
  let bigSpells = 0;
  let smallSpells = 0;
  let heavyFrontline = 0;
  let cycleTotal = 0;
  let cycleCount = 0;

  for (const id of deck) {
    const card = getCard(id);
    if (card === undefined) continue;
    const tags = cardRoles(id);
    // A spell is never an anti-air *unit* answer; the mandatory distinction
    // matters for the AI, which deploys troops/buildings to answer air.
    if (card.type !== "spell" && hasRole(id, "anti_air")) antiAirAnswers++;
    if (card.type !== "spell" && hasRole(id, "tank_killer")) tankKillers++;
    if (card.cost <= 2) cheapCycleCards++;
    if (card.type === "spell" && hasRole(id, "big_spell")) bigSpells++;
    if (card.type === "spell" && hasRole(id, "small_spell")) smallSpells++;
    if (hasRole(id, "tank") && card.cost >= 6) heavyFrontline++;
    if (tags.length > 0 && card.type !== "spell") {
      cycleTotal += card.cost;
      cycleCount++;
    }
  }

  return {
    averageElixir: averageElixir(deck),
    antiAirAnswers,
    tankKillers,
    cheapCycleCards,
    bigSpells,
    smallSpells,
    heavyFrontline,
    avgCycleCost: cycleCount === 0 ? 0 : cycleTotal / cycleCount,
  };
}

/**
 * Validate a deck against the hard requirements, collecting every problem
 * rather than stopping at the first.
 */
export function validateGeneratedDeck(deck: readonly string[]): DeckValidationResult {
  const problems: string[] = [];
  const invalidCards: string[] = [];
  const seen = new Set<string>();
  const duplicateCards: string[] = [];

  for (const id of deck) {
    if (!isPlayableCard(id)) invalidCards.push(id);
    if (seen.has(id)) duplicateCards.push(id);
    seen.add(id);
  }
  if (invalidCards.length > 0) problems.push(`unplayable cards: ${invalidCards.join(", ")}`);
  if (duplicateCards.length > 0) problems.push(`duplicate cards: ${duplicateCards.join(", ")}`);
  if (deck.length !== DECK_SIZE) problems.push(`expected ${DECK_SIZE} cards, got ${deck.length}`);

  const unsatisfiedRoles: MandatoryRole[] = [];
  for (const role of MANDATORY_ROLES) {
    const covered = deck.some((id) => {
      const card = getCard(id);
      return card !== undefined && rolesCoveredBy(card).includes(role);
    });
    if (!covered) unsatisfiedRoles.push(role);
  }
  if (unsatisfiedRoles.length > 0) {
    problems.push(`unsatisfied mandatory roles: ${unsatisfiedRoles.join(", ")}`);
  }

  const quality = analyseQuality(deck);
  const softWarnings: string[] = [];
  if (quality.antiAirAnswers < 2) softWarnings.push("fewer than two anti-air answers");
  if (quality.tankKillers < 1) softWarnings.push("no tank killer");
  if (quality.cheapCycleCards < 1) softWarnings.push("no cheap cycle card");
  if (quality.averageElixir < ELIXIR_SOFT_MIN || quality.averageElixir > ELIXIR_SOFT_MAX) {
    softWarnings.push(
      `average elixir ${quality.averageElixir.toFixed(2)} is outside the ${ELIXIR_SOFT_MIN}-${ELIXIR_SOFT_MAX} target`,
    );
  }
  if (quality.heavyFrontline > 2) softWarnings.push("many very expensive frontline units");

  return {
    ok: problems.length === 0,
    problems,
    unsatisfiedRoles,
    invalidCards,
    duplicateCards,
    quality,
    softWarnings,
  };
}