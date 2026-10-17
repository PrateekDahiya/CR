"use client";

import { useEffect, useState } from "react";
import { PageShell, CardArt, CRButton } from "../../components/ui";
import { backendUrl, getContentCards, type ContentCard } from "../../lib/api";

export default function DecksPage() {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [activeTab, setActiveTab] = useState<number>(6);

  useEffect(() => {
    let cancelled = false;
    getContentCards(backendUrl())
      .then((d) => !cancelled && setCards(d.cards))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
          {cards.slice(0, 8).map((c, i) => (
            <div key={`${c.name}-${i}`} data-testid={`deck-card-${i}`} className="flex flex-col items-center">
              <CardArt name={c.name} rarity={c.rarity as "common" | "rare" | "epic" | "legendary" | "champion"} cost={c.elixir} level={15} showLevel />
              <div className="mt-0.5 text-center text-[10px] font-bold text-white">{c.name}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
          <span className="text-sm font-bold text-fuchsia-300">🟣 {cards.length > 0 ? Math.min(10, cards.reduce((a, c) => a + c.elixir, 0) / 8).toFixed(1) : "—"} / 10</span>
          <CRButton variant="gold" size="sm" testId="deck-battle" href="/lobby" icon="⚔️">
            Battle
          </CRButton>
        </div>

        <p className="mt-2 text-center text-[11px] text-slate-400">Selected deck #6 — switch to edit a different preset.</p>
      </div>
    </PageShell>
  );
}
