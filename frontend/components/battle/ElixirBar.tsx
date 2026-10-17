"use client";

/**
 * ElixirBar — exact-CR bottom elixir bar (docs/UI_REFERENCE.md §4).
 * Purple gradient #c93cff → #8a2be2, 10 diamond pips, number left,
 * fill animates per tick, shake + glow when full (10).
 * Spectator leak: optional right-side number via `opponentElixir`.
 * Pure presentational — no socket. Server float 0..10 (GAME_DESIGN §7).
 */

interface ElixirBarProps {
  /** Own elixir as server float 0..10 (display floors + partial fill). */
  elixir: number;
  /** Cap, always 10 per GAME_DESIGN §7. */
  max?: number;
  /**
   * Spectator / leaked enemy elixir (wiki: number right of bar).
   * When provided, renders right-side mini drop. Null hides it.
   */
  opponentElixir?: number | null;
}

const FULL_GRADIENT = "linear-gradient(180deg, #c93cff 0%, #a83cf0 45%, #8a2be2 100%)";

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

export default function ElixirBar({ elixir, max = 10, opponentElixir = null }: ElixirBarProps) {
  const safe = clamp(elixir, 0, max);
  const floored = Math.floor(safe);
  const pct = (safe / max) * 100;
  const isFull = floored >= max;

  const pips = Array.from({ length: max }, (_, i) => i);

  return (
    <div className="w-full select-none" data-testid="elixir-bar">
      <style>{`
        @keyframes elixir-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-2px); }
          40% { transform: translateX(2px); }
          60% { transform: translateX(-1px); }
          80% { transform: translateX(1px); }
        }
        .elixir-full-shake {
          animation: elixir-shake 0.5s ease-in-out infinite;
        }
      `}</style>

      <div className="flex items-center gap-1.5 px-1">
        {/* Number left — elixir drop count */}
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white/90 text-sm font-extrabold text-white",
            isFull ? "bg-fuchsia-500 shadow-[0_0_12px_rgba(201,60,255,0.9)]" : "bg-[#7a1fa2]",
          ].join(" ")}
          data-testid="elixir-count"
          aria-label={`Elixir ${floored}`}
        >
          {floored}
        </div>

        {/* Bar track + fill + pips */}
        <div
          className={[
            "relative h-6 flex-1 overflow-hidden rounded-full border border-white/30 bg-[#3d0f57]",
            isFull
              ? "elixir-full-shake shadow-[0_0_14px_rgba(201,60,255,0.95)]"
              : "shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]",
          ].join(" ")}
          role="progressbar"
          aria-valuenow={floored}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          {/* Fill — animates per tick */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear"
            style={{ width: `${pct}%`, background: FULL_GRADIENT }}
            data-testid="elixir-fill"
          />
          {/* Shine line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-full bg-white/15" />

          {/* 10 diamond pips */}
          <div className="absolute inset-0 flex items-center justify-between px-2">
            {pips.map((i) => {
              const filled = i < floored;
              return (
                <span
                  key={i}
                  data-testid={`elixir-pip-${i}`}
                  aria-hidden="true"
                  className={[
                    "inline-block h-2 w-2 rotate-45 border",
                    filled ? "border-white bg-white/95 shadow-sm" : "border-white/50 bg-black/30",
                  ].join(" ")}
                />
              );
            })}
          </div>
        </div>

        {/* Leaked spectator number right (opponent elixir) */}
        {opponentElixir !== null && opponentElixir !== undefined && (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/60 bg-[#2a0a40] text-xs font-extrabold text-fuchsia-200"
            data-testid="elixir-leak"
            title="Opponent elixir (spectator)"
            aria-label={`Opponent elixir ${Math.floor(clamp(opponentElixir, 0, max))}`}
          >
            👁{Math.floor(clamp(opponentElixir, 0, max))}
          </div>
        )}
      </div>
    </div>
  );
}
