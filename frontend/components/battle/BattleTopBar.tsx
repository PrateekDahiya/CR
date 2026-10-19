"use client";

/**
 * BattleTopBar — CR clan-wars chrome (docs/gameUI/08-clan-wars-battle.png):
 *  - top-left: the OPPONENT's avatar, name, club and trophy count
 *  - top-right: "Time left" panel with the big clock
 * Pure presentational — no socket. O(1) render.
 */

export interface BattleTopBarProps {
  /** Opponent display name (resolved from their profile, never a placeholder). */
  enemyName?: string;
  enemyClub?: string;
  enemyTrophies?: number;
  /** Seconds remaining in regulation/OT (server clock). */
  timeLeftSec?: number;
  /** Sudden-death overtime: timer pulses + ⚡ badge (GAME_DESIGN §8). */
  isOvertime?: boolean;
}

export function formatBattleTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[3px] border-rose-500 bg-gradient-to-b from-rose-500 to-red-800 text-2xl font-black text-white shadow-md"
    >
      {initial}
    </span>
  );
}

export default function BattleTopBar({
  enemyName = "Opponent",
  enemyClub,
  enemyTrophies = 0,
  timeLeftSec = 180,
  isOvertime = false,
}: BattleTopBarProps) {
  return (
    <div className="pointer-events-none flex w-full items-start justify-between gap-2 p-2">
      {/* Opponent: avatar + name + club + trophies */}
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-lg bg-black/45 px-2 py-1 backdrop-blur-[1px]"
        data-testid="enemy-info"
        title={enemyName}
      >
        <Avatar name={enemyName} />
        <div className="min-w-0">
          <div
            data-testid="enemy-name"
            className="max-w-[150px] truncate text-base font-extrabold leading-tight text-rose-300 drop-shadow-[1px_1px_0_rgba(0,0,0,0.9)]"
          >
            {enemyName}
          </div>
          <div className="truncate text-[10px] font-bold leading-tight text-white/80">
            {enemyClub ?? "Guest"}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-extrabold leading-tight text-amber-300">
            <span aria-hidden="true">🏆</span>
            <span data-testid="enemy-trophies">{enemyTrophies}</span>
          </div>
        </div>
      </div>

      {/* Timer panel (right) */}
      <div
        className={[
          "pointer-events-auto rounded-lg border-2 px-2.5 py-1 text-right shadow-lg",
          isOvertime
            ? "animate-pulse border-amber-300 bg-red-900/95"
            : "border-amber-600/70 bg-black/70",
        ].join(" ")}
        data-testid="battle-timer"
        aria-label={isOvertime ? `Overtime ${formatBattleTime(timeLeftSec)}` : `Time ${formatBattleTime(timeLeftSec)}`}
      >
        <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-amber-200">Time left:</div>
        <div className="font-mono text-2xl font-black leading-none text-white">
          {formatBattleTime(timeLeftSec)}
          {isOvertime && <span className="ml-1 text-xs text-amber-300">⚡</span>}
        </div>
      </div>
    </div>
  );
}