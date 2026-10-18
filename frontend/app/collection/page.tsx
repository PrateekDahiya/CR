"use client";

import { useEffect, useState } from "react";
import { PageShell, CardArt, CardFrame, CRButton } from "../../components/ui";
import { backendUrl, getCatalog, type CatalogEntry } from "../../lib/api";

// Collection: full catalog (108), filters by elixir/rarity, grid of CardArt.
export default function CollectionPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [source, setSource] = useState("local");
  const [filter, setFilter] = useState<"all" | "common" | "rare" | "epic" | "legendary" | "champion">("all");
  const [cost, setCost] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCatalog(backendUrl())
      .then((d) => {
        if (!cancelled) {
          setCatalog(d.catalog);
          setSource(d.source);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = catalog.filter((c) => {
    if (filter !== "all" && c.rarity !== filter) return false;
    if (cost !== "all" && c.elixir !== cost) return false;
    return true;
  });
  const found = catalog.length;
  const playable = catalog.filter((c) => c.playable).length;

  return (
    <PageShell active="cards" topBarCurrencies={{ cards: found, coins: 0, gems: 0 }}>
      <div className="px-3 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Card Collection</h1>
          <div className="rounded-md bg-fuchsia-500/20 px-2 py-0.5 text-xs font-bold text-fuchsia-200">
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
                filter === r ? "border-amber-400 bg-amber-400/20 text-amber-200" : "border-slate-700 bg-slate-800/40 text-slate-200"
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
                cost === e ? "border-amber-300 bg-amber-300/20 text-amber-200" : "border-slate-700 bg-slate-800/40 text-slate-200"
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
              <li key={c.name} data-testid={`collection-card-${c.name}`}>
                <CardFrame rarity={c.rarity as "common" | "rare" | "epic" | "legendary" | "champion"}>
                  <CardArt name={c.name} rarity={c.rarity as "common" | "rare" | "epic" | "legendary" | "champion"} cost={c.elixir} />
                  <div className="mt-1 text-center text-[10px] font-bold text-white">{c.name}</div>
                </CardFrame>
              </li>
            ))}
            {filtered.length === 0 && <li className="col-span-4 py-4 text-center text-sm text-slate-300">No cards match those filters.</li>}
          </ul>
        )}

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Source: <span data-testid="collection-source">{source}</span> • playable = full game stats; others are display-only
        </p>
        <div className="mt-2 flex justify-center">
          <CRButton variant="blue" size="sm" href="/deck" testId="collection-go-deck" icon="🃏">
            Edit Deck
          </CRButton>
        </div>
      </div>
    </PageShell>
  );
}
