"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export const DECK_KEY = "cr-clone-deck-v1";
export const DECK_SIZE = 8;

export const STARTER_DECK: string[] = [
  "knight",
  "archers",
  "giant",
  "skeletons",
  "musketeer",
  "baby-dragon",
  "fireball",
  "arrows",
];

/** Reads the saved deck, padding/repairing it to DECK_SIZE slots. O(DECK_SIZE). */
export function loadDeck(): string[] {
  const base = (): string[] => [...STARTER_DECK];
  if (typeof window === "undefined") return base();
  try {
    const raw = window.localStorage.getItem(DECK_KEY);
    if (!raw) return base();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return base();
    const next = base();
    for (let i = 0; i < DECK_SIZE; i += 1) {
      const v = parsed[i];
      if (typeof v === "string" && v) next[i] = v;
    }
    return next;
  } catch {
    return base();
  }
}

/** Persists the deck. No-op during SSR. */
export function saveDeck(deck: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DECK_KEY, JSON.stringify(deck));
  } catch {
    // storage full / private mode — ignore
  }
}

export type UseOutcome = { kind: "placed"; slot: number } | { kind: "pick" };

// Single source of truth for My Deck edits, shared by /decks and /collection so
// add / remove / replace behave identically on both screens. All operations are
// O(DECK_SIZE) = O(1) (8 slots).
export function useDeckState() {
  const [deck, setDeck] = useState<string[]>(STARTER_DECK);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDeck(loadDeck());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveDeck(deck);
  }, [deck, hydrated]);

  const firstEmptySlot = useMemo(() => deck.findIndex((c) => !c), [deck]);

  const slotOf = useCallback((name: string) => deck.indexOf(name), [deck]);

  /** Writes `name` into `slot`, freeing its old slot when moving inside the deck. */
  const placeAt = useCallback((slot: number, name: string) => {
    if (slot < 0 || slot >= DECK_SIZE) return false;
    setDeck((prev) => {
      const next = [...prev];
      const existing = next.indexOf(name);
      if (existing >= 0 && existing !== slot) next[existing] = "";
      next[slot] = name;
      return next;
    });
    return true;
  }, []);

  /**
   * "Use" from the card overlay: fills the first free slot straight away, otherwise
   * reports `pick` so the caller can show the slot picker (never swaps silently).
   */
  const useCard = useCallback(
    (name: string): UseOutcome => {
      const empty = deck.findIndex((c) => !c);
      const already = deck.includes(name);
      if (!already && empty >= 0) {
        placeAt(empty, name);
        return { kind: "placed", slot: empty };
      }
      return { kind: "pick" };
    },
    [deck, placeAt],
  );

  /** Removes by slot; `"list"` removes the card wherever it sits (collection tap). */
  const removeCard = useCallback((slot: number | "list", name: string) => {
    let removedSlot = -1;
    setDeck((prev) => {
      const next = [...prev];
      const target = typeof slot === "number" && slot >= 0 && slot < DECK_SIZE ? slot : next.indexOf(name);
      if (target >= 0 && next[target]) {
        next[target] = "";
        removedSlot = target;
      }
      return next;
    });
    return removedSlot;
  }, []);

  const reset = useCallback(() => setDeck([...STARTER_DECK]), []);

  /** Loads a full 8-card list (deck switching). O(DECK_SIZE). */
  const replace = useCallback((cards: string[]) => {
    const next = [...STARTER_DECK];
    const seen = new Set<string>();
    for (let i = 0; i < DECK_SIZE; i += 1) {
      const v = cards[i];
      if (typeof v === "string" && v.length > 0 && !seen.has(v)) {
        next[i] = v;
        seen.add(v);
      }
    }
    setDeck(next);
    saveDeck(next);
  }, []);

  return {
    deck,
    hydrated,
    firstEmptySlot,
    slotOf,
    placeAt,
    useCard,
    removeCard,
    replace,
    saveDeck: () => saveDeck(deck),
    reset,
  };
}