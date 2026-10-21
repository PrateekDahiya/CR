"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell, CRButton, MatchmakingLoader, CardArt } from "../components/ui";
import { cardRoles, providesWinCondition } from "../lib/cardRoles";
import { backendUrl, getCatalog, getGameModes, getProfile, type CatalogEntry, type ProfileResponse } from "../lib/api";
import type { GameModeConfig } from "../../shared/types";
import { useDeckState } from "../lib/useDeck";
import { usePlayer } from "../lib/playerContext";

// Home: matches docs/gameUI/03-home-battle-tab.png + 04-game-modes-sheet.png
// (knight hero, big gold BATTLE, Game Modes sheet, Pass Royale widget).
// No "CR Clone" placeholder text — purely CR-style chrome.
export default function Home() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [matchmaking, setMatchmaking] = useState<null | "pvp" | "ai">(null);
  const [modesOpen, setModesOpen] = useState(false);
  /** Authoritative mode registry (backend /game-modes) + the picked mode. */
  const [modes, setModes] = useState<GameModeConfig[]>([]);
  const [selectedModeId, setSelectedModeId] = useState("standard");
  const { deck } = useDeckState();
  const { profile: ownedProfile } = usePlayer();

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    fetch(`${backendUrl()}/health`, { signal: ctrl.signal })
      .then((r) => !cancelled && setStatus(r.ok ? "online" : "offline"))
      .catch(() => !cancelled && setStatus("offline"))
      .finally(() => clearTimeout(t));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pid = (typeof window !== "undefined" && (localStorage.getItem("cr-player-id") || "guest")) || "guest";
        const [p, c] = await Promise.all([
          getProfile(pid, backendUrl()).catch(() => null),
          getCatalog(backendUrl()).catch(() => ({ catalog: [] as CatalogEntry[], source: "local" as const, count: 0, playable: 0 })),
        ]);
        if (!cancelled) {
          if (p) setProfile(p);
          setCatalog(c.catalog);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mode registry comes from the backend (single source of truth): adding a
  // mode there is enough for the picker to show it.
  useEffect(() => {
    let cancelled = false;
    getGameModes(backendUrl())
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r?.modes) ? r.modes : [];
        setModes(list);
        setSelectedModeId((current) =>
          list.some((m) => m.id === current) ? current : (list[0]?.id ?? "standard"),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const playable = catalog.filter((c) => c.playable);
  const playingDeck = deck.filter(Boolean);
  const deckName = ownedProfile?.activeDeck?.name ?? "My Deck";
  const pretty = (id: string) =>
    id
      .split("-")
      .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  // Primary win condition, then a tank fallback, then the first deck card.
  const winCondition =
    playingDeck.find(providesWinCondition) ??
    playingDeck.find((id) => cardRoles(id).includes("tank")) ??
    playingDeck[0];
  const hasWinCondition = playingDeck.some(providesWinCondition);
  const winLabel = winCondition ? pretty(winCondition) : "No win condition";


  return (
    <PageShell
      active="battle"
      topBarCurrencies={{ cards: playable.length, coins: 1625, gems: 5 }}
    >
      <div className="px-3 py-2" data-testid="home-root">
        <header className="flex items-center justify-between text-xs font-bold text-white/80">
          <button
            type="button"
            data-testid="home-profile-toggle"
            onClick={() => {
              const next = document.getElementById("home-profile-chip");
              if (next) next.classList.toggle("hidden");
            }}
            className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1"
          >
            <span>👤</span>
            <span>{profile?.playerId ?? "guest"}</span>
            <span className="text-amber-300">🏆 {profile?.trophies ?? 10605}</span>
          </button>
          <span
            data-testid="home-status"
            className={`flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 ${status === "online" ? "text-emerald-300" : status === "offline" ? "text-rose-300" : "text-amber-300"}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${status === "online" ? "bg-emerald-400" : status === "offline" ? "bg-rose-400" : "bg-amber-400"}`} />
            {status}
          </span>
        </header>

        {/* Knight hero banner (decorative). */}
        <section
          data-testid="home-hero"
          className="mt-2 overflow-hidden rounded-2xl border-2 border-amber-700/50 bg-gradient-to-b from-sky-500 via-sky-600 to-blue-800 p-3 shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-amber-300 bg-gradient-to-b from-amber-300 to-amber-600 text-3xl shadow-inner">
              ⚔️
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold">Battle Pass</h1>
              <p className="text-xs text-white/80">Season 1 — Goblin Stadium</p>
            </div>
            <span className="ml-auto rounded-md bg-amber-500/30 px-2 py-0.5 text-xs font-extrabold text-amber-200">+10%</span>
          </div>
        </section>

        {/* Battle preview (background scene with a knight placeholder). */}
        <section
          data-testid="home-battle-preview"
          className="mt-2 h-32 overflow-hidden rounded-2xl border-2 border-slate-700 bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-800"
        >
          <div className="absolute -mt-1 ml-2 h-12 w-10 rounded-sm border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-amber-700" />
          <div className="flex h-full items-end justify-center">
            <span className="text-5xl drop-shadow">⚔️</span>
          </div>
        </section>

        {/* Deck shortcut + BATTLE. The small card stack links to /decks. */}
        <div className="mt-3 flex items-stretch gap-2">
          <Link
            href="/decks"
            data-testid="home-deck-stack"
            aria-label={`Edit deck ${deckName}`}
            className="relative w-28 shrink-0 outline-none"
          >
            <span className="absolute inset-x-2 inset-y-1 rotate-[-7deg] rounded-lg border border-slate-500/60 bg-slate-700/70" aria-hidden="true" />
            <span className="absolute inset-x-1 inset-y-0.5 rotate-[-3deg] rounded-lg border border-slate-400/60 bg-slate-600/80" aria-hidden="true" />
            <span className="relative flex h-full min-h-[72px] flex-col justify-between rounded-lg border-2 border-amber-500/70 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] p-1.5 text-left shadow-[0_2px_0_rgba(0,0,0,0.5)]">
              <span className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Deck</span>
              <span data-testid="home-deck-name" className="truncate text-[11px] font-extrabold leading-tight text-white">
                {deckName}
              </span>
              <span className="mt-1 flex items-center gap-1 border-t border-slate-600/70 pt-1">
                {winCondition && (
                  <CardArt
                    name={winCondition}
                    level={0}
                    showLevel={false}
                    showCost={false}
                    size="sm"
                    className="!h-8 !w-7 shrink-0"
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-[7px] font-bold uppercase tracking-wide text-slate-400">
                    {hasWinCondition ? "Win condition" : "Fallback"}
                  </span>
                  <span
                    data-testid="home-win-condition"
                    className={`block truncate text-[10px] font-extrabold ${hasWinCondition ? "text-amber-200" : "text-slate-300"}`}
                  >
                    {winLabel}
                  </span>
                </span>
              </span>
            </span>
          </Link>
          <button
            type="button"
            data-testid="home-battle"
            onClick={() => setMatchmaking("pvp")}
            className="flex-1 rounded-2xl border-b-4 border-amber-800 bg-gradient-to-b from-amber-300 to-amber-600 px-4 py-3 text-center text-2xl font-extrabold uppercase tracking-wider text-amber-950 shadow-md active:translate-y-0.5"
          >
            Battle
          </button>
        </div>

        {/* Game modes + Pass Royale widget. */}
        <section
          data-testid="home-modes"
          className="mt-3 rounded-2xl border-2 border-slate-700 bg-slate-900/60 p-3"
        >
          <header className="mb-2 flex items-center justify-between text-sm font-extrabold uppercase tracking-wider text-slate-200">
            <span>Game Modes</span>
            <button
              type="button"
              data-testid="home-modes-toggle"
              onClick={() => setModesOpen((v) => !v)}
              className="text-amber-300 underline"
            >
              {modesOpen ? "Hide" : "Show"}
            </button>
          </header>
          {modesOpen ? (
            <div className="grid grid-cols-2 gap-2" data-testid="home-modes-grid">
              {modes.map((mode) => (
                <ModeTile
                  key={mode.id}
                  id={mode.id}
                  title={mode.label}
                  subtitle={mode.description}
                  tone={modeTone(mode.id)}
                  selected={mode.id === selectedModeId}
                  onSelect={() => setSelectedModeId(mode.id)}
                />
              ))}
              {modes.length === 0 ? (
                <p className="col-span-2 text-[11px] text-slate-400" data-testid="home-modes-empty">
                  Modes unavailable (backend offline).
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-slate-300" data-testid="home-selected-mode">
            Selected: {modes.find((m) => m.id === selectedModeId)?.label ?? "Standard"}
          </p>
        </section>

        {/* Quick play vs AI shortcut (kept from Phase 11). */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <CRButton variant="blue" size="md" testId="home-vs-ai" onClick={() => setMatchmaking("ai")} icon="🤖">
            Play vs AI
          </CRButton>
          <CRButton variant="purple" size="md" testId="home-1v1" onClick={() => setMatchmaking("pvp")} icon="👥">
            Quick 1v1
          </CRButton>
        </div>

        <p className="mt-2 text-center text-[11px] text-slate-400">
          Catalog: {catalog.length} cards ({playable.length} playable)
        </p>
      </div>

      {matchmaking ? (
        <MatchmakingLoader
          mode={matchmaking}
          gameModeId={selectedModeId}
          onCancel={() => setMatchmaking(null)}
        />
      ) : null}
    </PageShell>
  );
}

/** Visual tone for a registry mode id (UI-only, no gameplay meaning). */
function modeTone(id: string): "blue" | "purple" | "gray" {
  if (id.includes("elixir")) return "purple";
  if (id.includes("takedown")) return "gray";
  return "blue";
}

function ModeTile({
  id,
  title,
  subtitle,
  tone,
  selected,
  onSelect,
}: {
  id: string;
  title: string;
  subtitle: string;
  tone: "blue" | "purple" | "gray";
  selected: boolean;
  onSelect: () => void;
}) {
  const toneClass = tone === "purple" ? "from-purple-600 to-purple-800" : tone === "gray" ? "from-slate-500 to-slate-700" : "from-sky-500 to-blue-700";
  return (
    <button
      type="button"
      data-testid={`home-mode-${id}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-xl border-b-4 p-3 text-left font-extrabold text-white shadow-md active:translate-y-0.5 ${
        selected
          ? "border-amber-400 bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950 ring-2 ring-amber-300"
          : `border-black/30 bg-gradient-to-b ${toneClass}`
      }`}
    >
      <div className="text-sm">{title}</div>
      <div className="text-[11px] opacity-80">{subtitle}</div>
      {selected ? (
        <div className="mt-1 text-[10px] font-extrabold uppercase tracking-wide">Selected</div>
      ) : null}
    </button>
  );
}
