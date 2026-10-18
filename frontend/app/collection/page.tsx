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
import { backendUrl, getCatalog, getContentCards, type CatalogEntry, type ContentCard } from "../../lib/api";
import { useDeckState } from "../../lib/useDeck";

// Collection: full catalog (108), rarity + elixir filters, grid of the shared
// CardTile. Tapping a card opens the same info popup as My Deck, with working
// Use (add / replace via the slot picker) and Remove.
export default function CollectionPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [roster, setRoster] = useState<ContentCard[]>([]);
  const [source, setSource] = useState("local");
  const [filter, setFilter] = useState<"all" | "common" | "rare" | "epic" | "legendary" | "champion">("all");
  const [cost, setCost] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ name: string } | null>(null);
  const [replace, setReplace] = useState<{ name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { deck, placeAt, useCard, removeCard } = useDeckState();

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
    return out;
  }, [catalog, roster]);

  const statsByName = useMemo(() => {
    const out: Record<string, ContentCard> = {};
    for (const c of roster) out[c.name] = c;
    return out;
  }, [roster]);

  const slotFacts = useMemo(() => {
    const out: Record<string, DeckSlotFact> = {};
    for (const [name, f] of Object.entries(factsByName)) {
      out[name] = { name: f.name, rarity: f.rarity, elixir: f.elixir };
    }
    return out;
  }, [factsByName]);

  const filtered = catalog.filter((c) => {
    if (filter !== "all" && c.rarity !== filter) return false;
    if (cost !== "all" && c.elixir !== cost) return false;
    return true;
  });
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

  return (
    <PageShell active="cards" topBarCurrencies={{ cards: found, coins: 0, gems: 0 }}>
      <div className="px-3 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Card Collection</h1>
          <div className="rounded-md border border-fuchsia-500/50 bg-fuchsia-950/60 px-2 py-0.5 text-xs font-bold text-fuchsia-200">
            {loading ? "…" : `Found: ${found}/${playable || found}`}
          </div>
        </header>

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
          <ul
            data-testid="collection-grid"
            className="grid grid-cols-4 gap-2"
            data-count={filtered.length}
          >
            {filtered.map((c) => (
              <li key={c.name} className="flex justify-center">
                <CardTile
                  name={c.name}
                  rarity={c.rarity}
                  cost={c.elixir}
                  level={15}
                  testId={`collection-card-${c.name}`}
                  inDeck={deck.includes(c.name)}
                  onClick={() => setInfo({ name: c.name })}
                  ariaLabel={`${c.name}, ${c.elixir} elixir`}
                />
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="col-span-4 py-4 text-center text-sm text-slate-300">
                No cards match those filters.
              </li>
            )}
          </ul>
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
              onRemove={inDeck ? () => doRemove(info.name) : undefined}
              onUpgrade={() => setInfo(null)}
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