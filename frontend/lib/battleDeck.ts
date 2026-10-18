/**
 * battleDeck.ts — the contract between the deck builder and the game server.
 *
 * All 108 catalog cards are playable now (scripts/generate_card_table.py gives
 * every one of them full stats in the shared card table), so this module no
 * longer filters cards out. It only normalizes a deck into the shape the server
 * accepts: 8 unique card ids with at most 2 spells.
 */

import { CARDS } from "./cards";

/** Cards the engine can actually simulate (all catalog cards, by construction). */
export function isBattleCard(cardId: string): boolean {
  return CARDS[cardId] !== undefined;
}

export const DECK_FALLBACK: string[] = [
  "knight",
  "archers",
  "giant",
  "skeletons",
  "musketeer",
  "baby-dragon",
  "fireball",
  "arrows",
];

const SPELLS = new Set(["fireball", "arrows", "zap"]);

/**
 * Returns an 8-card, engine-known, spell-legal deck. Unknown/duplicate entries
 * are dropped and back-filled, so any deck built in the collection can always
 * enter a battle. O(DECK_SIZE) — runs once per battle request.
 */
export function toBattleDeck(deck: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of deck ?? []) {
    if (typeof id !== "string" || !isBattleCard(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === 8) break;
  }
  // Server allows at most 2 spells; trim the extras from the end.
  let spells = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (SPELLS.has(out[i] as string)) {
      spells += 1;
      if (spells > 2) {
        seen.delete(out[i] as string);
        out.splice(i, 1);
        i -= 1;
      }
    }
  }
  for (const filler of DECK_FALLBACK) {
    if (out.length === 8) break;
    if (seen.has(filler)) continue;
    seen.add(filler);
    out.push(filler);
  }
  return out.slice(0, 8);
}