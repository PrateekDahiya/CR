"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PageShell,
  CardTile,
  CardInfoOverlay,
  DeckSlotPicker,
  ActionToast,
  type CardInfoOverlayProps,
  type DeckSlotFact,
} from "../../components/ui";
import {
  backendUrl,
  createPlayerDeck,
  deletePlayerDeck,
  getContentCards,
  getCatalog,
  selectPlayerDeck,
  updatePlayerDeck,
  type ContentCard,
  type CatalogEntry,
  type DeckRecord,
} from "../../lib/api";
import { CARDS, CARD_LIST } from "../../lib/cards";
import { generateRandomDeck } from "../../lib/deckGenerator";
import { useDeckState, DECK_SIZE } from "../../lib/useDeck";
import { usePlayer } from "../../lib/playerContext";

// /decks — My Deck strip on top, full collection grid underneath, two tabs.
// Deck edits (add / remove / replace) run through useDeckState so this screen and
// /collection behave identically.
export default function DecksPage() {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [info, setInfo] = useState<{ name: string; slot: number | "list" } | null>(null);
  const [replace, setReplace] = useState<{ name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"deck" | "collection">("deck");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { deck, hydrated, placeAt, useCard, removeCard, replace: loadDeckInto, saveDeck } = useDeckState();
  const { playerId, profile, refresh: refreshProfile } = usePlayer();
  const [decks, setDecks] = useState<DeckRecord[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);

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

  // Load the player's deck list and activate the selected one.
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    import("../../lib/api")
      .then(({ getDecks }) => getDecks(playerId, backendUrl()))
      .then((d) => {
        if (cancelled) return;
        setDecks(d.decks);
        setActiveDeckId(d.activeDeckId);
        if (d.activeDeck) loadDeckInto(d.activeDeck.cards);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [playerId, loadDeckInto]);

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

  // Single fact lookup for every card the deck can hold. Catalog gives the roster
  // + rarity; the shared card table (generated from the same source as the
  // engine) gives the authoritative cost/type used in battle. O(n), n = 108.
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
    // Engine cost wins (tower troops are catalogued at 0 elixir but cost 4).
    for (const [name, def] of Object.entries(CARDS)) {
      const prev = out[name];
      if (!prev) continue;
      out[name] = { ...prev, elixir: def.cost, cardType: def.type, playable: true };
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

  // --- Multiple decks (server-backed; the selected deck is used in battle) ---
  const pushDecks = useCallback((next: DeckRecord[], activeId: string | null) => {
    setDecks(next);
    setActiveDeckId(activeId);
    if (activeId !== null) {
      const active = next.find((d) => d.id === activeId);
      if (active) {
        // `cr-clone-deck-v1` is the ONE client-side source for the deck used in
        // battle (loadDeckInto -> saveDeck writes it). No second key to drift.
        loadDeckInto(active.cards);
      }
    }
  }, []);

  // --- Random Deck (Phase 14) ---
  // Uses the same constrained generator as the AI, writes through the existing
  // deck state (which persists to `cr-clone-deck-v1` and the server), and never
  // regenerates on re-render. A failed generation preserves the current deck.
  const [randomBusy, setRandomBusy] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);

  const onRandomDeck = useCallback(() => {
    setRandomError(null);
    setRandomBusy(true);
    try {
      const result = generateRandomDeck(CARD_LIST.map((card) => card.id));
      if (!result.ok) {
        setRandomError(
          `Could not build a valid deck (${result.unsatisfiedRoles.join(", ") || "no roles satisfied"}). Your deck was kept.`,
        );
        say("Random deck failed - previous deck kept");
        return;
      }
      // Replace the active deck card by card. `useDeckState` persists the new
      // deck to `cr-clone-deck-v1` through its existing effect, so battle picks
      // it up on the next match with no extra plumbing.
      result.deck.forEach((cardId, index) => placeAt(index, cardId));

      // Mirror into the server-backed deck record so the profile agrees.
      if (activeDeckId !== null) {
        const active = decks.find((d) => d.id === activeDeckId);
        if (active !== undefined) {
          pushDecks(
            decks.map((d) => (d.id === activeDeckId ? { ...d, cards: result.deck } : d)),
            activeDeckId,
          );
          void updatePlayerDeck(playerId, activeDeckId, { cards: result.deck }).catch(
            () => undefined,
          );
        }
      } else {
        void createPlayerDeck(playerId, `Deck ${decks.length + 1}`, result.deck)
          .then((created) => {
            pushDecks([...decks, created], created.id);
            void refreshProfile();
          })
          .catch(() => undefined);
      }
      void refreshProfile();
      say(
        `Random deck: ${result.deck.length} cards, avg ${result.validation.quality.averageElixir.toFixed(1)} elixir`,
      );
    } finally {
      setRandomBusy(false);
    }
  }, [activeDeckId, decks, placeAt, playerId, pushDecks, refreshProfile, say]);

  const onCreateDeck = async () => {
    try {
      const created = await createPlayerDeck(playerId, `Deck ${decks.length + 1}`, [...deck], backendUrl());
      pushDecks([...decks, created], created.id);
      await selectPlayerDeck(playerId, created.id, backendUrl()).catch(() => undefined);
      await refreshProfile();
      say(`${created.name} created`);
    } catch {
      say("Could not create deck (offline?)");
    }
  };

  const onSelectDeck = async (deckId: string) => {
    try {
      const res = await selectPlayerDeck(playerId, deckId, backendUrl());
      pushDecks(decks, res.activeDeckId);
      await refreshProfile();
      say(`${res.activeDeck.name} selected for battle`);
    } catch {
      say("Could not select that deck");
    }
  };

  const onDeleteDeck = async (deckId: string) => {
    try {
      const res = await deletePlayerDeck(playerId, deckId, backendUrl());
      pushDecks(res.decks, res.decks.find((d) => d.id === activeDeckId)?.id ?? res.decks[0]?.id ?? null);
      await refreshProfile();
      say("Deck deleted");
    } catch {
      say("Could not delete that deck");
    }
  };

  // Persist the edited deck to the server whenever the card list changes.
  useEffect(() => {
    if (!hydrated || activeDeckId === null) return;
    const t = setTimeout(() => {
      void updatePlayerDeck(playerId, activeDeckId, { cards: [...deck] }, backendUrl())
        .then(() => refreshProfile())
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [deck, hydrated, activeDeckId, playerId, refreshProfile]);

  // Battles start from the Battle tab (home); the deck screen only edits cards.
  useEffect(() => {
    saveDeck();
  }, [deck]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell active="cards" topBarCurrencies={{ cards: cards.length, coins: 1625, gems: 5 }}>
      <div className="px-3 py-3">
        {/* Deck list: create, rename, select (the selected deck is used in battle). */}
        <section
          data-testid="deck-list"
          className="mb-3 rounded-xl border-2 border-slate-600/60 bg-[#12224a]/80 p-2"
        >
          <header className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-200">
              My Decks
            </span>
            <button
              type="button"
              data-testid="deck-new"
              onClick={onCreateDeck}
              className="rounded-md border border-emerald-700 bg-gradient-to-b from-emerald-400 to-emerald-700 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white active:translate-y-0.5"
            >
              + New Deck
            </button>
          </header>
          <div className="flex flex-wrap gap-1.5">
            {decks.map((d) => {
              const active = d.id === activeDeckId;
              return (
                <div
                  key={d.id}
                  data-testid={`deck-chip-${d.id}`}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-extrabold ${
                    active
                      ? "border-amber-400 bg-amber-300 text-amber-950"
                      : "border-slate-600 bg-slate-800/60 text-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    data-testid={`deck-select-${d.id}`}
                    onClick={() => onSelectDeck(d.id)}
                    title={active ? "Selected for battle" : "Use this deck in battle"}
                    className="uppercase tracking-wide"
                  >
                    {d.name}
                    {active ? " ✓" : ""}
                  </button>
                  <button
                    type="button"
                    data-testid={`deck-delete-${d.id}`}
                    onClick={() => onDeleteDeck(d.id)}
                    disabled={decks.length <= 1}
                    title="Delete deck"
                    className="text-[10px] opacity-70 disabled:opacity-25"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            {decks.length === 0 && (
              <span className="text-[11px] text-slate-400">No decks yet — create one.</span>
            )}
          </div>
        </section>

        {/* My Deck strip on top */}
        <section
          data-testid="my-deck-strip"
          className="mb-3 rounded-xl border-2 border-amber-600/50 bg-[#12224a]/80 p-2 shadow-[0_2px_0_rgba(0,0,0,0.4)]"
        >
          <header className="mb-1 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-200">
            <span>My Deck</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                data-testid="deck-random"
                onClick={onRandomDeck}
                disabled={randomBusy}
                className="rounded-md border border-fuchsia-400/60 bg-fuchsia-500/20 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-fuchsia-100 transition hover:bg-fuchsia-500/30 active:translate-y-0.5 disabled:opacity-60"
                title="Generate a balanced random deck"
              >
                {randomBusy ? "Rolling…" : "🎲 Random Deck"}
              </button>
              <span data-testid="deck-avg-elixir" className="text-fuchsia-300">
                🟣 {avgElixir} / 10
              </span>
            </span>
          </header>
          {randomError !== null && (
            <p
              data-testid="deck-random-error"
              className="mb-1 rounded-md border border-red-500/50 bg-red-900/30 px-2 py-1 text-[11px] font-semibold text-red-200"
            >
              {randomError}
            </p>
          )}
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

    </PageShell>
  );
}