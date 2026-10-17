"use client";

import { useEffect, useState } from "react";
import {
  PageShell,
  CardArt,
  CRButton,
  CardInfoOverlay,
  type CardInfoOverlayProps,
} from "../../components/ui";
import { backendUrl, getContentCards, type ContentCard } from "../../lib/api";

const DECK_KEY = "cr-clone-deck-v1";
const DECK_SIZE = 8;
const STARTER: string[] = [
  "knight",
  "archers",
  "giant",
  "skeletons",
  "musketeer",
  "baby-dragon",
  "fireball",
  "arrows",
];

export default function DecksPage() {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [activeTab, setActiveTab] = useState<number>(6);
  const [deck, setDeck] = useState<string[]>(STARTER);
  const [info, setInfo] = useState<{ name: string; slot: number } | null>(null);
  const [matchmaking, setMatchmaking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getContentCards(backendUrl())
      .then((d) => !cancelled && setCards(d.cards))
      .catch(() => {});
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(DECK_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === DECK_SIZE) {
            setDeck(parsed.filter((c) => typeof c === "string").slice(0, DECK_SIZE));
          }
        }
      } catch {
        // ignore corrupt storage
      }
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(DECK_KEY, JSON.stringify(deck));
    } catch {
      // ignore
    }
  }, [deck]);

  const cardByName: Record<string, ContentCard> = {};
  for (const c of cards) cardByName[c.name] = c;

  const selected = (i: number): ContentCard | null => {
    const name = deck[i];
    if (!name) return null;
    return cardByName[name] ?? null;
  };

  const onCardClick = (i: number) => {
    const c = selected(i);
    if (!c) return;
    setInfo({ name: c.name, slot: i });
  };

  const onUseInSlot = (slot: number, name: string) => {
    setDeck((prev) => {
      if (slot < 0 || slot >= DECK_SIZE) return prev;
      const next = [...prev];
      // If the card is already in the deck (other slot), swap instead of duplicating.
      const existing = next.indexOf(name);
      if (existing >= 0 && existing !== slot) {
        next[existing] = next[slot] ?? "";
      }
      next[slot] = name;
      return next;
    });
    setInfo(null);
  };

  const onPickFromCollection = (slot: number) => {
    const next = cards.find((c) => c.playable) ?? cards[0];
    if (next) onUseInSlot(slot, next.name);
  };

  const avgElixir =
    deck.length > 0
      ? Math.min(10, deck.reduce((a, n) => a + (cardByName[n]?.elixir ?? 0), 0) / DECK_SIZE).toFixed(1)
      : "—";

  const onBattle = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(DECK_KEY, JSON.stringify(deck));
      } catch {
        // ignore
      }
    }
    setMatchmaking(true);
  };

  return (
    <PageShell active="cards" topBarCurrencies={{ cards: cards.length, coins: 1625, gems: 5 }}>
      <div className="px-3 py-3">
        <div className="mb-2 grid grid-cols-7 gap-1 text-center" data-testid="deck-tabs">
          {[6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`deck-tab-${n}`}
              onClick={() => setActiveTab(n)}
              className={`rounded-md border px-1 py-1 text-sm font-extrabold ${
                activeTab === n ? "border-amber-400 bg-amber-300 text-amber-950 shadow-inner" : "border-slate-700 bg-slate-800/40 text-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            data-testid="deck-tab-shuffle"
            onClick={() => setActiveTab(11)}
            className="rounded-md border border-slate-700 bg-slate-800/40 px-1 text-slate-200"
            aria-label="Shuffle"
          >
            ⇄
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2" data-testid="deck-grid">
          {Array.from({ length: DECK_SIZE }).map((_, i) => {
            const c = selected(i);
            return (
              <button
                key={`slot-${i}`}
                type="button"
                data-testid={`deck-card-${i}`}
                onClick={() => onCardClick(i)}
                className="group flex flex-col items-center rounded-md p-0.5 transition-transform active:scale-95"
                aria-label={c ? `Card slot ${i + 1}: ${c.name}` : `Empty slot ${i + 1}`}
              >
                {c ? (
                  <CardArt
                    name={c.name}
                    rarity={c.rarity as CardInfoOverlayProps["rarity"]}
                    cost={c.elixir}
                    level={15}
                    showLevel
                    showCost
                  />
                ) : (
                  <div
                    data-testid="deck-empty-slot"
                    className="grid h-20 w-16 place-items-center rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/40 text-xs text-slate-500"
                  >
                    +
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
          <span data-testid="deck-avg-elixir" className="text-sm font-bold text-fuchsia-300">
            🟣 {avgElixir} / 10
          </span>
          <CRButton
            variant="gold"
            size="sm"
            testId="deck-battle"
            onClick={onBattle}
            icon="⚔️"
          >
            Battle
          </CRButton>
        </div>

        <p className="mt-2 text-center text-[11px] text-slate-400">
          Tap a card to view details or swap. Selected deck #6 — switch tabs to edit a different preset.
        </p>
      </div>

      {info
        ? (() => {
            const c = cardByName[info.name];
            if (!c) return null;
            const isInDeck = deck.includes(c.name);
            return (
              <CardInfoOverlay
                name={c.name}
                rarity={c.rarity as CardInfoOverlayProps["rarity"]}
                cardType={c.cardType as CardInfoOverlayProps["cardType"]}
                elixir={c.elixir}
                level={15}
                onClose={() => setInfo(null)}
                onUse={() => onUseInSlot(info.slot, c.name)}
                onUpgrade={() => {
                  // no-op placeholder; could open a gold-spend flow later
                  setInfo(null);
                }}
                inDeck={isInDeck}
              />
            );
          })()
        : null}

      {matchmaking ? (
        <div
          data-testid="deck-matchmaking"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80"
        >
          <button
            type="button"
            onClick={() => setMatchmaking(false)}
            className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-white"
          >
            Cancel matchmaking
          </button>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="deck-fill-from-collection"
        onClick={() => onPickFromCollection(0)}
        className="sr-only"
        aria-hidden="true"
      />
    </PageShell>
  );
}
