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
  upgradePlayerCard,
  upgradePlayerTower,
  type ContentCard,
  type CatalogEntry,
  type DeckRecord,
} from "../../lib/api";
import { CARDS, CARD_LIST } from "../../lib/cards";
import { generateRandomDeck } from "../../lib/deckGenerator";
import { isTowerTroopId } from "../../lib/cardAliases";
import { useDeckState, DECK_SIZE } from "../../lib/useDeck";
import { usePlayer } from "../../lib/playerContext";
import { loadCardLevels, overlayStatsFor, type OverlayLevelStats } from "../../lib/cardLevels";
import { DEFAULT_TOWER_ID, loadTowerSelection, saveTowerSelection } from "../../lib/towerSelection";

// /decks — My Deck strip on top, full collection grid underneath, two tabs.
// Deck edits (add / remove / replace) run through useDeckState so this screen and
// /collection behave identically.
export default function DecksPage() {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [info, setInfo] = useState<{ name: string; slot: number | "list" } | null>(null);
  const [replace, setReplace] = useState<{ name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"deck" | "collection" | "towers">("deck");
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<"all" | "common" | "rare" | "epic" | "legendary" | "champion">("all");
  const [costFilter, setCostFilter] = useState<"all" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>("all");
  const [sortKey, setSortKey] = useState<"name" | "elixir" | "level">("name");
  const [selectedTower, setSelectedTower] = useState(DEFAULT_TOWER_ID);
  const [infoStats, setInfoStats] = useState<OverlayLevelStats | undefined>(undefined);
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
  // Phase 15: tower troops (Tower Princess, Cannoneer, Dagger Duchess, Royal Chef)
  // are crown-tower profiles selected before a match, so they are NOT deck cards
  // and must not be offered here.
  const collection: CatalogEntry[] = useMemo(
    () =>
      (catalog.length > 0
        ? catalog
        : cards.map((c) => ({
            name: c.name,
            cardType: c.cardType,
            elixir: c.elixir,
            rarity: c.rarity,
            playable: c.playable ?? true,
          }))
      ).filter((entry) => entry.cardType !== "tower" && !isTowerTroopId(entry.name)),
    [catalog, cards],
  );

  useEffect(() => {
    setSelectedTower(loadTowerSelection());
  }, []);

  // Resolve popup stats from the database level rows. Re-runs when the open
  // card or its owned level changes, so an upgrade shows the new values.
  useEffect(() => {
    const cardId = info?.name;
    if (!cardId) {
      setInfoStats(undefined);
      return undefined;
    }
    let cancelled = false;
    const level = profile?.cards?.[cardId] ?? 1;
    loadCardLevels(cardId, backendUrl())
      .then((levels) => {
        if (!cancelled) setInfoStats(overlayStatsFor(levels, level));
      })
      .catch(() => {
        if (!cancelled) setInfoStats(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [info, profile]);

  const ownedNames = useMemo(() => new Set(Object.keys(profile?.cards ?? {})), [profile]);
  const unlocked = useMemo(
    () => collection.filter((c) => ownedNames.has(c.name)),
    [collection, ownedNames],
  );
  const locked = useMemo(
    () => collection.filter((c) => !ownedNames.has(c.name)),
    [collection, ownedNames],
  );
  const towers = useMemo(() => CARD_LIST.filter((c) => c.type === "tower"), []);
  const levelOfCard = (name: string): number => profile?.cards?.[name] ?? 1;
  const towerLevel = (id: string): number => profile?.towerLevels?.[id] ?? 1;

  const matchesFilters = useCallback(
    (c: CatalogEntry): boolean => {
      const q = query.trim().toLowerCase();
      if (q.length > 0 && !c.name.toLowerCase().includes(q)) return false;
      if (rarity !== "all" && c.rarity !== rarity) return false;
      if (costFilter !== "all" && c.elixir !== costFilter) return false;
      return true;
    },
    [query, rarity, costFilter],
  );

  /** Matching cards first, remaining cards below (never removed). */
  const splitFiltered = useCallback(
    (list: CatalogEntry[]): { matched: CatalogEntry[]; rest: CatalogEntry[] } => {
      const sorted = [...list].sort((a, b) => {
        if (sortKey === "elixir") return a.elixir - b.elixir || a.name.localeCompare(b.name);
        if (sortKey === "level") return levelOfCard(b.name) - levelOfCard(a.name) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
      return {
        matched: sorted.filter(matchesFilters),
        rest: sorted.filter((c) => !matchesFilters(c)),
      };
    },
    [matchesFilters, sortKey, profile],
  );

  // Repair a stale deck that contains cards the player no longer owns (older
  // saves could hold locked cards): free the slot, then fill from owned cards.
  const repairedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || profile === null || repairedRef.current) return;
    repairedRef.current = true;
    const ownedIds = collection.filter((c) => ownedNames.has(c.name)).map((c) => c.name);
    if (ownedIds.length === 0) return;
    const next = deck.map((id) => (id && ownedNames.has(id) ? id : ""));
    for (let i = 0; i < next.length; i += 1) {
      if (next[i]) continue;
      const filler = ownedIds.find((id) => !next.includes(id));
      if (filler) next[i] = filler;
    }
    if (next.some((id, i) => id !== deck[i])) loadDeckInto(next);
  }, [hydrated, profile, collection, ownedNames, deck, loadDeckInto]);

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
    if (!ownedNames.has(name)) {
      say(`${pretty(name)} is locked — unlock it in the shop first`);
      return;
    }
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

  const levelOf = (name: string): number => profile?.cards?.[name] ?? 1;
  const upgradeCostOf = (name: string): number =>
    Math.round(200 * Math.pow(1.35, Math.max(0, levelOf(name) - 1)));

  const doUpgrade = async (name: string) => {
    if (!playerId) {
      say("Sign in to upgrade cards");
      return;
    }
    try {
      const res = await upgradePlayerCard(playerId, name, backendUrl());
      say(`${pretty(name)} upgraded to level ${res.level} (−${res.cost} coins)`);
      await refreshProfile();
    } catch (err) {
      say(err instanceof Error ? err.message : "Upgrade failed");
    }
  };

  const selectTower = (towerId: string) => {
    setSelectedTower(towerId);
    saveTowerSelection(towerId);
    say(`${pretty(towerId)} selected as crown tower`);
  };

  const doUpgradeTower = async (towerId: string) => {
    if (!playerId) {
      say("Sign in to upgrade towers");
      return;
    }
    try {
      const res = await upgradePlayerTower(playerId, towerId, backendUrl());
      say(`${pretty(towerId)} tower upgraded to level ${res.level} (−${res.cost} coins)`);
      await refreshProfile();
    } catch (err) {
      say(err instanceof Error ? err.message : "Tower upgrade failed");
    }
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
      const ownedPool = unlocked.map((card) => card.name);
      if (ownedPool.length < DECK_SIZE) {
        setRandomError("Not enough unlocked cards for a random deck.");
        say("Unlock more cards first");
        return;
      }
      const result = generateRandomDeck(ownedPool);
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
  }, [activeDeckId, decks, placeAt, playerId, pushDecks, refreshProfile, say, unlocked]);

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

  const filtersBar = (
    <div className="mb-2 space-y-1" data-testid="deck-filters">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search cards…"
        data-testid="card-search"
        className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
      />
      <div className="flex flex-wrap items-center gap-1">
        {(["all", "common", "rare", "epic", "legendary", "champion"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRarity(r)}
            data-testid={`deck-filter-rarity-${r}`}
            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
              rarity === r
                ? "border-amber-400 bg-amber-400/25 text-amber-200"
                : "border-slate-700 bg-slate-800/50 text-slate-200"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {(["all", 1, 2, 3, 4, 5, 6, 7, 8] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setCostFilter(e)}
            data-testid={`deck-filter-cost-${e}`}
            className={`min-w-[1.7rem] rounded-full border px-1.5 py-0.5 text-[10px] font-extrabold ${
              costFilter === e
                ? "border-amber-300 bg-amber-300/25 text-amber-200"
                : "border-slate-700 bg-slate-800/50 text-slate-200"
            }`}
          >
            {e === "all" ? "All" : e}
          </button>
        ))}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          data-testid="deck-sort"
          className="ml-auto rounded-md border border-slate-600 bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-200"
        >
          <option value="name">Sort: Name</option>
          <option value="elixir">Sort: Elixir</option>
          <option value="level">Sort: Level</option>
        </select>
      </div>
    </div>
  );

  const renderCardGroups = (list: CatalogEntry[], groupTestId: string, locked = false) => {
    const { matched, rest } = splitFiltered(list);
    const tile = (c: CatalogEntry) => (
      <CardTile
        key={c.name}
        name={c.name}
        rarity={c.rarity}
        cost={c.elixir}
        level={locked ? 0 : levelOf(c.name)}
        testId={`${groupTestId}-${c.name}`}
        inDeck={deck.includes(c.name)}
        locked={locked}
        onClick={() => setInfo({ name: c.name, slot: "list" })}
      />
    );
    return (
      <>
        <div className="grid grid-cols-4 gap-2" data-testid={`${groupTestId}-matched`} data-count={matched.length}>
          {matched.map(tile)}
        </div>
        {rest.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Other cards
            </p>
            <div className="grid grid-cols-4 gap-2 opacity-80" data-testid={`${groupTestId}-rest`} data-count={rest.length}>
              {rest.map(tile)}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <PageShell active="cards" topBarCurrencies={{ cards: cards.length, coins: profile?.coins ?? 0, gems: profile?.gems ?? 0 }}>
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
                  level={levelOf(f.name)}
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
          {(["deck", "collection", "towers"] as const).map((t) => (
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
              {t === "deck" ? "My Deck" : t === "collection" ? "Collection" : "Towers"}
            </button>
          ))}
        </div>

        {tab === "deck" ? (
          <section data-testid="unlocked-cards">
            <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
              Unlocked cards ({unlocked.length})
            </h3>
            <p className="mb-2 text-[10px] text-slate-400">
              Tap an unlocked card to add it. <span className="text-rose-300">Remove</span> from My Deck above.
            </p>
            {filtersBar}
            {renderCardGroups(unlocked, "unlocked-card")}
          </section>
        ) : tab === "collection" ? (
          <section data-testid="collection-list">
            {filtersBar}
            <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
              Unlocked ({unlocked.length})
            </h3>
            {renderCardGroups(unlocked, "collection-card")}
            <h3 className="mb-1 mt-4 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Locked ({locked.length})
            </h3>
            {renderCardGroups(locked, "locked-card", true)}
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Source: <span data-testid="collection-source">mysql</span> • {collection.length} cards (
              {collection.filter((c) => c.playable).length} playable)
            </p>
          </section>
        ) : (
          <section data-testid="towers-tab">
            <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-cyan-300">
              Crown Towers
            </h3>
            <p className="mb-2 text-[10px] text-slate-400">
              Upgrades are separate from card levels. Select one tower profile for battle.
            </p>
            <div className="space-y-2">
              {towers.map((tower) => {
                const lvl = towerLevel(tower.id);
                const selected = selectedTower === tower.id;
                const cost = Math.round(200 * Math.pow(1.35, Math.max(0, lvl - 1)));
                return (
                  <div
                    key={tower.id}
                    data-testid={`tower-row-${tower.id}`}
                    className={`flex items-center gap-2 rounded-lg border p-2 ${
                      selected ? "border-amber-400 bg-amber-400/10" : "border-slate-600 bg-slate-800/40"
                    }`}
                  >
                    <CardTile
                      name={tower.id}
                      rarity={tower.rarity}
                      cost={tower.cost}
                      level={lvl}
                      size="sm"
                      testId={`tower-card-${tower.id}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-extrabold text-white">{pretty(tower.id)}</p>
                      <p className="text-[10px] font-bold text-sky-300">Level {lvl}</p>
                    </div>
                    <button
                      type="button"
                      data-testid={`tower-select-${tower.id}`}
                      onClick={() => selectTower(tower.id)}
                      className="rounded-md border border-amber-600 bg-gradient-to-b from-amber-300 to-amber-500 px-2 py-1 text-[10px] font-extrabold uppercase text-amber-950 active:translate-y-0.5"
                    >
                      {selected ? "Selected" : "Select"}
                    </button>
                    <button
                      type="button"
                      data-testid={`tower-upgrade-${tower.id}`}
                      onClick={() => void doUpgradeTower(tower.id)}
                      disabled={lvl >= 16}
                      className="rounded-md border border-purple-700 bg-gradient-to-b from-purple-400 to-purple-700 px-2 py-1 text-[10px] font-extrabold uppercase text-white active:translate-y-0.5 disabled:opacity-50"
                    >
                      {lvl >= 16 ? "Max" : `Upgrade ${cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {info
        ? (() => {
            const f = factsByName[info.name];
            if (!f) return null;
            const inDeck = deck.includes(info.name);
            const isOwned = ownedNames.has(info.name);
            return (
              <CardInfoOverlay
                name={f.name}
                rarity={f.rarity as CardInfoOverlayProps["rarity"]}
                cardType={f.cardType as CardInfoOverlayProps["cardType"]}
                elixir={f.elixir}
                level={levelOf(f.name)}
                upgradeCost={upgradeCostOf(f.name)}
                maxLevel={levelOf(f.name) >= 16}
                stats={infoStats}
                onClose={() => setInfo(null)}
                onUse={isOwned ? () => requestUse(info.name) : undefined}
                onRemove={isOwned && inDeck ? () => doRemove(info.slot, info.name) : undefined}
                onUpgrade={isOwned ? () => void doUpgrade(info.name) : undefined}
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