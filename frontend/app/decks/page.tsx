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
  const [deck, setDeck] = useState<string[]>(STARTER);
  const [info, setInfo] = useState<{ name: string; slot: number | "list" } | null>(null);
  const [matchmaking, setMatchmaking] = useState(false);
  const [tab, setTab] = useState<"deck" | "collection">("deck");

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
        // ignore
      }
    }
    return () => {
      cancelled = true;
    };
  }, []);

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

  const onCardClick = (slotOrList: number | "list", name: string) => {
    setInfo({ name, slot: slotOrList });
  };

  const onUseInSlot = (name: string) => {
    setDeck((prev) => {
      const next = [...prev];
      // If the card is already in the deck, remove it from the old slot first.
      const existing = next.indexOf(name);
      if (existing >= 0) next[existing] = "";
      const emptySlot = next.findIndex((c) => !c);
      if (emptySlot >= 0) {
        next[emptySlot] = name;
      } else {
        // deck full -> replace slot 0
        next[0] = name;
      }
      return next;
    });
    setInfo(null);
  };

  const removeCard = (slot: number) => {
    setDeck((prev) => {
      const next = [...prev];
      if (slot >= 0 && slot < DECK_SIZE) next[slot] = "";
      return next;
    });
    setInfo(null);
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
        {/* My Deck strip on top. */}
        <section data-testid="my-deck-strip" className="mb-3 rounded-xl border-2 border-amber-700/60 bg-slate-900/60 p-2">
          <header className="mb-1 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-200">
            <span>My Deck</span>
            <span data-testid="deck-avg-elixir" className="text-fuchsia-300">
              🟣 {avgElixir} / 10
            </span>
          </header>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: DECK_SIZE }).map((_, i) => {
              const name = deck[i];
              const c = name ? cardByName[name] : null;
              return (
                <button
                  key={`slot-${i}`}
                  type="button"
                  data-testid={`deck-card-${i}`}
                  onClick={() => {
                    if (c) setInfo({ name: c.name, slot: i });
                  }}
                  className="flex flex-col items-center gap-0.5 active:scale-95"
                  aria-label={c ? `Card slot ${i + 1}: ${c.name}` : `Empty slot ${i + 1}`}
                >
                  {c ? (
                    <CardArt name={c.name} rarity={c.rarity as CardInfoOverlayProps["rarity"]} cost={c.elixir} level={15} showLevel showCost />
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
          <div className="mt-2 flex justify-end">
            <CRButton variant="gold" size="sm" testId="deck-battle" onClick={onBattle} icon="⚔️">
              Battle
            </CRButton>
          </div>
        </section>

        {/* Tabs: Deck + Collection (both in-place, no separate /deck route). */}
        <div className="mb-2 flex gap-2" data-testid="deck-tabs">
          {(["deck", "collection"] as const).map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`deck-tab-${t}`}
              onClick={() => setTab(t)}
              className={`rounded-md border px-3 py-1 text-sm font-extrabold ${
                tab === t ? "border-amber-400 bg-amber-300 text-amber-950 shadow-inner" : "border-slate-700 bg-slate-800/40 text-slate-200"
              }`}
            >
              {t === "deck" ? "My Deck" : "Collection"}
            </button>
          ))}
        </div>

        {tab === "deck" ? (
          <p className="text-center text-xs text-slate-400">
            Tap a card above to view info. Use **Use** in the overlay to swap into an empty slot.
          </p>
        ) : (
          <section data-testid="collection-list">
            <div className="grid grid-cols-4 gap-2">
              {cards.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  data-testid={`collection-card-${c.name}`}
                  onClick={() => setInfo({ name: c.name, slot: "list" })}
                  className="active:scale-95"
                >
                  <CardArt name={c.name} rarity={c.rarity as CardInfoOverlayProps["rarity"]} cost={c.elixir} level={15} showLevel showCost size="sm" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Source: <span data-testid="collection-source">{/* live */}mysql</span> • {cards.length} cards ({cards.filter((c) => c.playable).length} playable)
            </p>
          </section>
        )}
      </div>

      {info
        ? (() => {
            const c = cards.find((cc) => cc.name === info.name);
            if (!c) return null;
            const inDeck = deck.includes(c.name);
            return (
              <CardInfoOverlay
                name={c.name}
                rarity={c.rarity as CardInfoOverlayProps["rarity"]}
                cardType={c.cardType as CardInfoOverlayProps["cardType"]}
                elixir={c.elixir}
                level={15}
                onClose={() => setInfo(null)}
                onUse={() => onUseInSlot(c.name)}
                onRemove={() => removeCard(typeof info.slot === "number" ? info.slot : -1)}
                onUpgrade={() => setInfo(null)}
                inDeck={inDeck}
              />
            );
          })()
        : null}

      {matchmaking ? (
        <div
          data-testid="deck-matchmaking"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80"
        >
          <div className="rounded-xl border border-white/30 bg-slate-900/90 p-6 text-center text-white">
            <div className="mb-2 text-lg font-bold">Searching for opponent…</div>
            <button
              type="button"
              onClick={() => setMatchmaking(false)}
              className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
