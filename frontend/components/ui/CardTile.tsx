"use client";

import CardArt from "./CardArt";

export type CardRarity = "common" | "rare" | "epic" | "legendary" | "champion";

export interface CardTileProps {
  name: string;
  rarity?: string;
  cost?: number;
  level?: number;
  size?: "sm" | "md" | "lg";
  /** Extra label rendered under the art (deck slots only, matches CR "My Deck"). */
  showName?: boolean;
  onClick?: () => void;
  /** Marks cards already in the deck (used by the collection grid). */
  inDeck?: boolean;
  dimmed?: boolean;
  testId?: string;
  className?: string;
  ariaLabel?: string;
}

// Single card tile used for every card in the app (My Deck strip, decks > Collection
// tab, /collection grid, home playing deck). Renders CardArt with the same chrome
// (rarity frame + elixir drop + level bar) so no screen duplicates card markup.
// O(1) per tile.
export default function CardTile({
  name,
  rarity = "common",
  cost = 0,
  level = 15,
  size = "md",
  showName = false,
  onClick,
  inDeck = false,
  dimmed = false,
  testId,
  className = "",
  ariaLabel,
}: CardTileProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-in-deck={inDeck || undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? `${name}${cost > 0 ? `, ${cost} elixir` : ""}`}
      className={`relative flex flex-col items-center gap-0.5 rounded-lg transition active:scale-95 ${
        dimmed ? "opacity-45" : ""
      } ${className}`}
    >
      <CardArt
        name={name}
        rarity={rarity as CardRarity}
        cost={cost}
        level={level}
        showLevel={level > 0}
        showCost={cost > 0}
        size={size}
      />
      {showName && (
        <span className="max-w-full truncate text-[10px] font-bold text-white/90">{name}</span>
      )}
      {inDeck && (
        <span
          data-testid={`card-tile-in-deck-${name}`}
          className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-amber-300 bg-emerald-500 text-[10px] font-black text-white shadow"
          aria-hidden="true"
        >
          ✓
        </span>
      )}
    </button>
  );
}