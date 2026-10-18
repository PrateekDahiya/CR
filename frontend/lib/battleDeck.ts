/**
 * battleDeck.ts — the contract between the deck builder and the game server.
 *
 * The collection shows all 108 catalog cards, but the authoritative engine only
 * knows a fixed playable roster. Anything else would be rejected with
 * BAD_DECK ("unknown card id"), so:
 *  - only playable cards may be added to My Deck, and
 *  - the deck is sanitized again right before a battle is requested.
 */

export const BATTLE_CARD_IDS = [
  "knight",
  "archers",
  "giant",
  "skeletons",
  "musketeer",
  "baby-dragon",
  "mini-pekka",
  "rock-golem",
  "fireball",
  "arrows",
  "zap",
  "cannon",
] as const;

const PLAYABLE = new Set<string>(BATTLE_CARD_IDS);

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

export function isBattleCard(cardId: string): boolean {
  return PLAYABLE.has(cardId);
}

/**
 * Returns an 8-card, engine-known, spell-legal deck. Unplayable cards are
 * dropped and replaced (in order) from the fallback roster, so a deck built in
 * the collection can always enter a battle.
 * O(DECK_SIZE) — runs once per battle request.
 */
export function toBattleDeck(deck: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of deck ?? []) {
    if (typeof id !== "string" || !PLAYABLE.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === 8) break;
  }
  const spells = out.filter((c) => c === "fireball" || c === "arrows" || c === "zap").length;
  if (spells > 2) {
    // Trim extra spells (server allows max 2) keeping the first two.
    let kept = 0;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const c = out[i] as string;
      if (c === "fireball" || c === "arrows" || c === "zap") {
        kept += 1;
        if (kept > 2) {
          out.splice(i, 1);
          seen.delete(c);
        }
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