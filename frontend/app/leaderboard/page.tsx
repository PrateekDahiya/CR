"use client";

import { useEffect, useState } from "react";
import { PageShell, CRButton } from "../../components/ui";
import { backendUrl, getPlayers, type PlayerRow } from "../../lib/api";
import { usePlayer } from "../../lib/playerContext";

/**
 * Player table: rank, name, trophies, W/L record, win rate and wallet.
 * O(n) render for n rows (n <= 50 from /players).
 */
export default function LeaderboardPage() {
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [season, setSeason] = useState("s1");
  const [error, setError] = useState("");
  const { playerId, profile, refresh } = usePlayer();

  const load = () => {
    getPlayers(50, backendUrl())
      .then((res) => {
        setRows(res.rows);
        setSeason(res.season);
        setError("");
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    load();
    // Re-read when our own record changes (match finished).
  }, [profile?.trophies, profile?.wins, profile?.losses]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell active="ranked" topBarCurrencies={{ cards: profile?.cardsOwned ?? 0, coins: profile?.coins ?? 0, gems: profile?.gems ?? 0 }}>
      <div className="px-3 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-white">🏆 Player Table</h1>
          <span data-testid="leaderboard-season" className="text-[11px] font-bold text-amber-300">
            Season {season}
          </span>
        </header>

        {error !== "" && (
          <p data-testid="leaderboard-error" className="mb-2 rounded bg-red-700 p-2 text-xs">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-xl border-2 border-amber-600/50" data-testid="player-table">
          <div className="grid grid-cols-[28px_1fr_58px_46px_44px] gap-1 bg-amber-300/90 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-950">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">🏆</span>
            <span className="text-right">W/L</span>
            <span className="text-right">Win%</span>
          </div>
          <ol data-testid="leaderboard-list">
            {rows.map((r) => {
              const me = r.playerId === playerId;
              return (
                <li
                  key={r.playerId}
                  data-testid={`leaderboard-row-${r.rank - 1}`}
                  className={`grid grid-cols-[28px_1fr_58px_46px_44px] items-center gap-1 border-t border-slate-600/40 px-2 py-1.5 text-xs font-bold ${
                    me ? "bg-emerald-500/25 text-white" : "text-slate-100"
                  }`}
                >
                  <span className="text-amber-300">{r.rank}</span>
                  <span className="truncate">
                    {r.name}
                    {me ? " (you)" : ""}
                    <span className="ml-1 text-[10px] text-slate-400">
                      🪙{r.coins.toLocaleString()} 💎{r.gems}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">{r.trophies.toLocaleString()}</span>
                  <span className="text-right tabular-nums">
                    {r.wins}/{r.losses}
                  </span>
                  <span className="text-right tabular-nums">{r.winRate}%</span>
                </li>
              );
            })}
          </ol>
          {rows.length === 0 && (
            <p className="p-3 text-center text-xs text-slate-300">
              No players yet — play a match to appear here.
            </p>
          )}
        </div>

        <div className="mt-3 flex justify-center">
          <CRButton variant="blue" size="sm" testId="leaderboard-refresh" onClick={() => { void refresh(); load(); }} icon="🔄">
            Refresh
          </CRButton>
        </div>
      </div>
    </PageShell>
  );
}