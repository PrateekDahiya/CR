"use client";

/**
 * Hand — exact-CR 4-card hand + Next preview (docs/UI_REFERENCE.md §4).
 * Rarity borders: common grey / rare orange / epic purple / legendary rainbow.
 * Cost badge (purple drop), emoji art, name, greyed + red cost when
 * unaffordable, gold glow when selected. Tap-to-select via onSelect(handIndex).
 * Pure presentational — no socket.
 */

import type { CardInfo, CardRarity } from "../../lib/cards";

export interface HandProps {
  /** Exactly 4 cards in current hand (hand slots 0..3). */
  hand: CardInfo[];
  /** Current (floored on server) elixir float 0..10 for affordability. */
  elixir: number;
  /** Selected hand slot, or null when nothing selected. */
  selectedIndex?: number | null;
  /** Next card queued to cycle in (GAME_DESIGN §7.1: 4-card hand + next queue). */
  nextCard?: CardInfo | null;
  /** Tap card → parent selects slot, then arena deploy. */
  onSelect?: (handIndex: number) => void;
}

const RARITY_BORDER: Record<CardRarity, string> = {
  common: "border-gray-400",
  rare: "border-orange-500",
  epic: "border-purple-500",
  // Rainbow: layered gradient wrapper emulated with multi-shadow ring
  legendary:
    "border-transparent ring-2 ring-offset-1 ring-offset-slate-900 ring-red-400",
};

const RARITY_BG: Record<CardRarity, string> = {
  common: "from-slate-700 to-slate-800",
  rare: "from-orange-950 to-slate-800",
  epic: "from-purple-950 to-slate-800",
  legendary: "from-yellow-900 via-pink-900 to-purple-900",
};

/** Emoji placeholder art (original, no Supercell assets — MEMORY#18). */
export const CARD_EMOJI: Record<string, string> = {
  knight: "⚔️",
  archers: "🏹",
  giant: "🗿",
  skeletons: "💀",
  musketeer: "🔫",
  "baby-dragon": "🐲",
  "mini-pekka": "🔪",
  "rock-golem": "🪨",
  fireball: "🔥",
  arrows: "➶",
  zap: "⚡",
  cannon: "🏯",
};

export function cardEmoji(cardId: string): string {
  return CARD_EMOJI[cardId] ?? "🃏";
}

export default function Hand({
  hand,
  elixir,
  selectedIndex = null,
  nextCard = null,
  onSelect,
}: HandProps) {
  const current = Math.floor(elixir);

  return (
    <div className="w-full select-none" data-testid="card-hand">
      <div className="flex items-stretch justify-center gap-1.5 px-1">
        {/* Next card mini preview */}
        <div
          className="flex w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-white/20 bg-slate-900/80 py-1"
          data-testid="card-next"
          title={nextCard ? `Next: ${nextCard.name}` : "Next: —"}
        >
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Next:
          </span>
          {nextCard ? (
            <>
              <span className="text-lg leading-none" aria-hidden="true">
                {cardEmoji(nextCard.id)}
              </span>
              <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-purple-700 text-[10px] font-bold text-white">
                {nextCard.cost}
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-600">—</span>
          )}
        </div>

        {/* 4 hand slots */}
        {hand.slice(0, 4).map((card, i) => {
          const affordable = card.cost <= current;
          const selected = selectedIndex === i;
          return (
            <button
              key={`${card.id}-${i}`}
              type="button"
              data-testid={`card-hand-${i}`}
              aria-label={`${card.name} (${card.cost} elixir)${selected ? ", selected" : ""}${
                affordable ? "" : ", not enough elixir"
              }`}
              aria-pressed={selected}
              onClick={() => onSelect?.(i)}
              className={[
                "relative flex min-w-0 flex-1 flex-col items-center rounded-xl border-[3px] bg-gradient-to-b px-1 pb-1 pt-2 transition-all duration-150",
                RARITY_BORDER[card.rarity],
                RARITY_BG[card.rarity],
                affordable
                  ? "cursor-pointer hover:-translate-y-0.5"
                  : "cursor-not-allowed opacity-50 grayscale",
                selected
                  ? "scale-105 shadow-[0_0_12px_rgba(255,215,0,0.9)] ring-2 ring-yellow-300"
                  : "shadow-md",
              ].join(" ")}
            >
              {/* Cost badge top-left */}
              <span
                className={[
                  "absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white text-xs font-extrabold text-white",
                  affordable ? "bg-purple-600" : "bg-red-600",
                ].join(" ")}
                data-testid={`card-hand-cost-${i}`}
              >
                {card.cost}
              </span>

              {/* Emoji art */}
              <span className="text-2xl leading-none" aria-hidden="true">
                {cardEmoji(card.id)}
              </span>
              {/* Name */}
              <span className="mt-1 w-full truncate text-center text-[10px] font-bold leading-tight text-white">
                {card.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
