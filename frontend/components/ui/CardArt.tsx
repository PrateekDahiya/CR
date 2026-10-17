"use client";

import { EMOJI_FALLBACK, RARITY_BG, RARITY_BORDER, RARITY_RUNE } from "../../lib/crTheme";

export interface CardArtProps {
  name: string;
  kind?: "troop" | "spell" | "building";
  level?: number;
  rarity?: "common" | "rare" | "epic" | "legendary" | "champion";
  size?: "sm" | "md" | "lg";
  showLevel?: boolean;
  showCost?: boolean;
  cost?: number;
  progress?: { current: number; max: number };
}

// Tries /cards/<name>.png (gitignored user-supplied folder), falls back to
// rarity-tinted gradient + rune + emoji. O(1) per render.
export default function CardArt({
  name,
  level = 0,
  rarity = "common",
  size = "md",
  showLevel = true,
  showCost = false,
  cost = 0,
  progress,
}: CardArtProps) {
  const dims = size === "lg" ? "h-28 w-24" : size === "sm" ? "h-12 w-10" : "h-20 w-16";
  const emoji = EMOJI_FALLBACK[name] ?? "🃏";
  const rune = RARITY_RUNE[rarity] ?? "💠";
  const bg = RARITY_BG[rarity] ?? RARITY_BG.common;
  const border = RARITY_BORDER[rarity] ?? RARITY_BORDER.common;
  const safeName = name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  return (
    <div
      data-testid={`card-art-${safeName}`}
      className={`relative ${dims} overflow-hidden rounded-lg border-2 ${border} bg-gradient-to-b ${bg} shadow-md`}
    >
      {/* Local art try (user-supplied gitignored). Hidden fallback via onError. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/cards/${safeName}.png`}
        alt={name}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Rarity rune at top-center, falling back when no local art */}
      <div className="absolute inset-0 flex items-center justify-center text-3xl drop-shadow">
        <span className="opacity-95">{rune}</span>
      </div>
      {/* Emoji fallback for troops/buildings */}
      {cost === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-end justify-center text-2xl">
          <span className="drop-shadow">{emoji}</span>
        </div>
      )}
      {/* Purple elixir drop top-left */}
      {showCost && cost > 0 && (
        <div
          data-testid="card-cost"
          className="absolute -left-1 -top-2 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-fuchsia-400 to-purple-700 text-xs font-extrabold text-white shadow"
        >
          {cost}
        </div>
      )}
      {/* Yellow Level bar bottom */}
      {showLevel && level > 0 && (
        <div
          data-testid="card-level"
          className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-amber-300 to-amber-600 py-0.5 text-center text-[10px] font-extrabold text-amber-950 shadow"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}
        >
          Level {level}
        </div>
      )}
      {/* Optional progress (cards owned / required) */}
      {progress && (
        <div className="absolute inset-x-1 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-sky-500"
            style={{ width: `${Math.min(100, Math.round((progress.current / Math.max(1, progress.max)) * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}
