"use client";

/**
 * Hand — CR 4-card hand + Next preview, rendered with the shared CardTile so the
 * battle screen uses the exact same card art/frame as My Deck and Collection.
 * Purple elixir drop per slot (red when unaffordable), dimmed when you cannot
 * afford it, gold glow when selected. Tap-to-select via onSelect(handIndex).
 * Pure presentational — no socket.
 */

import type { CardInfo, CardRarity } from "../../lib/cards";
import CardTile from "../ui/CardTile";

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

const RARITY_RING: Record<CardRarity, string> = {
  common: "",
  rare: "ring-1 ring-orange-400/60",
  epic: "ring-1 ring-purple-400/60",
  legendary: "ring-2 ring-yellow-300/70",
  champion: "ring-2 ring-amber-300/80",
};

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
      <div className="flex items-end gap-1.5 px-2">
        {/* Next card mini preview */}
        <div
          className="flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-lg border border-slate-600/60 bg-[#12224a]/90 py-1"
          data-testid="card-next"
          title={nextCard ? `Next: ${nextCard.name}` : "Next: —"}
        >
          <span className="text-[9px] font-extrabold uppercase tracking-wide text-amber-300">
            Next
          </span>
          {nextCard ? (
            <span className="pointer-events-none scale-[0.72]">
              <CardTile
                name={nextCard.name.toLowerCase().replace(/\s+/g, "-")}
                rarity={nextCard.rarity}
                cost={nextCard.cost}
                level={0}
                className="pointer-events-none"
                ariaLabel={`Next: ${nextCard.name}`}
              />
            </span>
          ) : (
            <span className="text-sm text-slate-600">—</span>
          )}
        </div>

        {/* 4 hand slots */}
        {hand.slice(0, 4).map((card, i) => {
          const affordable = card.cost <= current;
          const selected = selectedIndex === i;
          return (
            <span key={`${card.id}-${i}`} className="relative min-w-0 flex-1">
              <CardTile
                name={card.name.toLowerCase().replace(/\s+/g, "-")}
                rarity={card.rarity}
                cost={card.cost}
                level={0}
                costTestId={`card-hand-cost-${i}`}
                testId={`card-hand-${i}`}
                ariaLabel={`${card.name} (${card.cost} elixir)${selected ? ", selected" : ""}${
                  affordable ? "" : ", not enough elixir"
                }`}
                dimmed={!affordable}
                selected={selected}
                className={[
                  "w-full rounded-xl",
                  RARITY_RING[card.rarity],
                  selected ? "scale-105 ring-2 ring-yellow-300 shadow-[0_0_14px_rgba(255,215,0,0.9)]" : "",
                ]
                  .join(" ")
                  .trim()}
                onClick={() => onSelect?.(i)}
              />
              {selected && (
                <span
                  data-testid={`card-hand-selected-${i}`}
                  className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-yellow-300 px-1.5 text-[9px] font-black uppercase text-yellow-950 shadow"
                >
                  selected
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}