"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell, CRButton } from "../../components/ui";
import { backendUrl, getCatalog, getLeaderboard, type CatalogEntry, type LeaderboardEntry } from "../../lib/api";

export default function SocialPage() {
  const [tab, setTab] = useState<"leaderboard" | "clan">("leaderboard");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [cards, setCards] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLeaderboard(15, backendUrl()), getCatalog(backendUrl())])
      .then(([lb, cat]) => {
        if (!cancelled) {
          setEntries(lb.entries);
          setCards(cat.catalog);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell active="social" topBarCurrencies={{ cards: 0, coins: 0, gems: 0 }}>
      <div className="px-3 py-3">
        <div className="mb-3 flex items-center gap-2" data-testid="social-tabs">
          <button
            type="button"
            data-testid="social-tab-leaderboard"
            onClick={() => setTab("leaderboard")}
            className={`flex-1 rounded-md border px-2 py-1 text-sm font-bold ${
              tab === "leaderboard" ? "border-purple-400 bg-purple-500/30 text-white" : "border-slate-700 bg-slate-800/40 text-slate-200"
            }`}
          >
            🏆 Leaderboard
          </button>
          <button
            type="button"
            data-testid="social-tab-clan"
            onClick={() => setTab("clan")}
            className={`flex-1 rounded-md border px-2 py-1 text-sm font-bold ${
              tab === "clan" ? "border-amber-400 bg-amber-400/20 text-amber-200" : "border-slate-700 bg-slate-800/40 text-slate-200"
            }`}
          >
            🛡️ Clan
          </button>
        </div>

        {tab === "leaderboard" ? (
          <section data-testid="social-leaderboard" className="rounded-xl border-2 border-purple-700 bg-gradient-to-b from-purple-900/70 to-purple-950/70 p-3">
            <h2 className="mb-2 text-center text-lg font-extrabold text-white">Online Leaderboard</h2>
            {loading ? (
              <p className="text-center text-sm text-slate-200">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="text-center text-sm text-slate-200" data-testid="social-leaderboard-empty">No players yet — be the first to play!</p>
            ) : (
              <ol className="space-y-1" data-testid="social-leaderboard-list">
                {entries.map((e, i) => (
                  <li
                    key={e.playerId}
                    data-testid={`social-leaderboard-row-${i}`}
                    className="flex items-center justify-between rounded-md bg-slate-200 px-2 py-1 text-sm text-slate-900"
                  >
                    <span>
                      <strong>#{i + 1}</strong> {e.playerId}
                    </span>
                    <span className="font-bold text-amber-700">🏆 {e.trophies}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : (
          <section data-testid="social-clan" className="rounded-xl border-2 border-amber-700 bg-gradient-to-b from-amber-900/40 to-amber-950/40 p-4 text-center">
            <h2 className="text-lg font-extrabold text-white">Clan Wars</h2>
            <p className="mt-2 text-sm text-slate-200">Clan chat, donations and war tracking — coming soon.</p>
            <CRButton variant="blue" size="md" testId="clan-join" icon="➕">
              Join a Clan
            </CRButton>
          </section>
        )}

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Catalog backed by <code className="text-amber-300">{cards.length}</code> cards.
        </p>
        <div className="mt-2 text-center">
          <Link href="/leaderboard" className="text-xs font-bold text-amber-300 underline" data-testid="social-leaderboard-redirect">
            Open full leaderboard →
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
