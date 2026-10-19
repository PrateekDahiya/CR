"use client";

/**
 * Hand — CR 4-card hand (docs/gameUI/08-clan-wars-battle.png): gold-framed
 * cards in a row, magenta elixir badge centred under each, dimmed when you
 * cannot afford it, raised + golden when selected. Uses the shared CardTile so
 * the battle shows the same art as My Deck / Collection. Tap-to-select.
 * Pure presentational — no socket. O(4) render.
 */

import type { CardInfo } from "../../lib/cards";
import CardTile from "../ui/CardTile";

export interface HandProps {
  /** Exactly 4 cards in current hand (hand slots 0..3). */
  hand: CardInfo[];
  /** Current (floored on server) elixir float 0..10 for affordability. */
  elixir: number;
  /** Selected hand slot, or null when nothing selected. */
  selectedIndex?: number | null;
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

const RARITY_FRAME: Record<string, string> = {
  common: "border-slate-300",
  rare: "border-orange-400",
  epic: "border-purple-400",
  legendary: "border-yellow-300",
  champion: "border-amber-300",
};

export default function Hand({ hand, elixir, selectedIndex = null, onSelect }: HandProps) {
  const current = Math.floor(elixir);

  return (
    <div className="flex w-full items-end justify-center gap-1 px-0.5" data-testid="card-hand">
      {hand.slice(0, 4).map((card, i) => {
        const affordable = card.cost <= current;
        const selected = selectedIndex === i;
        return (
          <span key={`${card.id}-${i}`} className="relative flex-1">
            <CardTile
              name={card.name.toLowerCase().replace(/\s+/g, "-")}
              rarity={card.rarity}
              cost={card.cost}
              level={0}
              showCost={false}
              artClassName="!h-[64px] !w-[46px]"
              testId={`card-hand-${i}`}
              ariaLabel={`${card.name} (${card.cost} elixir)${selected ? ", selected" : ""}${
                affordable ? "" : ", not enough elixir"
              }`}
              selected={selected}
              dimmed={!affordable}
              className={[
                "w-full rounded-lg border-2 p-0.5",
                RARITY_FRAME[card.rarity] ?? "border-slate-300",
                selected
                  ? "-translate-y-2 ring-2 ring-yellow-300 shadow-[0_6px_14px_rgba(0,0,0,0.55)]"
                  : affordable
                    ? "border-amber-300/80 shadow-[0_3px_8px_rgba(0,0,0,0.45)]"
                    : "grayscale",
              ].join(" ")}
              onClick={() => onSelect?.(i)}
            />
            {/* Elixir cost badge centred under the card (CR style) */}
            <span
              className={[
                "pointer-events-none absolute -bottom-0.5 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full border text-[10px] font-black text-white shadow",
                affordable ? "border-pink-200 bg-gradient-to-b from-pink-500 to-fuchsia-700" : "border-rose-200 bg-gradient-to-b from-rose-500 to-red-700",
              ].join(" ")}
              data-testid={`card-hand-cost-${i}`}
              aria-label={`${card.cost} elixir`}
            >
              {card.cost}
            </span>
            {selected && (
              <span
                data-testid={`card-hand-selected-${i}`}
                className="pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-yellow-300 px-1 text-[8px] font-black uppercase text-yellow-950 shadow"
              >
                selected
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}