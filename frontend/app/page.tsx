"use client";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">CR Clone</h1>
          <span className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
            <span
              className="inline-block h-2 w-2 rounded-full bg-yellow-400"
              aria-label="stub status"
              title="Phase 1 stub - backend not wired"
            />
            stub
          </span>
        </div>
        <p className="mb-6 text-sm text-slate-400">
          Phase 1 scaffolding — menu shell. Backend: {backendUrl}
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => alert("Play (stub) - matchmaking lands in Phase 3/4")}
          >
            Play
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-800 px-4 py-2 font-semibold hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => alert("Lobby (stub) - lobby flow lands in Phase 4")}
          >
            Lobby
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-800 px-4 py-2 font-semibold hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => alert("Deck (stub) - deck builder lands in Phase 4")}
          >
            Deck
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Next.js + Tailwind + Socket.io-client shell on :3000
        </p>
      </div>
    </main>
  );
}
