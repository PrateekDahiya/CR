"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PageShell,
  CardTile,
  CRButton,
  CardInfoOverlay,
  DeckSlotPicker,
  ActionToast,
  type CardInfoOverlayProps,
  type DeckSlotFact,
} from "../../components/ui";
import { backendUrl, getContentCards, getCatalog, type ContentCard, type CatalogEntry } from "../../lib/api";
import { useDeckState, DECK_SIZE } from "../../lib/useDeck";

// /decks — My Deck strip on top, full collection grid underneath, two tabs.
// Deck edits (add / remove / replace) run through useDeckState so this screen and
// /collection behave identically.
export default function DecksPage() {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [info, setInfo] = useState<{ name: string; slot: number | "list" } | null>(null);
  const [replace, setReplace] = useState<{ name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [matchmaking, setMatchmaking] = useState(false);
  const [tab, setTab] = useState<"deck" | "collection">("deck");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { deck, hydrated, placeAt, useCard, removeCard, saveDeck } = useDeckState();

  useEffect(() => {
    let cancelled = false;
    getContentCards(backendUrl())
      .then((d) => !cancelled && setCards(d.cards))
      .catch(() => {});
    getCatalog(backendUrl())
      .then((d) => !cancelled && setCatalog(d.catalog))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const say = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  // Collection grid = full catalog (108) when available, else the playable roster.
  const collection: CatalogEntry[] = useMemo(
    () =>
      catalog.length > 0
        ? catalog
        : cards.map((c) => ({
            name: c.name,
            cardType: c.cardType,
            elixir: c.elixir,
            rarity: c.rarity,
            playable: c.playable ?? true,
          })),
    [catalog, cards],
  );

  // Single fact lookup for every card the deck can hold: catalog first, then the
  // playable roster (richer stats). O(n) over 108 entries per render.
  const factsByName = useMemo(() => {
    const out: Record<string, CatalogEntry> = {};
    for (const c of collection) out[c.name] = c;
    for (const c of cards) {
      const prev = out[c.name];
      out[c.name] = {
        name: c.name,
        cardType: c.cardType || prev?.cardType || "troop",
        elixir: c.elixir ?? prev?.elixir ?? 0,
        rarity: c.rarity || prev?.rarity || "common",
        playable: c.playable ?? prev?.playable ?? true,
      };
    }
    return out;
  }, [collection, cards]);

  const statsByName = useMemo(() => {
    const out: Record<string, ContentCard> = {};
    for (const c of cards) out[c.name] = c;
    return out;
  }, [cards]);

  const slotFacts = useMemo(() => {
    const out: Record<string, DeckSlotFact> = {};
    for (const [name, f] of Object.entries(factsByName)) {
      out[name] = { name: f.name, rarity: f.rarity, elixir: f.elixir };
    }
    return out;
  }, [factsByName]);

  const pretty = (name: string) =>
    name
      .split("-")
      .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");

  // "Use": fills the first free slot; a full deck (or moving a card already in
  // the deck) opens the slot picker so the user always chooses what is replaced.
  const requestUse = (name: string) => {
    const res = useCard(name);
    if (res.kind === "placed") {
      setInfo(null);
      say(`${pretty(name)} added to slot ${res.slot + 1}`);
      return;
    }
    setInfo(null);
    setReplace({ name });
  };

  const pickSlot = (slot: number) => {
    if (!replace) return;
    const incoming = replace.name;
    const outgoing = deck[slot];
    placeAt(slot, incoming);
    setReplace(null);
    say(
      outgoing && outgoing !== incoming
        ? `${pretty(incoming)} replaced ${pretty(outgoing)} in slot ${slot + 1}`
        : `${pretty(incoming)} placed in slot ${slot + 1}`,
    );
  };

  const doRemove = (slot: number | "list", name: string) => {
    const at = typeof slot === "number" && slot >= 0 ? slot : deck.indexOf(name);
    removeCard(slot, name);
    setReplace(null);
    setInfo(null);
    say(`${pretty(name)} removed from slot ${at + 1}`);
  };

  const avgElixir =
    deck.some(Boolean) && hydrated
      ? Math.min(
          10,
          deck.reduce((a, n) => a + (n ? (factsByName[n]?.elixir ?? 0) : 0), 0) / DECK_SIZE,
        ).toFixed(1)
      : "—";

  const onBattle = () => {
    saveDeck();
    setMatchmaking(true);
  };

  return (
    <PageShell active="cards" topBarCurrencies={{ cards: cards.length, coins: 1625, gems: 5 }}>
      <div className="px-3 py-3">
        {/* My Deck strip on top */}
        <section
          data-testid="my-deck-strip"
          className="mb-3 rounded-xl border-2 border-amber-600/50 bg-[#12224a]/80 p-2 shadow-[0_2px_0_rgba(0,0,0,0.4)]"
        >
          <header className="mb-1 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-200">
            <span>My Deck</span>
            <span data-testid="deck-avg-elixir" className="text-fuchsia-300">
              🟣 {avgElixir} / 10
            </span>
          </header>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: DECK_SIZE }).map((_, i) => {
              const name = deck[i];
              const f = name ? factsByName[name] : null;
              return f ? (
                <CardTile
                  key={`slot-${i}`}
                  name={f.name}
                  rarity={f.rarity}
                  cost={f.elixir}
                  level={15}
                  testId={`deck-card-${i}`}
                  ariaLabel={`Card slot ${i + 1}: ${f.name}`}
                  onClick={() => setInfo({ name: f.name, slot: i })}
                />
              ) : (
                <button
                  key={`slot-${i}`}
                  type="button"
                  data-testid="deck-empty-slot"
                  data-slot={i}
                  onClick={() => setTab("collection")}
                  className="grid h-20 w-16 place-items-center rounded-lg border-2 border-dashed border-slate-500/80 bg-slate-800/40 text-sm text-slate-400 active:scale-95"
                  aria-label={`Empty slot ${i + 1}, pick a card`}
                >
                  +
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">
            Tap a card for info • tap an empty slot to add one
          </p>
          <div className="mt-2 flex justify-end">
            <CRButton variant="gold" size="sm" testId="deck-battle" onClick={onBattle} icon="⚔️">
              Battle
            </CRButton>
          </div>
        </section>

        {/* Tabs: Deck + Collection (both in-place, no separate /deck route) */}
        <div className="mb-2 flex gap-2" data-testid="deck-tabs">
          {(["deck", "collection"] as const).map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`deck-tab-${t}`}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg border-b-4 px-3 py-1.5 text-sm font-extrabold uppercase tracking-wide transition active:translate-y-0.5 ${
                tab === t
                  ? "border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950"
                  : "border-slate-700 bg-gradient-to-b from-slate-600 to-slate-800 text-slate-200"
              }`}
            >
              {t === "deck" ? "My Deck" : "Collection"}
            </button>
          ))}
        </div>

        {tab === "deck" ? (
          <div className="rounded-xl border border-slate-600/50 bg-[#12224a]/60 p-3 text-center">
            <p className="text-xs font-semibold text-slate-300">
              Tap a card in My Deck to see its stats.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              <span className="text-amber-300">Use</span> adds it to a free slot — if the deck is
              full you pick the card it replaces.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              <span className="text-rose-300">Remove</span> takes it out and frees the slot.
            </p>
          </div>
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
            const f = factsByName[info.name];
            if (!f) return null;
            const inDeck = deck.includes(info.name);
            const stats = statsByName[info.name];
            return (
              <CardInfoOverlay
                name={f.name}
                rarity={f.rarity as CardInfoOverlayProps["rarity"]}
                cardType={f.cardType as CardInfoOverlayProps["cardType"]}
                elixir={f.elixir}
                level={15}
                stats={
                  stats
                    ? {
                        hitPoints: stats.hp,
                        dps: stats.dps,
                        speedLabel: stats.speedLabel,
                        rangeTiles: stats.rangeTiles,
                        targets: stats.targets,
                        unitCount: stats.unitCount,
                      }
                    : undefined
                }
                onClose={() => setInfo(null)}
                onUse={() => requestUse(info.name)}
                onRemove={inDeck ? () => doRemove(info.slot, info.name) : undefined}
                onUpgrade={() => setInfo(null)}
                inDeck={inDeck}
              />
            );
          })()
        : null}

      {replace && factsByName[replace.name] ? (
        <DeckSlotPicker
          card={{
            name: factsByName[replace.name].name,
            rarity: factsByName[replace.name].rarity,
            elixir: factsByName[replace.name].elixir,
          }}
          deck={deck}
          facts={slotFacts}
          onPick={pickSlot}
          onCancel={() => setReplace(null)}
        />
      ) : null}

      <ActionToast message={toast} />

      {matchmaking ? (
        <div
          data-testid="deck-matchmaking"
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#050b1c]/85"
        >
          <div className="rounded-xl border-4 border-amber-600/70 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] p-6 text-center text-white shadow-2xl">
            <div className="mb-1 text-lg font-extrabold uppercase tracking-wide text-amber-300">
              Searching for opponent…
            </div>
            <p className="mb-3 text-xs text-slate-300">Battles start from the Battle tab.</p>
            <CRButton variant="red" size="sm" testId="deck-matchmaking-cancel" onClick={() => setMatchmaking(false)}>
              Cancel
            </CRButton>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}