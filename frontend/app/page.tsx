"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

type BackendStatus = "checking" | "online" | "offline";

const dotClass: Record<BackendStatus, string> = {
  checking: "bg-yellow-400",
  online: "bg-green-400",
  offline: "bg-red-400",
};

export default function Home() {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    fetch(`${backendUrl}/health`, { signal: ctrl.signal })
      .then((res) => {
        if (!cancelled) setStatus(res.ok ? "online" : "offline");
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">CR Clone</h1>
          <span className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
            <span
              className={`inline-block h-2 w-2 rounded-full ${dotClass[status]}`}
              aria-label={`backend ${status}`}
              title={`Backend ${status} — GET ${backendUrl}/health`}
            />
            {status}
          </span>
        </div>
        <p className="mb-6 text-sm text-slate-400">
          Phase 4 shell — menu. Backend: {backendUrl}
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/lobby?mode=ai"
            data-testid="nav-play"
            className="btn rounded-lg bg-blue-600 px-4 py-2 text-center font-semibold hover:bg-blue-500"
          >
            Play vs AI
          </Link>
          <Link
            href="/lobby?mode=pvp"
            data-testid="nav-lobby"
            className="btn rounded-lg bg-emerald-600 px-4 py-2 text-center font-semibold hover:bg-emerald-500"
          >
            Play 1v1
          </Link>
          <Link
            href="/deck"
            data-testid="nav-deck"
            className="btn rounded-lg bg-slate-800 px-4 py-2 text-center font-semibold hover:bg-slate-700"
          >
            Deck
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Next.js + Tailwind shell on :3000 — lobby wires queue in Phase 4
        </p>
      </div>
    </main>
  );
}
