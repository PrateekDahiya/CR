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
  /** Overrides the elixir-drop test id (battle hand uses card-hand-cost-N). */
  costTestId?: string;
  /** Extra classes on the art box (e.g. battle hand sizing). */
  className?: string;
  /**
   * Explicit art url (the battle log uses the per-team art:
   * /cardart/<card>-front.png / -back.png). Falls back to /cards/<slug>.png.
   */
  artUrl?: string;
}

// Renders CR card art (real PNG from /cards/<slug>.png gitignored folder) with
// rarity-tinted frame + level + cost chrome. Falls back to rune+emoji when no
// image is present. O(1) per render (one img + DOM nodes; onError toggles class).
export default function CardArt({
  name,
  level = 0,
  rarity = "common",
  size = "md",
  showLevel = true,
  showCost = false,
  cost = 0,
  progress,
  costTestId,
  className: extraClass,
  artUrl,
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
      data-rarity={rarity}
      className={`card-art relative ${dims} overflow-hidden rounded-lg border-2 ${border} bg-gradient-to-b ${bg} shadow-md ${extraClass ?? ""}`}
    >
      {/* Real art (gitignored /public/cards/<slug>.png; falls back via onError). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artUrl ?? `/cards/${safeName}.png`}
        alt={name}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
        className="card-art-img absolute inset-0 h-full w-full object-cover"
      />
      {/* Rarity rune + emoji fallback behind the image (hidden by `.card-art.has-art img`). */}
      <div className="card-art-fallback absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl drop-shadow">{rune}</span>
        {cost === 0 && <span className="mt-1 text-2xl drop-shadow">{emoji}</span>}
      </div>
      {/* Purple elixir drop top-left */}
      {showCost && cost > 0 && (
        <div
          data-testid={costTestId ?? "card-cost"}
          className="absolute -left-1 -top-2 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-fuchsia-400 to-purple-700 text-xs font-extrabold text-white shadow"
        >
          {cost}
        </div>
      )}
      {/* Yellow Level bar bottom */}
      {showLevel && level > 0 && (
        <div
          data-testid="card-level"
          className="absolute inset-x-0 bottom-0 whitespace-nowrap bg-gradient-to-b from-amber-300 to-amber-600 py-px text-center text-[9px] font-extrabold leading-none text-amber-950 shadow"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}
        >
          Lv {level}
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
