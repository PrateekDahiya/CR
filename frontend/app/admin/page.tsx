"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageShell } from "../../components/ui";
import {
  ApiError,
  adminLogin,
  adminSetWallet,
  backendUrl,
  getAdminPlayers,
  getAdminStats,
  type AdminPlayerRow,
  type AdminStats,
} from "../../lib/api";

const TOKEN_KEY = "cr-admin-token";

interface Draft {
  coins: string;
  gems: string;
  trophies: string;
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("dahiya27");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [players, setPlayers] = useState<AdminPlayerRow[]>([]);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
  }, []);

  const load = useCallback(async (activeToken: string, q = "") => {
    setBusy(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        getAdminStats(activeToken, backendUrl()),
        getAdminPlayers(activeToken, q, backendUrl()),
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
      if (e instanceof ApiError && e.status === 401) {
        window.sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
      setError(e instanceof Error ? e.message : "admin load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminLogin(username.trim(), password, backendUrl());
      window.sessionStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setBusy(false);
    }
  };

  const save = async (row: AdminPlayerRow) => {
    if (!token) return;
    const draft = drafts[row.playerId];
    if (!draft) return;
    setBusy(true);
    try {
      await adminSetWallet(
        token,
        row.playerId,
        {
          coins: Number(draft.coins),
          gems: Number(draft.gems),
          trophies: Number(draft.trophies),
        },
        backendUrl(),
      );
      setNotice(`Updated ${row.playerId}`);
      await load(token, query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <PageShell active="ranked" topBarCurrencies={{ cards: 0, coins: 0, gems: 0 }}>
        <div className="mx-auto max-w-sm px-4 py-10" data-testid="admin-login">
          <h1 className="mb-1 text-2xl font-extrabold text-white">Admin Login</h1>
          <p className="mb-4 text-xs text-slate-400">Authorized staff only.</p>
          <form onSubmit={(e) => void login(e)} className="space-y-2 rounded-xl border border-slate-600 bg-[#12224a]/80 p-3">
            <label className="block text-[11px] font-bold uppercase text-slate-300">
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="admin-username"
                className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="block text-[11px] font-bold uppercase text-slate-300">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="admin-password"
                className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
              />
            </label>
            {error && <p className="text-xs font-bold text-rose-300">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              data-testid="admin-login-submit"
              className="w-full rounded-md border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 py-2 text-sm font-extrabold uppercase text-amber-950 active:translate-y-0.5 disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
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
            <p className="text-[11px] text-slate-400">Signed in as {username || "admin"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              window.sessionStorage.removeItem(TOKEN_KEY);
              setToken(null);
            }}
            className="rounded-md border border-rose-700 bg-rose-500/20 px-2 py-1 text-[10px] font-extrabold uppercase text-rose-200"
          >
            Sign out
          </button>
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
            placeholder="Search player..."
            data-testid="admin-search"
            className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1 text-xs text-white"
          />
          <button
            type="button"
            onClick={() => token && void load(token, query)}
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
