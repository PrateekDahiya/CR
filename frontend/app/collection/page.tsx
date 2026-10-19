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
import { backendUrl, getCatalog, getContentCards, upgradePlayerCard, type CatalogEntry, type ContentCard } from "../../lib/api";
import { useDeckState } from "../../lib/useDeck";
import { usePlayer } from "../../lib/playerContext";
import { loadCardLevels, overlayStatsFor, type OverlayLevelStats } from "../../lib/cardLevels";
import { CARDS } from "../../lib/cards";

// Collection: full catalog (108), rarity + elixir filters, grid of the shared
// CardTile. Tapping a card opens the same info popup as My Deck, with working
// Use (add / replace via the slot picker) and Remove.
export default function CollectionPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [roster, setRoster] = useState<ContentCard[]>([]);
  const [source, setSource] = useState("local");
  const [filter, setFilter] = useState<"all" | "common" | "rare" | "epic" | "legendary" | "champion">("all");
  const [cost, setCost] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "elixir" | "level">("name");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ name: string } | null>(null);
  const [infoStats, setInfoStats] = useState<OverlayLevelStats | undefined>(undefined);
  const [replace, setReplace] = useState<{ name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { deck, placeAt, useCard, removeCard } = useDeckState();
  const { playerId, profile, refresh: refreshProfile } = usePlayer();

  useEffect(() => {
    let cancelled = false;
    getCatalog(backendUrl())
      .then((d) => {
        if (cancelled) return;
        setCatalog(d.catalog);
        setSource(d.source);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    getContentCards(backendUrl())
      .then((d) => !cancelled && setRoster(d.cards))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const factsByName = useMemo(() => {
    const out: Record<string, CatalogEntry> = {};
    for (const c of catalog) out[c.name] = c;
    for (const c of roster) {
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
  }, [catalog, roster]);

  const slotFacts = useMemo(() => {
    const out: Record<string, DeckSlotFact> = {};
    for (const [name, f] of Object.entries(factsByName)) {
      out[name] = { name: f.name, rarity: f.rarity, elixir: f.elixir };
    }
    return out;
  }, [factsByName]);

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
  const unlocked = catalog.filter((c) => ownedNames.has(c.name));
  const locked = catalog.filter((c) => !ownedNames.has(c.name));

  const matchesFilters = (c: CatalogEntry): boolean => {
    const q = query.trim().toLowerCase();
    if (q.length > 0 && !c.name.toLowerCase().includes(q)) return false;
    if (filter !== "all" && c.rarity !== filter) return false;
    if (cost !== "all" && c.elixir !== cost) return false;
    return true;
  };
  const splitFiltered = (list: CatalogEntry[]): { matched: CatalogEntry[]; rest: CatalogEntry[] } => {
    const sorted = [...list].sort((a, b) => {
      if (sortKey === "elixir") return a.elixir - b.elixir || a.name.localeCompare(b.name);
      if (sortKey === "level") return (profile?.cards?.[b.name] ?? 0) - (profile?.cards?.[a.name] ?? 0) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return { matched: sorted.filter(matchesFilters), rest: sorted.filter((c) => !matchesFilters(c)) };
  };
  const found = catalog.length;
  const playable = catalog.filter((c) => c.playable).length;

  const pretty = (name: string) =>
    name
      .split("-")
      .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");

  const say = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

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
    const outgoing = deck[slot];
    placeAt(slot, replace.name);
    setReplace(null);
    say(
      outgoing && outgoing !== replace.name
        ? `${pretty(replace.name)} replaced ${pretty(outgoing)} in slot ${slot + 1}`
        : `${pretty(replace.name)} placed in slot ${slot + 1}`,
    );
  };

  const doRemove = (name: string) => {
    const at = deck.indexOf(name);
    removeCard("list", name);
    setInfo(null);
    say(`${pretty(name)} removed from slot ${at + 1}`);
  };

  const levelOf = (name: string): number => profile?.cards?.[name] ?? 1;
  const upgradeCost = (name: string): number =>
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
      const message = err instanceof Error ? err.message : "Upgrade failed";
      say(message);
    }
  };

  const renderGroups = (list: CatalogEntry[], groupId: string, isLocked: boolean) => {
    const { matched, rest } = splitFiltered(list);
    const tile = (c: CatalogEntry) => (
      <li key={c.name} className="flex justify-center">
        <CardTile
          name={c.name}
          rarity={c.rarity}
          cost={c.elixir}
          level={isLocked ? 0 : profile?.cards?.[c.name] ?? 1}
          testId={`${groupId}-${c.name}`}
          inDeck={deck.includes(c.name)}
          locked={isLocked}
          onClick={() => setInfo({ name: c.name })}
          ariaLabel={`${c.name}, ${c.elixir} elixir${isLocked ? ", locked" : ""}`}
        />
      </li>
    );
    return (
      <>
        <ul className="grid grid-cols-4 gap-2" data-testid={`matched-${groupId}`} data-count={matched.length}>
          {matched.map(tile)}
        </ul>
        {rest.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Other cards
            </p>
            <ul className="grid grid-cols-4 gap-2 opacity-80" data-testid={`rest-${groupId}`} data-count={rest.length}>
              {rest.map(tile)}
            </ul>
          </>
        )}
      </>
    );
  };

  return (
    <PageShell active="cards" topBarCurrencies={{ cards: found, coins: profile?.coins ?? 0, gems: profile?.gems ?? 0 }}>
      <div className="px-3 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Card Collection</h1>
          <div className="rounded-md border border-fuchsia-500/50 bg-fuchsia-950/60 px-2 py-0.5 text-xs font-bold text-fuchsia-200">
            {loading ? "…" : `Found: ${found}/${playable || found}`}
          </div>
        </header>

        <div className="mb-2 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards…"
            data-testid="collection-search"
            className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            data-testid="collection-sort"
            className="rounded-md border border-slate-600 bg-slate-900/70 px-1.5 py-1 text-[10px] font-bold text-slate-200"
          >
            <option value="name">Sort: Name</option>
            <option value="elixir">Sort: Elixir</option>
            <option value="level">Sort: Level</option>
          </select>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1" data-testid="collection-filters">
          {(["all", "common", "rare", "epic", "legendary", "champion"] as const).map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`filter-rarity-${r}`}
              onClick={() => setFilter(r)}
              className={`rounded-md border px-2 py-0.5 text-xs font-bold uppercase ${
                filter === r
                  ? "border-amber-400 bg-amber-400/25 text-amber-200"
                  : "border-slate-700 bg-slate-800/50 text-slate-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1" data-testid="cost-filters">
          {(["all", 1, 2, 3, 4, 5, 6, 7, 8] as const).map((e) => (
            <button
              key={e}
              type="button"
              data-testid={`filter-cost-${e}`}
              onClick={() => setCost(e as number | "all")}
              className={`min-w-[2rem] rounded-full border px-2 py-0.5 text-xs font-extrabold ${
                cost === e
                  ? "border-amber-300 bg-amber-300/25 text-amber-200"
                  : "border-slate-700 bg-slate-800/50 text-slate-200"
              }`}
            >
              {e === "all" ? "All" : e}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-300" data-testid="collection-loading">
            Loading collection…
          </p>
        ) : (
          <>
            <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
              Unlocked ({unlocked.length})
            </h3>
            <div data-testid="collection-grid">{renderGroups(unlocked, "collection-card", false)}</div>
            <h3 className="mb-1 mt-4 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Locked ({locked.length})
            </h3>
            {renderGroups(locked, "locked-card", true)}
          </>
        )}

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Source: <span data-testid="collection-source">{source}</span> • tap a card to add it to My
          Deck • ✓ means it is already in your deck
        </p>
        <div className="mt-2 flex justify-center">
          <CRButton variant="blue" size="sm" href="/decks" testId="collection-go-deck" icon="🃏">
            Edit Deck
          </CRButton>
        </div>
      </div>

      {info && factsByName[info.name] ? (
        (() => {
          const f = factsByName[info.name];
          const inDeck = deck.includes(info.name);
          const isOwned = ownedNames.has(info.name);
          return (
            <CardInfoOverlay
              name={f.name}
              rarity={f.rarity as CardInfoOverlayProps["rarity"]}
              cardType={f.cardType as CardInfoOverlayProps["cardType"]}
              elixir={f.elixir}
              level={levelOf(f.name)}
              upgradeCost={upgradeCost(f.name)}
              maxLevel={levelOf(f.name) >= 16}
              stats={infoStats}
              onClose={() => setInfo(null)}
              onUse={isOwned ? () => requestUse(info.name) : undefined}
              onRemove={isOwned && inDeck ? () => doRemove(info.name) : undefined}
              onUpgrade={isOwned ? () => void doUpgrade(info.name) : undefined}
              inDeck={inDeck}
            />
          );
        })()
      ) : null}

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