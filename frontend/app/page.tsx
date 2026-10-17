"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell, CRButton, type BottomNavKey } from "../components/ui";
import { backendUrl, getCatalog, getProfile, type ContentCard, type CatalogEntry, type ProfileResponse } from "../lib/api";

type Status = "checking" | "online" | "offline";
const dotClass: Record<Status, string> = { checking: "bg-yellow-400", online: "bg-green-400", offline: "bg-red-400" };

// Home: CR Battle tab default. Header status, deck tributes, Battle button, social leaderboard sidebar.
export default function Home() {
  const [status, setStatus] = useState<Status>("checking");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogSource, setCatalogSource] = useState<string>("local");
  const [playingDeck, setPlayingDeck] = useState<ContentCard[]>([]);
  const [active, setActive] = useState<BottomNavKey>("battle");

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
        const [p, c] = await Promise.all([getProfile(pid, backendUrl()).catch(() => null), getCatalog(backendUrl())]);
        if (!cancelled) {
          if (p) setProfile(p);
          setCatalog(c.catalog);
          setCatalogSource(c.source);
          // Use first 8 playable cards as a "playing deck" preview.
          const playable = c.catalog.filter((x: CatalogEntry) => x.playable).slice(0, 8).map((x: CatalogEntry) => ({
            name: x.name, displayName: x.name, cardType: x.cardType, elixir: x.elixir,
            hp: 0, dps: 0, speedLabel: "", rangeTiles: 0, targets: "", unitCount: 1, rarity: x.rarity,
          } as ContentCard));
          setPlayingDeck(playable);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell
      active={active}
      topBarCurrencies={{ cards: catalog.filter((c) => c.playable).length, coins: 1625, gems: 5 }}
    >
      <div className="space-y-3 px-3 py-3">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">CR Clone</h1>
          <span className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-xs text-slate-200">
            <span className={`inline-block h-2 w-2 rounded-full ${dotClass[status]}`} aria-label={`backend ${status}`} />
            {status}
          </span>
        </header>

        <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Playing Deck</h2>
            <Link href="/deck" data-testid="home-deck-link" className="text-xs font-bold text-amber-300 underline">
              Edit
            </Link>
          </div>
          {playingDeck.length === 0 ? (
            <p className="text-xs text-slate-400" data-testid="home-deck-empty">
              Loading…
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2" data-testid="home-deck-grid">
              {playingDeck.map((c, i) => (
                <div key={`${c.name}-${i}`} className="flex flex-col items-center gap-1">
                  <div className="grid place-items-center rounded-md border border-slate-600 bg-slate-800/60 px-2 py-1 text-center">
                    <div className="text-[10px] font-bold uppercase text-amber-300">{c.rarity}</div>
                    <div className="text-xs font-bold">{c.name}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Catalog: <span data-testid="home-catalog-source">{catalogSource}</span> • {catalog.length} cards ({catalog.filter((c) => c.playable).length} playable)
          </p>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <CRButton
            variant="gold"
            size="xl"
            href="/battle"
            testId="home-battle"
            icon="⚔️"
            className="col-span-2 shadow-lg"
          >
            BATTLE
          </CRButton>
          <CRButton variant="blue" size="md" href="/lobby?mode=pvp" testId="home-1v1" icon="👥">
            Play 1v1
          </CRButton>
          <CRButton variant="purple" size="md" href="/lobby?mode=ai" testId="home-vs-ai" icon="🤖">
            Play vs AI
          </CRButton>
        </section>

        {profile && (
          <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold">🏆 {profile.playerId}</span>
              <span className="text-amber-300">{profile.trophies} trophies</span>
            </div>
            <div className="text-xs text-slate-400">
              ✅{profile.wins} ❌{profile.losses} ⚖️{profile.draws} • season {profile.season}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-200">Game Modes</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <ModeCard title="Trophy Road" subtitle="10605 trophies" tone="blue" href="/lobby" testId="mode-trophy" />
            <ModeCard title="Ranked" subtitle="Unlocks at 3000" tone="purple" href="/lobby" testId="mode-ranked" />
            <ModeCard title="Merge Tactics" subtitle="44d 1h" tone="blue" href="/lobby" testId="mode-merge" />
            <ModeCard title="Casual" subtitle="Free play" tone="gray" href="/lobby" testId="mode-casual" />
          </div>
        </section>

        <div className="pt-1 text-center text-[11px] text-slate-400">
          {active !== "battle" ? (
            <button onClick={() => setActive("battle")} className="underline">Switch tab (demo)</button>
          ) : (
            <span>Bottom nav demo</span>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function ModeCard({ title, subtitle, tone, href, testId }: { title: string; subtitle: string; tone: "blue" | "purple" | "gray"; href: string; testId: string }) {
  const toneClass = tone === "purple" ? "from-purple-600 to-purple-800" : tone === "gray" ? "from-slate-500 to-slate-700" : "from-sky-500 to-blue-700";
  return (
    <Link
      href={href}
      data-testid={testId}
      className={`rounded-xl border-b-4 border-black/30 bg-gradient-to-b ${toneClass} p-3 font-extrabold text-white shadow-md active:translate-y-0.5`}
    >
      <div className="text-base">{title}</div>
      <div className="text-[11px] opacity-80">{subtitle}</div>
    </Link>
  );
}
