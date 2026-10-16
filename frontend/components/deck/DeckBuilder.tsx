"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CARD_LIST,
  STARTER_DECK_BALANCED,
  averageCost,
  countSpells,
  getCard,
  isSpell,
  validateDeck,
  DECK_SIZE,
  MAX_SPELLS,
} from "../../lib/cards";
import CardTile from "./CardTile";

const STORAGE_KEY = "cr-clone-deck-v1";

function loadInitialDeck(): string[] {
  if (typeof window === "undefined") return [...STARTER_DECK_BALANCED];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...STARTER_DECK_BALANCED];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string")) {
      const valid = (parsed as string[]).filter((id) => getCard(id) !== undefined);
      return [...new Set(valid)].slice(0, DECK_SIZE);
    }
  } catch {
    // ignore corrupt storage
  }
  return [...STARTER_DECK_BALANCED];
}

export default function DeckBuilder() {
  const [deck, setDeck] = useState<string[]>(loadInitialDeck);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
    } catch {
      // storage full / private mode — non-fatal
    }
  }, [deck]);

  const spells = useMemo(() => countSpells(deck), [deck]);
  const avg = useMemo(() => averageCost(deck), [deck]);
  const validation = useMemo(() => validateDeck(deck), [deck]);
  const valid = validation.valid;

  function toggle(id: string) {
    setNotice(null);
    setDeck((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= DECK_SIZE) {
        setNotice(`Deck is full (${DECK_SIZE} slots). Remove a card first.`);
        return prev;
      }
      if (isSpell(id) && countSpells(prev) >= MAX_SPELLS) {
        setNotice(`Max ${MAX_SPELLS} spells per deck.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function clear() {
    setNotice(null);
    setDeck([]);
  }

  function loadStarter() {
    setNotice(null);
    setDeck([...STARTER_DECK_BALANCED]);
  }

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-100">
          Deck Builder <span className="text-sm font-normal text-slate-400">({deck.length}/{DECK_SIZE})</span>
        </h2>
        <span
          role="status"
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            valid
              ? "border-emerald-700 bg-emerald-950 text-emerald-300"
              : "border-red-800 bg-red-950 text-red-300"
          }`}
        >
          {valid ? "Valid deck" : `Invalid: ${validation.error ?? "incomplete"}`}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {Array.from({ length: DECK_SIZE }).map((_, i) => {
          const id = deck[i];
          const card = id ? getCard(id) : undefined;
          return (
            <div
              key={i}
              data-testid="card-slot"
              data-slot-index={i}
              className={`flex h-16 items-center justify-center rounded-xl border text-xs ${
                card
                  ? "border-blue-600 bg-blue-950 text-slate-100"
                  : "border-dashed border-slate-700 bg-slate-950 text-slate-500"
              }`}
            >
              {card ? (
                <button
                  type="button"
                  onClick={() => toggle(card.id)}
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1"
                  title={`Remove ${card.name}`}
                >
                  <span className="max-w-full truncate font-semibold">{card.name}</span>
                  <span className="font-mono text-sky-300">{card.cost}</span>
                </button>
              ) : (
                <span>Slot {i + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span>
          Avg cost: <span className="font-mono font-semibold text-slate-100">{deck.length ? avg.toFixed(2) : "—"}</span>
        </span>
        <span>
          Spells: <span className="font-mono font-semibold text-slate-100">{spells}/{MAX_SPELLS}</span>
        </span>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={loadStarter}
            className="rounded-lg bg-slate-700 px-3 py-1.5 font-semibold text-slate-100 hover:bg-slate-600"
          >
            Starter
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-300 hover:bg-slate-700"
          >
            Clear
          </button>
        </span>
      </div>

      {notice ? <p className="mb-3 rounded-lg bg-amber-950 px-3 py-2 text-xs text-amber-200">{notice}</p> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {CARD_LIST.map((card) => {
          const selected = deck.includes(card.id);
          const full = deck.length >= DECK_SIZE && !selected;
          const spellLocked = card.type === "spell" && !selected && spells >= MAX_SPELLS;
          return (
            <CardTile
              key={card.id}
              card={card}
              selected={selected}
              disabled={full || spellLocked}
              onToggle={toggle}
            />
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Rule: exactly {DECK_SIZE} distinct cards, max {MAX_SPELLS} spells (Fireball, Arrows, Zap). Saved to
        localStorage ({STORAGE_KEY}).
      </p>
    </div>
  );
}
