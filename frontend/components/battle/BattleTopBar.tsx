"use client";

/**
 * BattleTopBar — exact-CR top chrome (docs/UI_REFERENCE.md §2).
 * h-12: enemy name + trophies left, timer center (3:00 → overtime ⚡),
 * player name + trophies right, emote 💬 button, mute 🔊 toggle.
 * Pure presentational — no socket. Clock comes from serverTimeMs (GAME_DESIGN §9).
 */

export interface BattleTopBarProps {
  enemyName?: string;
  enemyTrophies?: number;
  playerName?: string;
  playerTrophies?: number;
  /** Seconds remaining in regulation/OT (server clock). */
  timeLeftSec?: number;
  /** Sudden-death overtime: timer pulses + ⚡ badge (GAME_DESIGN §8). */
  isOvertime?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  /** Emote button press → parent opens picker / sends emote:send. */
  onEmote?: () => void;
}

export function formatBattleTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function BattleTopBar({
  enemyName = "Enemy",
  enemyTrophies = 0,
  playerName = "You",
  playerTrophies = 0,
  timeLeftSec = 180,
  isOvertime = false,
  isMuted = false,
  onToggleMute,
  onEmote,
}: BattleTopBarProps) {
  return (
    <div
      className="flex h-12 w-full items-center justify-between gap-2 bg-gradient-to-b from-slate-900/90 to-slate-900/60 px-2 text-white"
      data-testid="battle-top-bar"
    >
      {/* Enemy left */}
      <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="enemy-info">
        <span className="text-sm" aria-hidden="true">
          🔴
        </span>
        <span className="truncate text-xs font-extrabold drop-shadow" title={enemyName}>
          {enemyName}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-yellow-300" title="Enemy trophies">
          🏆{enemyTrophies}
        </span>
      </div>

      {/* Timer center */}
      <div
        className={[
          "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-sm font-extrabold",
          isOvertime
            ? "animate-pulse border-yellow-300 bg-red-900/90 text-yellow-200 shadow-[0_0_10px_rgba(255,200,0,0.8)]"
            : "border-white/30 bg-slate-950/80 text-white",
        ].join(" ")}
        data-testid="battle-timer"
        aria-label={isOvertime ? `Overtime ${formatBattleTime(timeLeftSec)}` : `Time ${formatBattleTime(timeLeftSec)}`}
      >
        <span aria-hidden="true">{isOvertime ? "⚡" : "⏱️"}</span>
        <span>{formatBattleTime(timeLeftSec)}</span>
        {isOvertime && (
          <span className="rounded bg-yellow-400 px-1 text-[10px] font-extrabold text-red-900">
            OT
          </span>
        )}
      </div>

      {/* Player right + actions */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <div
          className="flex min-w-0 items-center gap-1"
          data-testid="player-info"
        >
          <span className="shrink-0 text-[11px] font-bold text-yellow-300" title="Your trophies">
            🏆{playerTrophies}
          </span>
          <span className="truncate text-xs font-extrabold drop-shadow" title={playerName}>
            {playerName}
          </span>
          <span className="text-sm" aria-hidden="true">
            🔵
          </span>
        </div>

        <button
          type="button"
          onClick={() => onEmote?.()}
          title="Emotes"
          aria-label="Open emotes"
          data-testid="emote-button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-slate-800/90 text-base transition hover:bg-slate-700 active:scale-95"
        >
          💬
        </button>

        <button
          type="button"
          onClick={() => onToggleMute?.()}
          title={isMuted ? "Unmute" : "Mute"}
          aria-label={isMuted ? "Unmute sound" : "Mute sound"}
          aria-pressed={isMuted}
          data-testid="mute-toggle"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-slate-800/90 text-base transition hover:bg-slate-700 active:scale-95"
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>
    </div>
  );
}
