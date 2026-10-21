"use client";

/**
 * frontend/app/replay/page.tsx — the "Watch" replay viewer.
 *
 * The battle log's WATCH button opens this route with the match id. The
 * server keeps a sampled frame stream for every recent match
 * (backend/src/replays.ts) and this page plays it back on the real arena
 * canvas: the towers, the units, the elixir and the crown score are the
 * recorded ones, interpolated between the 2.5 Hz samples.
 *
 * Perf: one fetch per open, a rAF loop that only advances a clock, and one
 * interpolation pass per frame (O(u + t), u <= 40 units, t = 6 towers).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArenaCanvas from "../../components/battle/ArenaCanvas";
import { getReplay, type MatchReplay, type ReplayFrame } from "../../lib/api";
import { preloadCardSprite } from "../../lib/battle/spriteAnim";
import type { Tower, Unit } from "../../../shared/types";

const SPEEDS = [1, 2, 4] as const;

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The two frames that surround `timeMs` plus the blend factor. */
function frameAt(frames: ReplayFrame[], timeMs: number): { a: ReplayFrame; b: ReplayFrame; alpha: number } {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (timeMs <= first.t) return { a: first, b: first, alpha: 0 };
  if (timeMs >= last.t) return { a: last, b: last, alpha: 0 };
  // Binary search the frame index: O(log n) per frame.
  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= timeMs) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const span = b.t - a.t;
  return { a, b, alpha: span > 0 ? (timeMs - a.t) / span : 0 };
}

