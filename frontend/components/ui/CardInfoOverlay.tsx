"use client";

import { RARITY_BG, RARITY_BORDER } from "../../lib/crTheme";
import CardArt from "./CardArt";

export interface CardInfoOverlayProps {
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "champion";
  cardType: "troop" | "spell" | "building";
  elixir: number;
  level?: number;
  onClose: () => void;
  onUse?: () => void;
  onUpgrade?: () => void;
  inDeck?: boolean;
}

// Card detail overlay (per docs/gameUI Screenshot_20261017_123447). Static art
// in the left card tile + animated preview panel (CSS keyframe loop) + Rarity/
// Type chips + Star Level / Upgrade / Use buttons. O(1) per render, isolated
// state via useEffect for the close-on-Escape.
import { useEffect } from "react";

export default function CardInfoOverlay({
  name,
  rarity,
  cardType,
  elixir,
  level = 0,
  onClose,
  onUse,
  onUpgrade,
  inDeck = false,
}: CardInfoOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bg = RARITY_BG[rarity] ?? RARITY_BG.common;
  const border = RARITY_BORDER[rarity] ?? RARITY_BORDER.common;
  const displayName = name
    .split("-")
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace("Mini Pekka", "Mini P.E.K.K.A")
    .replace("The Log", "The Log");

  return (
    <div
      data-testid="card-info-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onClick={onClose}
    >
      <div
        data-testid="card-info-panel"
        className={`relative w-full max-w-md overflow-hidden rounded-2xl border-4 ${border} bg-gradient-to-b from-slate-800 to-slate-900 text-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          data-testid="card-info-close"
          onClick={onClose}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-red-500 text-2xl font-bold text-white shadow-md active:translate-y-0.5"
          aria-label="Close"
        >
          ×
        </button>
        <header className="grid grid-cols-[auto_1fr] gap-3 p-3">
          <div className={`h-20 w-16 overflow-hidden rounded-lg border-2 ${border} bg-gradient-to-b ${bg}`}>
            <CardArt name={name} rarity={rarity} cost={elixir} level={level} showLevel showCost />
          </div>
          <div className="min-w-0">
            <h2 data-testid="card-info-name" className="truncate text-2xl font-extrabold">
              {displayName}
            </h2>
            <p data-testid="card-info-level" className="text-sm font-bold text-sky-300">
              Level {level || 13}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <span
                data-testid="card-info-rarity"
                className={`rounded-md border-2 ${border} bg-gradient-to-b ${bg} px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide`}
              >
                {rarity}
              </span>
              <span
                data-testid="card-info-type"
                className="rounded-md border-2 border-slate-500 bg-gradient-to-b from-slate-600 to-slate-800 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide"
              >
                {cardType}
              </span>
              <span
                data-testid="card-info-elixir"
                className="rounded-full bg-gradient-to-b from-fuchsia-400 to-purple-700 px-2 py-0.5 text-xs font-extrabold text-white shadow"
              >
                {elixir} elixir
              </span>
            </div>
          </div>
        </header>
        <div
          data-testid="card-info-preview"
          className="card-info-preview relative mx-3 mb-3 h-44 overflow-hidden rounded-xl border-2 border-slate-700 bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-800"
        >
          <div className="card-info-river absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 bg-blue-500/60" />
          <div className="card-info-tower absolute left-3 top-3 h-12 w-10 rounded-sm border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-amber-700" />
          <div className="card-info-tower absolute right-3 top-3 h-12 w-10 rounded-sm border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-amber-700" />
          <div className="card-info-knight absolute bottom-3 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full border-2 border-amber-500 bg-gradient-to-b from-amber-300 to-amber-600 text-2xl">
            <span className="absolute inset-0 grid place-items-center">⚔️</span>
          </div>
          <div className="card-info-knight card-info-knight--clone absolute bottom-3 left-1/2 h-10 w-10 -translate-x-1/2 translate-x-3 rounded-full border-2 border-amber-500 bg-gradient-to-b from-amber-300 to-amber-600 text-2xl">
            <span className="absolute inset-0 grid place-items-center">⚔️</span>
          </div>
        </div>
        <footer className="grid grid-cols-3 gap-2 px-3 pb-3">
          <button
            type="button"
            data-testid="card-info-star-level"
            className="rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-700 px-2 py-2 text-center text-white shadow-md active:translate-y-0.5"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wide">Star Level 1</div>
            <div className="text-sm font-extrabold">5000 🪙</div>
          </button>
          <button
            type="button"
            data-testid="card-info-upgrade"
            onClick={onUpgrade}
            className="rounded-xl border-b-4 border-purple-800 bg-gradient-to-b from-purple-400 to-purple-700 px-2 py-2 text-center text-white shadow-md active:translate-y-0.5"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wide">Upgrade</div>
            <div className="text-sm font-extrabold">60000 🪙</div>
          </button>
          <button
            type="button"
            data-testid="card-info-use"
            onClick={onUse}
            className="rounded-xl border-b-4 border-amber-800 bg-gradient-to-b from-amber-300 to-amber-600 px-2 py-2 text-center text-amber-950 shadow-md active:translate-y-0.5"
          >
            <div className="text-lg font-extrabold uppercase tracking-wide">{inDeck ? "In Deck" : "Use"}</div>
          </button>
        </footer>
      </div>
    </div>
  );
}
