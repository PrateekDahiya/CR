"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backendUrl, getProfile } from "../../lib/api";
import { getSocketClient } from "../../lib/socket";
import { toBattleDeck } from "../../lib/battleDeck";

export interface MatchmakingLoaderProps {
  onCancel?: () => void;
  onMatched?: (matchId: string, side: "blue" | "red") => void;
  /** "ai" = play the bot immediately. "pvp" = queue, then fall back to the bot. */
  mode?: "pvp" | "ai";
  difficulty?: "easy" | "medium" | "hard";
  /** Selected game-mode id (server registry). Carried into queue/practice. */
  gameModeId?: string;
}

/** How long PvP matchmaking waits for a human before the AI takes the slot. */
export const PVP_SEARCH_MS = 5000;

/**
 * The battle screen (and the server) need a stable playerId. Reuse the saved
 * one, otherwise mint and persist one so deploys are never rejected.
 */
function ensurePlayerId(): string {
  if (typeof window === "undefined") return "guest";
  try {
    const existing = window.localStorage.getItem("cr-player-id");
    if (existing && existing.length > 0) return existing;
    const id = `guest-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem("cr-player-id", id);
    return id;
  } catch {
    return "guest";
  }
}

/**
 * Matchmaking loader. Starts a REAL server-side match:
 *  - mode "ai"  -> `match:practice` immediately (blue = you, red = bot).
 *  - mode "pvp" -> `queue:join` for 4s; if nobody pairs, it falls back to the
 *    same practice match so a battle is always playable.
 * The server owns the room, so state:update / card:play / match:end all work —
 * there are no fake match ids any more.
 */
export default function MatchmakingLoader({
  onCancel,
  onMatched,
  mode = "ai",
  difficulty = "medium",
  gameModeId = "standard",
}: MatchmakingLoaderProps) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState<"connecting" | "searching" | "matched">("connecting");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let didFallback = false;

    async function start() {
      try {
        const pid = ensurePlayerId();
        try {
          await getProfile(pid, backendUrl());
        } catch {
          // best-effort profile warm-up
        }
        if (cancelled) return;

        // Always battle-legal deck (collection may hold display-only cards).
        let deck: string[] = [];
        try {
          const raw = typeof window !== "undefined" ? localStorage.getItem("cr-clone-deck-v1") : null;
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed)) deck = parsed.filter((c): c is string => typeof c === "string");
        } catch {
          // ignore
        }
        deck = toBattleDeck(deck);

        const socket = getSocketClient(backendUrl());
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;
        setPhase("searching");

        socket.onMatched((matchId, side, opponentId) => {
          if (cancelled) return;
          if (fallbackTimer) clearTimeout(fallbackTimer);
          setPhase("matched");
          onMatched?.(matchId, side);
          router.push(
            `/battle?matchId=${encodeURIComponent(matchId)}&side=${side}&opponent=${encodeURIComponent(
              opponentId ?? "",
            )}&mode=${matchId.startsWith("ai-") ? "ai" : "pvp"}&modeId=${encodeURIComponent(gameModeId)}`,
          );
        });
        socket.onGameError((code, message) => {
          if (cancelled) return;
          setError(`${code}: ${message}`);
        });

        socket.selectDeck(pid, deck);

        const startPractice = () => {
          if (cancelled || didFallback) return;
          didFallback = true;
          socket.joinAiMatch(pid, deck, difficulty, { modeId: gameModeId });
        };

        if (mode === "ai") {
          startPractice();
        } else {
          socket.joinQueue(pid, deck, { modeId: gameModeId });
          // Real CR: give a human 5 seconds to find an opponent before the bot
          // takes the slot, so an incoming 1v1 still pairs up.
          fallbackTimer = setTimeout(startPractice, PVP_SEARCH_MS);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "matchmaking failed");
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      try {
        getSocketClient(backendUrl()).leaveQueue();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    try {
      getSocketClient(backendUrl()).leaveQueue();
    } catch {
      // ignore
    }
    onCancel?.();
    router.push("/decks");
  };

  return (
    <div
      data-testid="matchmaking-loader"
      data-phase={phase}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0a1730] text-white"
    >
      <div className="matchmaking-spinner mb-6" aria-hidden="true" />
      <h2 data-testid="matchmaking-title" className="text-2xl font-extrabold tracking-wide">
        {phase === "matched"
          ? "Match Found!"
          : mode === "ai"
            ? "Starting AI Match…"
            : "Searching for Opponent…"}
      </h2>
      <p data-testid="matchmaking-elapsed" className="mt-2 text-sm tabular-nums text-slate-300">
        {phase === "matched" ? "Connecting…" : `${seconds}s elapsed`}
      </p>
      {error ? (
        <p
          data-testid="matchmaking-error"
          className="mt-3 max-w-xs rounded bg-red-700 px-3 py-2 text-xs text-white"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        data-testid="matchmaking-cancel"
        onClick={cancel}
        className="mt-8 rounded-full border-2 border-white/40 bg-white/10 px-6 py-2 text-sm font-extrabold uppercase tracking-wider text-white/90 transition-colors hover:bg-white/20"
      >
        Cancel
      </button>
    </div>
  );
}