export default function ReplayPage() {
  const [matchId, setMatchId] = useState("");
  const [replay, setReplay] = useState<MatchReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setMatchId(params.get("matchId") ?? "");
    } catch {
      setMatchId("");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (matchId.length === 0) {
      setError("No match id.");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    getReplay(matchId)
      .then((res) => {
        if (cancelled) return;
        setReplay(res.replay);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("This replay is no longer available.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const frames = useMemo(() => replay?.frames ?? [], [replay]);
  const durationMs = frames.length > 0 ? frames[frames.length - 1].t : 0;

  // Warm the sprite strips of every card that shows up in the replay.
  useEffect(() => {
    if (frames.length === 0) return;
    for (const frame of frames) {
      for (const unit of frame.units) {
        preloadCardSprite(unit.cardId, unit.owner);
      }
    }
  }, [frames]);

  // Playback clock: a rAF loop that only advances the time (no allocations
  // per frame beyond the interpolated arrays below).
  const lastTsRef = useRef(0);
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    let raf = 0;
    const step = (ts: number) => {
      raf = requestAnimationFrame(step);
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last === 0) return;
      setTimeMs((prev) => {
        const next = prev + (ts - last) * speed;
        return next >= durationMs ? durationMs : next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, durationMs, frames.length]);

  const { towers, entities } = useMemo(() => {
    if (frames.length === 0) return { towers: [] as Tower[], entities: [] as Unit[] };
    const { a, b, alpha } = frameAt(frames, timeMs);
    // Tower positions are static -> take them from the current frame only.
    const towers: Tower[] = a.towers.map((t) => {
      const next = b.towers.find((x) => x.id === t.id);
      const hp = next === undefined ? t.hp : t.hp + (next.hp - t.hp) * alpha;
      return {
        id: t.id,
        kind: t.kind,
        owner: t.owner,
        hitPoints: hp,
        maxHitPoints: t.maxHp,
        position: { x: t.x, y: t.y },
        destroyed: t.destroyed,
      };
    });
    // Units: match by id, interpolate the position + hp.
    const nextById = new Map<string, (typeof b.units)[number]>();
    for (const u of b.units) nextById.set(u.id, u);
    const entities: Unit[] = [];
    for (const u of a.units) {
      const next = nextById.get(u.id);
      if (next === undefined) continue; // died in this frame
      entities.push({
        id: u.id,
        cardId: u.cardId,
        owner: u.owner,
        level: u.level,
        hitPoints: u.hp + (next.hp - u.hp) * alpha,
        maxHitPoints: u.maxHp,
        position: {
          x: u.x + (next.x - u.x) * alpha,
          y: u.y + (next.y - u.y) * alpha,
        },
      });
    }
    return { towers, entities };
  }, [frames, timeMs]);

  const crowns = useMemo(() => {
    if (frames.length === 0) return { blue: 0, red: 0 };
    const { a, b, alpha } = frameAt(frames, timeMs);
    return {
      blue: Math.round(a.crownsBlue + (b.crownsBlue - a.crownsBlue) * alpha),
      red: Math.round(a.crownsRed + (b.crownsRed - a.crownsRed) * alpha),
    };
  }, [frames, timeMs]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (p) return false;
      if (timeMs >= durationMs) setTimeMs(0);
      return true;
    });
  }, [timeMs, durationMs]);

  return (
    <main
      data-testid="replay-page"
      className="mx-auto flex h-[100dvh] w-full max-w-[440px] flex-col bg-gradient-to-b from-[#0a1730] to-[#050b1c] text-white"
    >
      <header className="flex items-center justify-between border-b-2 border-amber-700/50 bg-gradient-to-b from-[#102347] to-[#0a1730] px-3 py-2">
        <h1 className="text-sm font-extrabold uppercase tracking-wide text-amber-200">Watch battle</h1>
        <Link
          href="/"
          data-testid="replay-close"
          className="rounded-md border border-slate-500 bg-slate-800/80 px-2 py-1 text-[10px] font-extrabold uppercase text-white"
        >
          Close
        </Link>
      </header>

      {loading ? (
        <p className="p-6 text-center text-xs text-slate-300">Loading replay...</p>
      ) : error !== null ? (
        <div className="p-6 text-center">
          <p data-testid="replay-error" className="text-xs font-bold text-rose-300">
            {error}
          </p>
          <Link
            href="/"
            className="mt-3 inline-block rounded-md border border-amber-800 bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-1.5 text-[10px] font-extrabold uppercase text-white"
          >
            Back
          </Link>
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            <ArenaCanvas
              towers={towers}
              entities={entities}
              mySide="blue"
              className="h-full"
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
              <span className="rounded-md bg-sky-900/80 px-2 py-0.5 text-[11px] font-extrabold text-sky-100">
                👑 {crowns.blue} - {crowns.red}
              </span>
              <span
                data-testid="replay-time"
                className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-extrabold text-amber-200"
              >
                {formatTime(timeMs)} / {formatTime(durationMs)}
              </span>
            </div>
          </div>

          <div className="shrink-0 border-t-2 border-amber-700/50 bg-[#0d1a38] px-3 py-2">
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(durationMs))}
              value={Math.round(timeMs)}
              onChange={(e) => setTimeMs(Number(e.target.value))}
              data-testid="replay-scrubber"
              className="w-full accent-amber-400"
              aria-label="Replay position"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                data-testid="replay-play"
                onClick={togglePlay}
                className="rounded-md border border-emerald-900 bg-gradient-to-b from-emerald-400 to-emerald-600 px-3 py-1 text-[10px] font-extrabold uppercase text-white"
              >
                {playing ? "Pause" : "Play"}
              </button>
              {SPEEDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`replay-speed-${value}`}
                  onClick={() => setSpeed(value)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase ${
                    speed === value
                      ? "border-amber-400 bg-amber-500/30 text-amber-200"
                      : "border-slate-600 bg-slate-800/60 text-slate-300"
                  }`}
                >
                  {value}x
                </button>
              ))}
              {replay?.winner !== undefined ? (
                <span className="ml-auto text-[10px] font-extrabold uppercase text-amber-300">
                  {replay.winner === "draw" ? "Draw" : `${replay.winner} wins`}
                </span>
              ) : null}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
