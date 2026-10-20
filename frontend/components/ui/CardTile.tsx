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
  /** Cost drop visibility (defaults to on whenever cost > 0). */
  showCost?: boolean;
  costTestId?: string;
  /** Extra classes for the inner art box (battle hand sizing). */
  artClassName?: string;
  onClick?: () => void;
  /** Marks cards already in the deck (used by the collection grid). */
  inDeck?: boolean;
  /** Hide the level bar (tower cards show their level next to the tile). */
  showLevel?: boolean;
  /** Selected state (battle hand): sets data-selected + aria-pressed and the gold ring. */
  selected?: boolean;
  dimmed?: boolean;
  /** Locked card (not owned): dimmed with a "Locked" chip. */
  locked?: boolean;
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
  showCost,
  showLevel,
  costTestId,
  artClassName,
  onClick,
  inDeck = false,
  selected = false,
  dimmed = false,
  locked = false,
  testId,
  className = "",
  ariaLabel,
}: CardTileProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-in-deck={inDeck || undefined}
      data-locked={locked || undefined}
      data-selected={selected || undefined}
      aria-pressed={selected || undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? `${name}${cost > 0 ? `, ${cost} elixir` : ""}`}
      className={`relative flex flex-col items-center gap-0.5 rounded-lg transition active:scale-95 ${
        dimmed || locked ? "opacity-45" : ""
      } ${className}`}
    >
      <CardArt
        name={name}
        rarity={rarity as CardRarity}
        cost={cost}
        level={level}
        showLevel={showLevel ?? level > 0}
        showCost={showCost ?? cost > 0}
        costTestId={costTestId}
        className={artClassName}
        size={size}
      />
      {showName && (
        <span className="max-w-full truncate text-[10px] font-bold text-white/90">{name}</span>
      )}
      {locked && (
        <span
          data-testid={`card-tile-locked-${name}`}
          className="absolute inset-x-0 bottom-0 rounded-b-lg bg-slate-900/85 py-0.5 text-center text-[8px] font-black uppercase tracking-wide text-slate-200"
          aria-hidden="true"
        >
          locked
        </span>
      )}
      {inDeck && (
        <span
          data-testid={`card-tile-in-deck-${name}`}
          className="card-in-deck-glow pointer-events-none absolute inset-0 rounded-lg ring-2 ring-emerald-300/90"
          aria-hidden="true"
        >
          <span className="absolute -right-px -top-px rounded-bl-md rounded-tr-lg border border-emerald-200/80 bg-gradient-to-b from-emerald-300 to-emerald-600 px-1 py-0.5 text-[7px] font-black uppercase tracking-wider text-emerald-950 shadow">
            Deck
          </span>
        </span>
      )}
    </button>
  );
}