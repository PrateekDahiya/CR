"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCard, validateDeck } from "../../lib/cards";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Balanced starter from docs/GAME_DESIGN.md §4 (avg 3.375). Real deck
// editing lives in /deck (deck-builder agent); this is a read-only preview.
const FALLBACK_DECK: string[] = [
  "knight",
  "archers",
  "musketeer",
  "baby-dragon",
  "giant",
  "skeletons",
  "fireball",
  "cannon",
];

type QueueState = "idle" | "queued" | "matched";

interface MatchedInfo {
  matchId: string;
  opponentId: string;
  side: string;
}

const DECK_STORAGE_KEY = "cr-clone-deck-v1";

function loadPreviewDeck(): string[] {
  try {
    const raw = window.localStorage.getItem(DECK_STORAGE_KEY);
    if (!raw) return FALLBACK_DECK;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string")) {
      // Drop unknown ids like DeckBuilder does; fall back to starter if empty.
      const valid = (parsed as string[]).filter(
        (id) => getCard(id) !== undefined,
      );
      if (valid.length === 0) return FALLBACK_DECK;
      return valid;
    }
    return FALLBACK_DECK;
  } catch {
    return FALLBACK_DECK;
  }
}

export default function LobbyPage() {
  const [playerId, setPlayerId] = useState("");
  const [deck, setDeck] = useState<string[]>(FALLBACK_DECK);
  const [queueState, setQueueState] = useState<QueueState>("idle");
  const [matched, setMatched] = useState<MatchedInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDeck(loadPreviewDeck());
    try {
      const saved = window.localStorage.getItem("cr-player-id");
      if (saved) setPlayerId(saved);
    } catch {
      // localStorage unavailable — stay uncontrolled-default
    }
  }, []);

  const deckValid = validateDeck(deck).valid;
  const canJoin = playerId.trim().length > 0 && deckValid && queueState === "idle";

  function handleJoinQueue() {
    const id = playerId.trim();
    if (id.length === 0) {
      setNotice("Enter a playerId first (opaque until Phase 7 auth).");
      return;
    }
    if (!deckValid) {
      setNotice(`Deck must be exactly 8 cards (preview has ${deck.length}). Edit in Deck.`);
      return;
    }
    try {
      window.localStorage.setItem("cr-player-id", id);
    } catch {
      // non-fatal
    }
    setNotice(null);
    setMatched(null);
    setQueueState("queued");
    // TODO(phase-4 net-client): wire to lib/socket.ts —
    // emit queue:join { playerId: id, deck }, await ack { ok, position },
    // on queue:matched { matchId, opponentId, side } -> setMatched + queued->matched.
  }

  function handleLeave() {
    setQueueState("idle");
    setMatched(null);
    setNotice("Left queue (stub — net-client wires queue:leave).");
    // TODO(phase-4 net-client): emit queue:leave { playerId } here.
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Lobby</h1>
          <Link href="/" className="text-sm text-slate-400 underline hover:text-slate-200">
            ← Menu
          </Link>
        </div>
        <p className="mb-6 text-sm text-slate-400">Backend: {backendUrl}</p>

        <label
          htmlFor="playerId"
          className="mb-1 block text-sm font-medium text-slate-300"
        >
          Player ID
        </label>
        <input
          id="playerId"
          data-testid="player-id-input"
          type="text"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="e.g. player-1"
          autoComplete="off"
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500"
        />

        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            Deck preview ({deck.length}/8)
          </h2>
          <Link href="/deck" className="text-sm text-blue-400 underline hover:text-blue-300">
            Edit deck
          </Link>
        </div>
        <ul className="mb-4 grid grid-cols-2 gap-2">
          {deck.map((cardId) => (
            <li
              key={cardId}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
            >
              {cardId}
            </li>
          ))}
        </ul>
        {!deckValid && (
          <p className="mb-4 text-xs text-amber-400">
            Preview deck is not 8 cards — fix it in Deck builder before queueing.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleJoinQueue}
            disabled={!canJoin}
            className="btn flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {queueState === "idle" ? "Join Queue" : "In Queue…"}
          </button>
          <button
            type="button"
            onClick={handleLeave}
            disabled={queueState === "idle"}
            className="btn flex-1 rounded-lg bg-slate-800 px-4 py-2 font-semibold hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Leave
          </button>
        </div>

        {queueState === "queued" && !matched && (
          <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
            Queued as <span className="font-mono">{playerId.trim()}</span> — waiting
            for <span className="font-mono">queue:matched</span>…
          </p>
        )}

        {matched && (
          <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm">
            <p className="font-semibold text-emerald-300">Matched!</p>
            <dl className="mt-1 space-y-0.5 text-slate-200">
              <div className="flex gap-2">
                <dt className="text-slate-400">matchId:</dt>
                <dd className="font-mono">{matched.matchId}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-400">opponent:</dt>
                <dd className="font-mono">{matched.opponentId}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-400">side:</dt>
                <dd className="font-mono">{matched.side}</dd>
              </div>
            </dl>
          </div>
        )}

        {notice && (
          <p className="mt-4 text-sm text-slate-400" role="status">
            {notice}
          </p>
        )}
      </div>
    </main>
  );
}
