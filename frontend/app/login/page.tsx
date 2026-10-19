"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, backendUrl, loginAccount, registerAccount } from "../../lib/api";

/**
 * /login — real account access: register a username+password or sign in.
 * Credentials are verified server-side (scrypt hash); the account key is the
 * playerId, so trophies/coins/cards/decks persist across sessions.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "register"
          ? await registerAccount(username, password, backendUrl())
          : await loginAccount(username, password, backendUrl());
      try {
        window.localStorage.setItem("cr-player-id", res.playerId);
        window.localStorage.setItem("cr-name", res.name);
        window.localStorage.setItem("cr-auth-token", res.token);
      } catch {
        // private mode: session-only
      }
      router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      data-testid="login-page"
      className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[#0a1730] px-6 text-white"
    >
      <div className="w-full max-w-[360px] rounded-2xl border-4 border-amber-600/60 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] p-5 shadow-2xl">
        <h1 className="text-center text-2xl font-extrabold uppercase tracking-wide text-amber-300">
          ⚔️ CR Clone
        </h1>
        <p className="mt-1 text-center text-[11px] font-bold text-slate-300">
          {mode === "register" ? "Create your account" : "Log in to your account"}
        </p>

        {/* Tabs */}
        <div className="mt-4 grid grid-cols-2 gap-2" data-testid="auth-tabs">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`auth-tab-${m}`}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-lg border-b-4 px-3 py-1.5 text-sm font-extrabold uppercase tracking-wide transition active:translate-y-0.5 ${
                mode === m
                  ? "border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950"
                  : "border-slate-700 bg-gradient-to-b from-slate-600 to-slate-800 text-slate-200"
              }`}
            >
              {m === "login" ? "Log In" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-300">
            Username
            <input
              data-testid="auth-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={16}
              placeholder="3-16 letters, numbers, _"
              className="mt-1 w-full rounded-lg border border-slate-600 bg-[#0a1730] px-3 py-2 text-sm font-bold text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-300">
            Password
            <input
              data-testid="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              placeholder="at least 6 characters"
              className="mt-1 w-full rounded-lg border border-slate-600 bg-[#0a1730] px-3 py-2 text-sm font-bold text-white outline-none focus:border-amber-400"
            />
          </label>

          {error !== null && (
            <p
              data-testid="auth-error"
              className="rounded-lg border border-red-700 bg-red-950/80 px-3 py-1.5 text-[11px] font-bold text-red-200"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            data-testid="auth-submit"
            disabled={busy}
            className="mt-1 rounded-xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 text-base font-extrabold uppercase tracking-wide text-amber-950 active:translate-y-0.5 disabled:opacity-60"
          >
            {busy ? "…" : mode === "register" ? "Create Account" : "Log In"}
          </button>
        </form>

        <p className="mt-3 text-center text-[10px] text-slate-400">
          Your trophies, coins, cards and decks are saved to your account.
        </p>
      </div>
    </main>
  );
}