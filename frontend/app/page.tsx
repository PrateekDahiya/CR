"use client";

import { useEffect, useState } from "react";
import {
  PageShell,
  CardTile,
  CRButton,
  MatchmakingLoader,
  CardInfoOverlay,
  type CardInfoOverlayProps,
} from "../components/ui";
import { backendUrl, getCatalog, getProfile, type CatalogEntry, type ProfileResponse } from "../lib/api";
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
  const [info, setInfo] = useState<{ name: string; rarity: CardInfoOverlayProps["rarity"]; cardType: CardInfoOverlayProps["cardType"]; elixir: number } | null>(null);
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

  const playable = catalog.filter((c) => c.playable);
  const playableByName = new Map(playable.map((c) => [c.name, c]));
  const factsByName = new Map(catalog.map((c) => [c.name, c]));
  // Playing Deck = the real saved deck (My Deck), 4 per row like /decks.
  const playingDeck = deck.filter(Boolean);
  const levelOf = (name: string): number => ownedProfile?.cards?.[name] ?? 1;
  const avgElixir = playingDeck.length
    ? (playingDeck.reduce((a, n) => a + (factsByName.get(n)?.elixir ?? 0), 0) / 8).toFixed(1)
    : "—";

  const showInfo = (name: string) => {
    const f = factsByName.get(name);
    if (!f) return;
    setInfo({
      name: f.name,
      rarity: f.rarity as CardInfoOverlayProps["rarity"],
      cardType: f.cardType as CardInfoOverlayProps["cardType"],
      elixir: f.elixir,
    });
  };

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

        {/* BATTLE button -> matchmaking loader. */}
        <button
          type="button"
          data-testid="home-battle"
onClick={() => setMatchmaking("pvp")}
          className="mt-3 block w-full rounded-2xl border-b-4 border-amber-800 bg-gradient-to-b from-amber-300 to-amber-600 px-4 py-3 text-center text-2xl font-extrabold uppercase tracking-wider text-amber-950 shadow-md active:translate-y-0.5"
        >
          ⚔️ Battle
        </button>

        {/* Playing-deck preview (the real My Deck) - click a card for info. */}
        <section
          data-testid="home-playing-deck"
          className="mt-3 rounded-xl border-2 border-amber-600/50 bg-[#12224a]/80 p-2 shadow-[0_2px_0_rgba(0,0,0,0.4)]"
        >
          <header className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
              Playing Deck
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-fuchsia-300">🟣 {avgElixir} / 10</span>
              <a
                href="/decks"
                data-testid="home-edit-deck"
                className="rounded-md border border-sky-800 bg-gradient-to-b from-sky-400 to-sky-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white"
              >
                Edit
              </a>
            </span>
          </header>
          {playingDeck.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400" data-testid="home-playing-empty">
              Loading deck…
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2" data-testid="home-playing-grid">
              {Array.from({ length: 8 }).map((_, i) => {
                const name = playingDeck[i];
                const f = name ? factsByName.get(name) : null;
                return f ? (
                  <CardTile
                    key={`${f.name}-${i}`}
                    name={f.name}
                    rarity={f.rarity}
                    cost={f.elixir}
                    level={levelOf(f.name)}
                    testId={`home-playing-${f.name}`}
                    ariaLabel={f.name}
                    onClick={() => showInfo(f.name)}
                  />
                ) : (
                  <div
                    key={`empty-${i}`}
                    className="grid h-20 w-16 place-items-center rounded-lg border-2 border-dashed border-slate-500/70 bg-slate-800/40 text-sm text-slate-400"
                  >
                    +
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
              <ModeTile title="Trophy Road" subtitle="Ranked Ladder" tone="blue" />
              <ModeTile title="Casual 1v1" subtitle="Free play" tone="gray" />
              <ModeTile title="Path of Legends" subtitle="Ranked ladder" tone="purple" />
              <ModeTile title="Trophy Rush" subtitle="Coming soon" tone="gray" />
            </div>
          ) : null}
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
          onCancel={() => setMatchmaking(null)}
        />
      ) : null}

      {info
        ? (() => {
            const inDeck = playingDeck.includes(info.name);
            return (
              <CardInfoOverlay
                name={info.name}
                rarity={info.rarity}
                cardType={info.cardType}
                elixir={info.elixir}
                level={levelOf(info.name)}
                onClose={() => setInfo(null)}
                onUse={() => setInfo(null)}
                inDeck={inDeck}
              />
            );
          })()
        : null}
    </PageShell>
  );
}

function ModeTile({ title, subtitle, tone }: { title: string; subtitle: string; tone: "blue" | "purple" | "gray" }) {
  const toneClass = tone === "purple" ? "from-purple-600 to-purple-800" : tone === "gray" ? "from-slate-500 to-slate-700" : "from-sky-500 to-blue-700";
  return (
    <button
      type="button"
      data-testid={`home-mode-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className={`rounded-xl border-b-4 border-black/30 bg-gradient-to-b ${toneClass} p-3 text-left font-extrabold text-white shadow-md active:translate-y-0.5`}
    >
      <div className="text-sm">{title}</div>
      <div className="text-[11px] opacity-80">{subtitle}</div>
    </button>
  );
}
