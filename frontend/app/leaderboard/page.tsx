// CR-Clash leaderboard page - exact-CR style (MEMORY#18).
// Gold trophy table, blue gradient bg, portrait max-w column. O(n) render n<=100.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { backendUrl, getLeaderboard, type LeaderboardEntry } from "../../lib/api";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [season, setSeason] = useState("s1");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getLeaderboard(20, backendUrl());
        if (!cancelled) {
          setEntries(res.entries);
          setSeason(res.season);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-gradient-to-b from-sky-400 via-green-500 to-amber-900 p-4 text-white">
      <nav className="flex items-center justify-between text-sm font-bold">
        <Link href="/" data-testid="nav-menu" className="rounded bg-black/30 px-2 py-1">🏠 Menu</Link>
        <span data-testid="leaderboard-season">🏆 Season {season}</span>
        <Link href="/deck" data-testid="nav-deck" className="rounded bg-black/30 px-2 py-1">🃏 Deck</Link>
      </nav>
      <h1 className="mt-4 text-center text-3xl font-extrabold drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]">🏆 Leaderboard</h1>
      {error ? <p data-testid="leaderboard-error" className="mt-2 rounded bg-red-700 p-2 text-sm">{error}</p> : null}
      <ol className="mt-4 space-y-2" data-testid="leaderboard-list">
        {entries.map((e, i) => (
          <li key={e.playerId} data-testid={`leaderboard-row-${i}`} className="flex items-center justify-between rounded-xl border-b-4 border-amber-700 bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-2 font-bold text-amber-950">
            <span>#{i + 1} {e.playerId}</span>
            <span>🏆 {e.trophies} • ✅{e.wins} ❌{e.losses}</span>
          </li>
        ))}
        {entries.length === 0 && !error ? <li className="rounded bg-black/30 p-3 text-center text-sm">No players yet — play a match!</li> : null}
      </ol>
    </main>
  );
}
