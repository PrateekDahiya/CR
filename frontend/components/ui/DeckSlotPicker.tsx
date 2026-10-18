"use client";

import CardTile from "./CardTile";

export interface DeckSlotFact {
  name: string;
  rarity: string;
  elixir: number;
}

export interface DeckSlotPickerProps {
  /** Card being placed. */
  card: DeckSlotFact;
  /** Current deck contents, DECK_SIZE entries ("" = empty slot). */
  deck: string[];
  facts: Record<string, DeckSlotFact>;
  onPick: (slot: number) => void;
  onCancel: () => void;
}

// "Choose a card to replace" popup. Tapping a slot swaps the incoming card into
// it; the outgoing card leaves the deck (it is not swapped anywhere else).
// Shared by /decks and /collection so both screens pick slots identically.
export default function DeckSlotPicker({ card, deck, facts, onPick, onCancel }: DeckSlotPickerProps) {
  const label = card.name
    .split("-")
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

  return (
    <div
      data-testid="replace-picker"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#050b1c]/85 p-3 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        data-testid="replace-picker-panel"
        className="w-full max-w-sm overflow-hidden rounded-2xl border-4 border-amber-500/70 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-2 border-amber-500/30 bg-gradient-to-r from-[#24407a] to-[#12224a] px-3 py-1.5 text-center">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.15em] text-amber-300">
            Replace a card
          </h3>
        </div>

        <div className="flex items-center justify-center gap-3 px-3 pt-3">
          <span className="pointer-events-none relative">
            <CardTile
              name={card.name}
              rarity={card.rarity}
              cost={card.elixir}
              level={0}
              testId="replace-picker-card"
              ariaLabel={`Adding ${label}`}
              className="pointer-events-none scale-90"
            />
          </span>
          <span className="text-xl font-black text-amber-300">→</span>
          <span className="text-[11px] font-extrabold uppercase leading-tight tracking-wide text-slate-100">
            {label}
            <span className="block text-[10px] font-bold normal-case text-slate-300">
              tap the slot it replaces
            </span>
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 px-3 py-3">
          {deck.map((held, i) => {
            const f = held ? facts[held] : null;
            const isCurrent = held === card.name;
            return f ? (
              <div key={`pick-${i}`} className="flex flex-col items-center gap-0.5">
                <CardTile
                  name={f.name}
                  rarity={f.rarity}
                  cost={f.elixir}
                  level={15}
                  testId={`replace-slot-${i}`}
                  ariaLabel={`Replace slot ${i + 1}: ${f.name}`}
                  className={
                    isCurrent
                      ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#12224a]"
                      : "ring-2 ring-rose-500/70 hover:ring-rose-400"
                  }
                  onClick={() => onPick(i)}
                />
                <span
                  className={`text-[9px] font-extrabold uppercase tracking-wide ${
                    isCurrent ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {isCurrent ? "stays" : "replace"}
                </span>
              </div>
            ) : (
              <div key={`pick-${i}`} className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  data-testid={`replace-slot-${i}`}
                  onClick={() => onPick(i)}
                  className="grid h-20 w-16 place-items-center rounded-lg border-2 border-dashed border-emerald-400/80 bg-emerald-900/25 text-lg font-black text-emerald-300 active:scale-95"
                  aria-label={`Fill empty slot ${i + 1}`}
                >
                  +
                </button>
                <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-300">
                  empty
                </span>
              </div>
            );
          })}
        </div>

        <div className="border-t-2 border-slate-600/50 bg-[#0d1a38]/70 px-3 py-2 text-center">
          <button
            type="button"
            data-testid="replace-cancel"
            onClick={onCancel}
            className="rounded-xl border-b-4 border-slate-700 bg-gradient-to-b from-slate-500 to-slate-700 px-6 py-1.5 text-sm font-extrabold uppercase tracking-wide text-white active:translate-y-0.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}