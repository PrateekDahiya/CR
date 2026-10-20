"use client";

/**
 * frontend/components/ui/BattleLogPanel.tsx — the "Battle Log" sheet.
 *
 * Mirrors the Clash Royale battle log: one row per finished battle with the
 * result banner, the crown score, both decks and the trophy delta. Opened
 * from the top-bar button (see TopBar).
 *
 * Perf: one fetch per open (cached in the parent), rows are capped by the
 * backend (30 newest). Rendering is O(entries * 8) card tiles.
 */

import { useEffect, useState } from "react";
import { getBattleLog, type BattleLogEntry } from "../../lib/api";
import CardArt from "./CardArt";

export interface BattleLogPanelProps {
  playerId: string;
  onClose: () => void;
  /** Opens a fresh practice match (the "Practice" button in the reference). */
  onPractice?: () => void;
}

function ago(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function DeckRow({ cards, tone }: { cards: string[]; tone: "blue" | "red" }) {
  if (cards.length === 0) {
    return (
      <div className="flex h-12 items-center text-[10px] text-slate-500">Unknown deck</div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-1">
      {cards.map((id, index) => (
        <CardArt key={`${id}-${index}`} name={id} level={0} showLevel={false} showCost={false} size="sm" className="!h-10 !w-8" />
      ))}
    </div>
  );
}

export default function BattleLogPanel({ playerId, onClose, onPractice }: BattleLogPanelProps) {
  const [entries, setEntries] = useState<BattleLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (playerId.length === 0) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    getBattleLog(playerId)
      .then((res) => {
        if (!cancelled) setEntries(res.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return (
    <div
      data-testid="battle-log"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b1c]/85 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border-4 border-amber-600/70 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] shadow-2xl">
        <header className="flex items-center justify-between border-b-2 border-amber-600/50 bg-gradient-to-b from-[#24407a] to-[#12224a] px-3 py-2">
          <h2 className="text-lg font-extrabold uppercase tracking-wide text-amber-200">Battle Log</h2>
          <button
            type="button"
            data-testid="battle-log-close"
            onClick={onClose}
            aria-label="Close battle log"
            className="grid h-7 w-7 place-items-center rounded-md border-2 border-red-400 bg-gradient-to-b from-red-500 to-red-700 text-sm font-extrabold text-white"
          >
            x
          </button>
        </header>

        <div className="overflow-y-auto p-2">
          {loading ? (
            <p className="p-4 text-center text-xs text-slate-300">Loading battles...</p>
          ) : entries.length === 0 ? (
            <p data-testid="battle-log-empty" className="p-4 text-center text-xs text-slate-400">
              No battles yet. Win a match to see it here.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => {
                const win = entry.result === "win";
                const draw = entry.result === "draw";
                const banner = win ? "VICTORY" : draw ? "DRAW" : "DEFEAT";
                const bannerTone = win
                  ? "bg-sky-500 text-sky-100"
                  : draw
                    ? "bg-slate-600 text-slate-100"
                    : "bg-rose-700 text-rose-100";
                return (
                  <li
                    key={entry.id}
                    data-testid="battle-log-entry"
                    className="overflow-hidden rounded-xl border-2 border-slate-600 bg-[#13224a]"
                  >
                    <div className="flex items-center gap-2 bg-black/25 px-2 py-1">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${bannerTone}`}
                      >
                        {banner}
                      </span>
                      <span className="text-[11px] font-extrabold text-sky-200">
                        {entry.crowns} - {entry.opponentCrowns}
                      </span>
                      <span className="ml-auto text-[9px] text-slate-400">{ago(entry.createdAtMs)}</span>
                    </div>
                    <div className="flex items-start gap-2 px-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-extrabold text-sky-300">You</p>
                        <DeckRow cards={entry.deck} tone="blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-extrabold text-rose-300">{entry.opponentName}</p>
                        <DeckRow cards={entry.opponentDeck} tone="red" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-slate-700 px-2 py-1.5">
                      <span
                        className={`text-[11px] font-extrabold ${
                          entry.trophyDelta >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {entry.trophyDelta >= 0 ? "+" : ""}
                        {entry.trophyDelta}
                      </span>
                      <span className="text-[9px] font-bold uppercase text-slate-400">{entry.mode}</span>
                      {onPractice ? (
                        <button
                          type="button"
                          data-testid="battle-log-practice"
                          onClick={onPractice}
                          className="ml-auto rounded-md border border-sky-800 bg-gradient-to-b from-sky-400 to-sky-600 px-3 py-1 text-[10px] font-extrabold uppercase text-white"
                        >
                          Practice
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
