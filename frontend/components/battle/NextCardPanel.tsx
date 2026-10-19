"use client";

/**
 * NextCardPanel — "Next:" preview from the reference battle screen
 * (docs/gameUI/08-clan-wars-battle.png). The preview is intentionally SMALLER
 * than the four playable cards in the hand. Pure presentational. O(1).
 */

import type { CardInfo } from "../../lib/cards";
import CardTile from "../ui/CardTile";

export default function NextCardPanel({ card }: { card: CardInfo | null }) {
  return (
    <div
      className="flex w-[50px] shrink-0 flex-col items-center gap-0.5 rounded-md bg-[#1f4b9c]/70 px-1 py-1"
      data-testid="card-next"
      title={card ? `Next: ${card.name}` : "Next: —"}
    >
      <span className="text-[8px] font-extrabold uppercase leading-none tracking-wide text-white/90">
        Next:
      </span>
      {card === null ? (
        <span className="grid h-8 w-6 place-items-center rounded border border-dashed border-white/30 text-[9px] text-white/50">
          —
        </span>
      ) : (
        <span className="pointer-events-none relative block w-6">
          <CardTile
            name={card.name.toLowerCase().replace(/\s+/g, "-")}
            rarity={card.rarity}
            cost={card.cost}
            level={0}
            showCost={false}
            artClassName="!h-[34px] !w-[26px]"
            className="w-full rounded border border-amber-300/70"
            ariaLabel={`Next: ${card.name}`}
          />
          <span className="pointer-events-none absolute -bottom-1 left-1/2 grid h-3.5 w-3.5 -translate-x-1/2 place-items-center rounded-full border border-pink-200 bg-gradient-to-b from-pink-500 to-fuchsia-700 text-[8px] font-black text-white">
            {card.cost}
          </span>
        </span>
      )}
    </div>
  );
}