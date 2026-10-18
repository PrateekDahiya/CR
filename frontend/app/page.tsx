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
  const playableNames = playable.map((c) => c.name);
  // Pick the 8 playable cards in canonical order (knight first).
  const playingDeck = playableNames.slice(0, 8);
  const playableByName = new Map(playable.map((c) => [c.name, c]));

  const showInfo = (name: string) => {
    const c = playableByName.get(name);
    if (!c) return;
    setInfo({
      name: c.name,
      rarity: c.rarity as CardInfoOverlayProps["rarity"],
      cardType: c.cardType as CardInfoOverlayProps["cardType"],
      elixir: c.elixir,
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

        {/* Playing-deck preview (8 cards) - click to view info. */}
        <section
          data-testid="home-playing-deck"
          className="mt-3 rounded-2xl border-2 border-slate-700 bg-slate-900/60 p-2"
        >
          <header className="mb-1 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-200">
            <span>Playing Deck</span>
            <a href="/deck" data-testid="home-edit-deck" className="text-amber-300 underline">
              Edit
            </a>
          </header>
          {playingDeck.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400" data-testid="home-playing-empty">
              Loading deck…
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-1" data-testid="home-playing-grid">
              {playingDeck.map((name) => {
                const c = playableByName.get(name);
                if (!c) return null;
                return (
                  <CardTile
                    key={name}
                    name={c.name}
                    rarity={c.rarity}
                    cost={c.elixir}
                    level={15}
                    size="sm"
                    testId={`home-playing-${name}`}
                    ariaLabel={name}
                    onClick={() => showInfo(name)}
                  />
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
                level={15}
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
