"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backendUrl, getProfile } from "../../lib/api";
import { getSocketClient, type SocketClient } from "../../lib/socket";

export interface MatchmakingLoaderProps {
  onCancel?: () => void;
  onMatched?: (matchId: string, side: "blue" | "red") => void;
  mode?: "pvp" | "ai";
}

// Auto-matchmaking loader. Enqueues via socket.queue:join + AI fallback when
// no opponent matches within ~5s. Subscribes to queue:matched / match:found /
// match:start. Cancel calls queue:leave. Falls back to /battle if socket
// unavailable so the user is never stuck.
export default function MatchmakingLoader({
  onCancel,
  onMatched,
  mode = "pvp",
}: MatchmakingLoaderProps) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState<"connecting" | "searching" | "matched">("connecting");
  const [matched, setMatched] = useState<{ matchId: string; side: "blue" | "red" } | null>(null);
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
    let socket: SocketClient | null = null;
    let cleanupFns: Array<() => void> = [];
    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    async function startMatchmaking() {
      try {
        const pid = (typeof window !== "undefined" && (localStorage.getItem("cr-player-id") || "guest")) || "guest";
        // Ensure a profile exists so /matches/report has a user to record.
        try {
          await getProfile(pid, backendUrl());
        } catch {
          // best-effort
        }
        socket = getSocketClient(backendUrl());
        // Defer one tick to avoid setState-during-render warnings on fast networks.
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;
        setPhase("searching");

        const offMatched = socket.onMatched((matchId, side, opponentId) => {
          if (cancelled) return;
          setMatched({ matchId, side });
          setPhase("matched");
          if (onMatched) onMatched(matchId, side);
          // Auto-redirect to /battle with the match id (Phase 13 polish: show banner).
          setTimeout(() => {
            router.push(`/battle?matchId=${encodeURIComponent(matchId)}&side=${side}&opponent=${encodeURIComponent(opponentId || "matched")}`);
          }, 600);
        });
        const offError = socket.onGameError((code, message) => {
          if (cancelled) return;
          setError(`${code}: ${message}`);
        });
        cleanupFns.push(offMatched, offError);

        // Enqueue. mode=ai: fall back to local bot if no opponent within 4s.
        socket.joinQueue(pid);
        // Load deck from storage so queue payload is valid.
        let deck: string[] = [];
        try {
          const raw = typeof window !== "undefined" ? localStorage.getItem("cr-clone-deck-v1") : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) deck = parsed.filter((c) => typeof c === "string").slice(0, 8);
          }
        } catch {
          // ignore
        }
        if (deck.length === 0) {
          // minimal valid 8-card deck so the backend accepts the join
          deck = ["knight", "archers", "giant", "skeletons", "musketeer", "baby-dragon", "fireball", "arrows"];
        }
        socket.selectDeck(pid, deck);

        if (mode === "ai") {
          aiTimer = setTimeout(() => {
            if (cancelled) return;
            // No opponent found, simulate a local AI match.
            const fakeMatchId = `ai-${Date.now()}`;
            setMatched({ matchId: fakeMatchId, side: "blue" });
            setPhase("matched");
            setTimeout(() => router.push(`/battle?matchId=${fakeMatchId}&mode=ai`), 600);
          }, 1500);
        } else {
          // In single-instance dev there's no real opponent; auto-pair with a
          // dummy matchId after 4s so the loader doesn't spin forever.
          aiTimer = setTimeout(() => {
            if (cancelled) return;
            const fakeMatchId = `local-${Date.now()}`;
            setMatched({ matchId: fakeMatchId, side: "blue" });
            setPhase("matched");
            setTimeout(() => router.push(`/battle?matchId=${fakeMatchId}&mode=local`), 600);
          }, 4000);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "matchmaking failed");
      }
    }

    void startMatchmaking();
    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
      try {
        if (socket) socket.leaveQueue();
      } catch {
        // ignore
      }
      if (aiTimer) clearTimeout(aiTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    try {
      const client = getSocketClient(backendUrl());
      client.leaveQueue();
    } catch {
      // ignore
    }
    if (onCancel) onCancel();
    router.push("/decks");
  };

  return (
    <div
      data-testid="matchmaking-loader"
      data-phase={phase}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-[#0a1730] to-[#102347] text-white"
    >
      <div className="matchmaking-spinner mb-6" aria-hidden="true" />
      <h2 data-testid="matchmaking-title" className="text-2xl font-extrabold tracking-wide">
        {phase === "matched" ? "Match Found!" : mode === "ai" ? "Starting AI Match…" : "Searching for Opponent…"}
      </h2>
      <p data-testid="matchmaking-elapsed" className="mt-2 text-sm tabular-nums text-slate-300">
        {phase === "matched" ? "Connecting…" : `${seconds}s elapsed`}
      </p>
      {error ? (
        <p data-testid="matchmaking-error" className="mt-3 max-w-xs rounded bg-red-700 px-3 py-2 text-xs text-white">
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
