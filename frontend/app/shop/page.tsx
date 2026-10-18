"use client";

import { useEffect, useState } from "react";
import { PageShell, CardTile, CRButton } from "../../components/ui";
import { backendUrl, getCatalog, type CatalogEntry } from "../../lib/api";

interface Deal {
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "champion";
  x: number;
  owned: number;
  max: number;
  price: number;
  currency: "coin" | "gem";
  free?: boolean;
}

// Shop: Daily Deals + Trader (3-pane, like screenshot 07). Static curated deal set.
const DAILY: Deal[] = [
  { name: "ice-golem", rarity: "rare", x: 25, owned: 411, max: 400, price: 0, currency: "coin", free: true },
  { name: "minions", rarity: "common", x: 50, owned: 4410, max: 1500, price: 500, currency: "coin" },
  { name: "zap", rarity: "common", x: 80, owned: 700, max: 5500, price: 800, currency: "coin" },
  { name: "furnace", rarity: "rare", x: 30, owned: 179, max: 550, price: 1500, currency: "coin" },
  { name: "battle-ram", rarity: "rare", x: 40, owned: 844, max: 300, price: 2000, currency: "coin" },
  { name: "freeze", rarity: "epic", x: 5, owned: 0, max: 180, price: 100, currency: "gem" },
];

export default function ShopPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCatalog(backendUrl()).then((d) => !cancelled && setCatalog(d.catalog)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell active="shop" topBarCurrencies={{ cards: 0, coins: 1625, gems: 5 }}>
      <div className="px-3 py-3">
        <section className="rounded-xl border-2 border-emerald-700 bg-gradient-to-b from-emerald-900/50 to-emerald-950/40 p-3" data-testid="shop-deals">
          <header className="mb-2 flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-white">Daily Deals</h1>
            <span className="text-xs text-emerald-200">New cards in 11h 24m</span>
          </header>
          <div className="grid grid-cols-3 gap-2">
            {DAILY.map((d) => (
              <div key={d.name} data-testid={`deal-${d.name}`} className="rounded-lg border border-emerald-500/60 bg-emerald-700/30 p-2 text-center">
                <div className="text-[10px] font-extrabold uppercase text-emerald-100">{d.rarity}</div>
                <div className="mx-auto my-1 inline-block">
                  <CardTile name={d.name} rarity={d.rarity} level={0} size="sm" testId={`deal-card-${d.name}`} />
                </div>
                <div className="text-base font-extrabold text-white">x{d.x}</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full bg-gradient-to-r from-sky-400 to-sky-500" style={{ width: `${Math.min(100, (d.owned / Math.max(1, d.max)) * 100)}%` }} />
                </div>
                <div className="text-[10px] text-slate-200">{d.owned}/{d.max}</div>
                {d.free ? (
                  <div className="mt-1 text-lg font-extrabold text-emerald-300">FREE!</div>
                ) : (
                  <div className="mt-1 text-lg font-extrabold text-amber-300">
                    {d.price} {d.currency === "coin" ? "🪙" : "💎"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-xl border-2 border-purple-700 bg-gradient-to-b from-purple-900/40 to-purple-950/40 p-3" data-testid="shop-trader">
          <h2 className="text-xl font-extrabold text-white">Trader</h2>
          <p className="text-center text-sm font-bold text-amber-200">Cards available for trade!</p>
          <p className="mt-1 text-center text-xs text-slate-300">Catalogue: {catalog.length} cards. Open the collection to start trading.</p>
          <div className="mt-2 flex justify-center">
            <CRButton variant="purple" size="md" testId="trader-open" href="/collection" icon="🃏">
              Open Trader
            </CRButton>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
