"use client";

/**
 * ElixirBar — CR elixir strip (docs/gameUI/08-clan-wars-battle.png):
 * a pink droplet with the current amount on the left, a magenta fill bar with
 * 10 segment dividers, and "Max: 10" underneath. Grows/shakes at full.
 * Pure presentational — no socket. Server float 0..10 (GAME_DESIGN §7).
 */

interface ElixirBarProps {
  /** Own elixir as server float 0..10 (display floors + partial fill). */
  elixir: number;
  /** Cap, always 10 per GAME_DESIGN §7. */
  max?: number;
  /** Leaked enemy elixir for spectators; null hides it. */
  opponentElixir?: number | null;
}

const FULL_GRADIENT = "linear-gradient(180deg, #f472d0 0%, #e64bd0 45%, #c026d3 100%)";

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
    <div className="w-full select-none px-1" data-testid="elixir-bar">
      <style>{`
        @keyframes elixir-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-2px); }
          40% { transform: translateX(2px); }
          60% { transform: translateX(-1px); }
          80% { transform: translateX(1px); }
        }
        .elixir-full-shake { animation: elixir-shake 0.5s ease-in-out infinite; }
      `}</style>

      <div className="flex items-center gap-1">
        {/* Elixir droplet with the amount */}
        <div
          className={[
            "grid h-7 w-7 shrink-0 place-items-center rounded-[50%] border-2 border-fuchsia-300 font-black text-white shadow-md",
            isFull ? "bg-gradient-to-b from-fuchsia-400 to-purple-700 elixir-full-shake" : "bg-gradient-to-b from-pink-400 to-pink-700",
          ].join(" ")}
          data-testid="elixir-count"
          aria-label={`Elixir ${floored}`}
        >
          <span className="text-xs tabular-nums">{floored}</span>
        </div>

        {/* Bar with 10 segments */}
        <div
          className={[
            "relative h-3 flex-1 overflow-hidden rounded-full border border-fuchsia-300/70 bg-[#3b0a4a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]",
            isFull ? "elixir-full-shake" : "",
          ].join(" ")}
          role="progressbar"
          aria-valuenow={floored}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%`, background: FULL_GRADIENT }}
            data-testid="elixir-fill"
          />
          {/* Segment dividers (10 elixir slots) */}
          <div className="absolute inset-0 flex items-stretch">
            {pips.map((i) => (
              <span
                key={i}
                data-testid={`elixir-pip-${i}`}
                aria-hidden="true"
                className={[
                  "flex-1 border-r border-black/25 last:border-r-0",
                  i < floored ? "bg-white/10" : "bg-black/20",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        {/* Max label */}
        <div className="shrink-0 text-[9px] font-extrabold leading-tight text-white/90 drop-shadow-[1px_1px_0_rgba(0,0,0,0.7)]">
          Max: {max}
        </div>

        {opponentElixir !== null && opponentElixir !== undefined && (
          <div
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-white/60 bg-[#2a0a40] text-[8px] font-extrabold text-fuchsia-200"
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