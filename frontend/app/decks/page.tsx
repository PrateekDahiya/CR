"use client";

import { useEffect, useState } from "react";
import {
  PageShell,
  CardTile,
  CRButton,
  CardInfoOverlay,
  type CardInfoOverlayProps,
} from "../../components/ui";
import { backendUrl, getContentCards, getCatalog, type ContentCard, type CatalogEntry } from "../../lib/api";

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
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [deck, setDeck] = useState<string[]>(STARTER);
  const [info, setInfo] = useState<{ name: string; slot: number | "list" } | null>(null);
  const [replace, setReplace] = useState<{ name: string } | null>(null);
  const [matchmaking, setMatchmaking] = useState(false);
  const [tab, setTab] = useState<"deck" | "collection">("deck");

  useEffect(() => {
    let cancelled = false;
    getContentCards(backendUrl())
      .then((d) => !cancelled && setCards(d.cards))
      .catch(() => {});
    getCatalog(backendUrl())
      .then((d) => !cancelled && setCatalog(d.catalog))
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

  // Collection grid = full catalog (108) when available, else the playable roster.
  const collection: CatalogEntry[] =
    catalog.length > 0
      ? catalog
      : cards.map((c) => ({
          name: c.name,
          cardType: c.cardType,
          elixir: c.elixir,
          rarity: c.rarity,
          playable: c.playable ?? true,
        }));

  // Single fact lookup for every card the deck can hold: the playable roster
  // first (rich stats), then the full catalog so display-only cards still render.
  // O(n) over 108 entries once per render.
  const factsByName: Record<string, CatalogEntry> = {};
  for (const c of collection) factsByName[c.name] = c;
  for (const c of cards) {
    const prev = factsByName[c.name];
    factsByName[c.name] = {
      name: c.name,
      cardType: c.cardType || prev?.cardType || "troop",
      elixir: c.elixir ?? prev?.elixir ?? 0,
      rarity: c.rarity || prev?.rarity || "common",
      playable: c.playable ?? prev?.playable ?? true,
    };
  }
  const cardByName = factsByName;

  const onCardClick = (slotOrList: number | "list", name: string) => {
    setInfo({ name, slot: slotOrList });
  };

  // "Use" flow: fills the first free slot automatically; when the deck is full
  // (or the card is already in the deck and should move) the user must pick the
  // slot to replace — no more silent "replace slot 0".
  const firstEmptySlot = deck.findIndex((c) => !c);

  const placeAt = (slot: number, name: string) => {
    setDeck((prev) => {
      if (slot < 0 || slot >= DECK_SIZE) return prev;
      const next = [...prev];
      // Moving a card inside the deck frees its old slot instead of duplicating it.
      const existing = next.indexOf(name);
      if (existing >= 0 && existing !== slot) next[existing] = "";
      next[slot] = name;
      return next;
    });
    setReplace(null);
    setInfo(null);
  };

  const requestUse = (name: string) => {
    const alreadyInDeck = deck.includes(name);
    if (!alreadyInDeck && firstEmptySlot >= 0) {
      placeAt(firstEmptySlot, name);
      return;
    }
    setInfo(null);
    setReplace({ name });
  };

  // Removes by slot; passing "list" removes the card wherever it sits in the deck,
  // so Remove works from the Collection tab too.
  const removeCard = (slot: number | "list", name: string) => {
    setDeck((prev) => {
      const next = [...prev];
      const target = typeof slot === "number" && slot >= 0 && slot < DECK_SIZE ? slot : next.indexOf(name);
      if (target >= 0 && next[target]) next[target] = "";
      return next;
    });
    setReplace(null);
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
              return c ? (
                <CardTile
                  key={`slot-${i}`}
                  name={c.name}
                  rarity={c.rarity}
                  cost={c.elixir}
                  level={15}
                  testId={`deck-card-${i}`}
                  ariaLabel={`Card slot ${i + 1}: ${c.name}`}
                  onClick={() => setInfo({ name: c.name, slot: i })}
                />
              ) : (
                <button
                  key={`slot-${i}`}
                  type="button"
                  data-testid="deck-empty-slot"
                  data-slot={i}
                  onClick={() => setTab("collection")}
                  className="grid h-20 w-16 place-items-center rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/40 text-xs text-slate-500 active:scale-95"
                  aria-label={`Empty slot ${i + 1}`}
                >
                  +
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
            <div className="grid grid-cols-4 gap-2" data-count={collection.length}>
              {collection.map((c) => (
                <CardTile
                  key={c.name}
                  name={c.name}
                  rarity={c.rarity}
                  cost={c.elixir}
                  level={15}
                  testId={`collection-card-${c.name}`}
                  inDeck={deck.includes(c.name)}
                  onClick={() => setInfo({ name: c.name, slot: "list" })}
                />
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Source: <span data-testid="collection-source">mysql</span> • {collection.length} cards (
              {collection.filter((c) => c.playable).length} playable) — tap a card to add it to My Deck
            </p>
          </section>
        )}
      </div>

      {info
        ? (() => {
            const c = cards.find((cc) => cc.name === info.name);
            const f = factsByName[info.name];
            if (!c && !f) return null;
            const inDeck = deck.includes(info.name);
            return (
              <CardInfoOverlay
                name={info.name}
                rarity={(c?.rarity ?? f?.rarity ?? "common") as CardInfoOverlayProps["rarity"]}
                cardType={(c?.cardType ?? f?.cardType ?? "troop") as CardInfoOverlayProps["cardType"]}
                elixir={c?.elixir ?? f?.elixir ?? 0}
                level={15}
onClose={() => setInfo(null)}
                onUse={() => requestUse(info.name)}
                onRemove={inDeck ? () => removeCard(info.slot, info.name) : undefined}
                onUpgrade={() => setInfo(null)}
                inDeck={inDeck}
              />
            );
          })()
        : null}

      {/* Replace picker: user chooses which deck slot the card takes. */}
      {replace ? (
        <div
          data-testid="replace-picker"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
          onClick={() => setReplace(null)}
        >
          <div
            data-testid="replace-picker-panel"
            className="w-full max-w-md rounded-2xl border-4 border-amber-500 bg-gradient-to-b from-slate-800 to-slate-900 p-3 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center text-lg font-extrabold uppercase tracking-wide text-amber-300">
              Choose a card to replace
            </h3>
            <p className="mb-2 text-center text-xs text-slate-300">
              {replace.name} → tap the slot it should replace
            </p>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: DECK_SIZE }).map((_, i) => {
                const holder = deck[i] ? factsByName[deck[i]] : null;
                const isCurrent = deck[i] === replace.name;
                return (
                  <div key={`pick-${i}`} className="flex flex-col items-center gap-0.5">
                    {holder ? (
                      <>
                        <CardTile
                          name={holder.name}
                          rarity={holder.rarity}
                          cost={holder.elixir}
                          level={15}
                          testId={`replace-slot-${i}`}
                          ariaLabel={`Replace slot ${i + 1}: ${holder.name}`}
                          className={
                            isCurrent
                              ? "ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-900"
                              : "ring-2 ring-rose-500/70"
                          }
                          onClick={() => placeAt(i, replace.name)}
                        />
                        <span
                          className={`text-[9px] font-extrabold uppercase tracking-wide ${
                            isCurrent ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {isCurrent ? "moving" : "replace"}
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          data-testid={`replace-slot-${i}`}
                          onClick={() => placeAt(i, replace.name)}
                          className="grid h-20 w-16 place-items-center rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-900/30 text-lg text-emerald-300 active:scale-95"
                          aria-label={`Fill empty slot ${i + 1}`}
                        >
                          +
                        </button>
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-300">
                          empty
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-center">
              <CRButton variant="blue" size="sm" testId="replace-cancel" onClick={() => setReplace(null)}>
                Cancel
              </CRButton>
            </div>
          </div>
        </div>
      ) : null}

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
