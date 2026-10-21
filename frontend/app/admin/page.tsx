"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "../../components/ui";
import { usePlayer } from "../../lib/playerContext";
import {
  adminSetWallet,
  backendUrl,
  getAdminPlayers,
  getAdminStats,
  type AdminPlayerRow,
  type AdminStats,
} from "../../lib/api";

interface Draft {
  coins: string;
  gems: string;
  trophies: string;
}

export default function AdminPage() {
  const { profile, loading } = usePlayer();
  const authorized = profile?.admin === true;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [players, setPlayers] = useState<AdminPlayerRow[]>([]);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (q = "") => {
    setBusy(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        getAdminStats(backendUrl()),
        getAdminPlayers(q, backendUrl()),
      ]);
      setStats(s);
      setPlayers(p.players);
      setDrafts(
        Object.fromEntries(
          p.players.map((row) => [
            row.playerId,
            { coins: String(row.coins), gems: String(row.gems), trophies: String(row.trophies) },
          ]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "admin load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) void load("");
  }, [authorized, load]);

  const save = async (row: AdminPlayerRow) => {
    const draft = drafts[row.playerId];
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await adminSetWallet(
        row.playerId,
        {
          coins: Number(draft.coins),
          gems: Number(draft.gems),
          trophies: Number(draft.trophies),
        },
        backendUrl(),
      );
      setNotice(`Updated ${row.playerId}`);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PageShell active="ranked" topBarCurrencies={{ cards: 0, coins: 0, gems: 0 }}>
        <div className="px-4 py-10 text-center text-sm text-slate-300" data-testid="admin-checking">
          Checking admin access...
        </div>
      </PageShell>
    );
  }

  if (!authorized) {
    return (
      <PageShell active="ranked" topBarCurrencies={{ cards: 0, coins: 0, gems: 0 }}>
        <div
          className="mx-auto mt-10 max-w-sm rounded-xl border border-rose-700 bg-rose-950/40 p-5 text-center"
          data-testid="admin-unauthorized"
        >
          <h1 className="text-2xl font-extrabold text-white">Not authorized</h1>
          <p className="mt-2 text-sm text-rose-100/80">
            {profile?.playerId ? `${profile.playerId} is not an admin.` : "Sign in with the admin account to continue."}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 text-xs font-extrabold uppercase text-amber-950"
          >
            Back to game
          </Link>
        </div>
      </PageShell>
    );
  }

  const cards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0 },
    { label: "Active Today", value: stats?.activeToday ?? 0 },
    { label: "New Today", value: stats?.newToday ?? 0 },
    { label: "Recorded Games", value: stats?.totalGames ?? 0 },
    { label: "Coins in Circulation", value: stats?.totalCoins ?? 0 },
    { label: "Gems in Circulation", value: stats?.totalGems ?? 0 },
    { label: "Owned Card Copies", value: stats?.totalCards ?? 0 },
    { label: "Decks", value: stats?.totalDecks ?? 0 },
  ];

  return (
    <PageShell active="ranked" topBarCurrencies={{ cards: 0, coins: stats?.totalCoins ?? 0, gems: stats?.totalGems ?? 0 }}>
      <div className="px-3 py-3" data-testid="admin-dashboard">
        <header className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Admin Dashboard</h1>
            <p className="text-[11px] text-slate-400">Signed in as {profile?.playerId}</p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-sky-700 bg-sky-500/20 px-2 py-1 text-[10px] font-extrabold uppercase text-sky-100"
          >
            Back to game
          </Link>
        </header>

        {error && <p className="mb-2 rounded-md bg-rose-950/70 p-2 text-xs font-bold text-rose-200">{error}</p>}
        {notice && <p className="mb-2 rounded-md bg-emerald-950/70 p-2 text-xs font-bold text-emerald-200">{notice}</p>}

        <div className="mb-3 grid grid-cols-2 gap-2" data-testid="admin-stats">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-slate-600 bg-[#12224a]/80 p-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{card.label}</div>
              <div className="text-lg font-extrabold text-amber-200">{card.value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div className="mb-2 flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(query);
            }}
            placeholder="Search player..."
            data-testid="admin-search"
            className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1 text-xs text-white"
          />
          <button
            type="button"
            onClick={() => void load(query)}
            data-testid="admin-refresh"
            className="rounded-md border border-sky-700 bg-sky-500/20 px-2 py-1 text-[10px] font-extrabold uppercase text-sky-100"
          >
            Search
          </button>
        </div>

        <div className="space-y-2" data-testid="admin-players">
          {players.map((row) => {
            const draft = drafts[row.playerId] ?? { coins: String(row.coins), gems: String(row.gems), trophies: String(row.trophies) };
            return (
              <div key={row.playerId} data-testid={`admin-row-${row.playerId}`} className="rounded-lg border border-slate-600 bg-[#12224a]/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-white">{row.name}</p>
                    <p className="truncate text-[9px] text-slate-400">{row.playerId}</p>
                  </div>
                  <div className="text-right text-[9px] text-slate-400">
                    <div>{row.cardsOwned} cards · {row.decks} decks</div>
                    <div>Lv {row.kingLevel} · {row.wins}W/{row.losses}L</div>
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {(["coins", "gems", "trophies"] as const).map((field) => (
                    <label key={field} className="text-[9px] font-bold uppercase text-slate-400">
                      {field}
                      <input
                        type="number"
                        min={0}
                        value={draft[field]}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.playerId]: { ...draft, [field]: e.target.value },
                          }))
                        }
                        data-testid={`admin-${field}-${row.playerId}`}
                        className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900/80 px-1 py-0.5 text-[11px] text-white"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void save(row)}
                  disabled={busy}
                  data-testid={`admin-save-${row.playerId}`}
                  className="mt-1 w-full rounded-md border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-700 py-1 text-[10px] font-extrabold uppercase text-white active:translate-y-0.5 disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            );
          })}
          {players.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No players found.</p>}
        </div>
      </div>
    </PageShell>
  );
}
