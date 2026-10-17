/**
 * frontend/app/battle/page.tsx — /battle route (Phase 5 battle flow).
 *
 * Reads playerId + deck from localStorage (`cr-player-id` / `cr-clone-deck-v1`),
 * connects the socket (deck:select → queue:join), subscribes to
 * state:update / queue:matched / match:end / error twins via useBattle, and
 * renders the portrait battle column (max-w-[420px]):
 * top bar + arena canvas + elixir bar + 4-card hand.
 *
 * Sibling contract (reconciled ISS-F5-001/002/003/005, ISS-P5-S1/S2/S3):
 *   - ArenaCanvas { towers, entities, selectedCell, mySide, onTileClick }
 *   - ElixirBar { elixir, max, opponentElixir }
 *   - Hand { hand: CardInfo[], elixir, selectedIndex, nextCard, onSelect }
 *   - BattleTopBar { enemyName, enemyTrophies, playerName, playerTrophies,
 *       timeLeftSec, isOvertime, isMuted, onToggleMute, onEmote }
 * No local fallback components remain — imports are canonical.
 * TowerView is not imported separately (ArenaCanvas renders HP bars internally).
 *
 * Tap-to-deploy: tap a hand card, then tap the arena → card:play
 * {handIndex,x,y}. Pocket-4 hint via pocketSidesFromTowers + isDeployValid +
 * WebAudio stub (pop/thud/fanfare + persisted mute). Win/lose/draw overlay
 * with crowns + Play Again / Deck / Menu. Searching spinner + reconnect
 * banner (match:sync).
 *
 * Overtime (ISS-F5-004, GAME_DESIGN §8): isOvertime comes from useBattle
 * (server OT flag OR elapsed>180s, never t>=120s). Double-elixir (t>=120s)
 * is a separate rate hint shown as a badge, not the OT badge.
 *
 * Layout reference: docs/UI_REFERENCE.md §§2/5/8 + docs/GAME_DESIGN.md §12.
 * Original Canvas/CSS art only (no Supercell assets).
 */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArenaCanvas from "../../components/battle/ArenaCanvas";
import BattleTopBar from "../../components/battle/BattleTopBar";
import ElixirBar from "../../components/battle/ElixirBar";
import Hand from "../../components/battle/Hand";
import { getCard, type CardInfo } from "../../lib/cards";
import {
  isDeployValid,
  pocketSidesFromTowers,
  useBattle,
} from "../../lib/battle/useBattle";
import {
  isMuted,
  playDeploy,
  playHit,
  playInvalid,
  playLose,
  playWin,
  toggleMute,
} from "../../lib/battle/sfx";
import { sendEmote } from "../../lib/socket";
import type { Tower, Unit } from "../../../shared/types";

const DECK_STORAGE_KEY = "cr-clone-deck-v1";
const PLAYER_STORAGE_KEY = "cr-player-id";

const FALLBACK_DECK: string[] = [
  "knight",
  "archers",
  "musketeer",
  "baby-dragon",
  "giant",
  "skeletons",
  "fireball",
  "cannon",
];

/** Offline placeholder towers (same positions as GAME_DESIGN §5.4). */
const DEFAULT_TOWERS: Tower[] = [
  { id: "blue-king", kind: "king", owner: "blue", hitPoints: 2400, maxHitPoints: 2400, position: { x: 8.5, y: 3.5 }, destroyed: false },
  { id: "blue-princess-left", kind: "princess", owner: "blue", hitPoints: 1400, maxHitPoints: 1400, position: { x: 3.5, y: 6.5 }, destroyed: false },
  { id: "blue-princess-right", kind: "princess", owner: "blue", hitPoints: 1400, maxHitPoints: 1400, position: { x: 13.5, y: 6.5 }, destroyed: false },
  { id: "red-king", kind: "king", owner: "red", hitPoints: 2400, maxHitPoints: 2400, position: { x: 8.5, y: 27.5 }, destroyed: false },
  { id: "red-princess-left", kind: "princess", owner: "red", hitPoints: 1400, maxHitPoints: 1400, position: { x: 3.5, y: 24.5 }, destroyed: false },
  { id: "red-princess-right", kind: "princess", owner: "red", hitPoints: 1400, maxHitPoints: 1400, position: { x: 13.5, y: 24.5 }, destroyed: false },
];

function cardCost(id: string): number {
  return getCard(id)?.cost ?? 99;
}

function loadDeck(): string[] {
  try {
    const raw = window.localStorage.getItem(DECK_STORAGE_KEY);
    if (!raw) return FALLBACK_DECK;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string")) {
      const valid = (parsed as string[]).filter((id) => getCard(id) !== undefined);
      return valid.length > 0 ? valid : FALLBACK_DECK;
    }
  } catch {
    // fall through to starter
  }
  return FALLBACK_DECK;
}

function loadPlayerId(): string {
  try {
    return window.localStorage.getItem(PLAYER_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function BattlePage() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const [playerId, setPlayerId] = useState("");
  const [deck, setDeck] = useState<string[]>(FALLBACK_DECK);
  const [ready, setReady] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [invalidFlash, setInvalidFlash] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const seenUnitsRef = useRef<Set<string>>(new Set());
  const prevResultRef = useRef<string | null>(null);

  useEffect(() => {
    setDeck(loadDeck());
    setPlayerId(loadPlayerId());
    setMutedState(isMuted());
    setReady(true);
  }, []);

  const battle = useBattle({ backendUrl, playerId, deck });
  const { phase, matchId, side, opponentId, renderState, displayElixir } = battle;

  // "Battle!" banner on match start.
  const inMatch = phase === "in-match";
  useEffect(() => {
    if (inMatch) {
      setShowBanner(true);
      playDeploy();
      const t = setTimeout(() => setShowBanner(false), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [inMatch, matchId]);

  // Enemy deploy thud: new opposing units since last snapshot.
  useEffect(() => {
    const units = renderState?.units ?? [];
    const seen = seenUnitsRef.current;
    let enemyNew = false;
    for (const u of units) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        if (u.owner !== side) enemyNew = true;
      }
    }
    if (seen.size > 60) {
      // Bound memory over long matches.
      seenUnitsRef.current = new Set(units.map((u) => u.id));
    }
    if (enemyNew) playHit();
  }, [renderState, side]);

  // End-of-match fanfare (once per result).
  useEffect(() => {
    const r = battle.result;
    if (!r || prevResultRef.current === r.matchId) return;
    prevResultRef.current = r.matchId;
    if (r.winner === "draw") playLose();
    else if (r.winner === side) playWin();
    else playLose();
  }, [battle.result, side]);

  // Sibling adapters (ISS-F5-001 canonical contracts).
  const towers: Tower[] = useMemo(() => {
    const t = renderState?.towers;
    if (Array.isArray(t) && t.length > 0) return t as Tower[];
    return DEFAULT_TOWERS;
  }, [renderState]);

  const entities: Unit[] = useMemo(() => {
    const units = renderState?.units ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return units.map((u: any) => ({
      id: String(u.id ?? `${u.cardId}-${u.x}-${u.y}`),
      cardId: String(u.cardId ?? "knight"),
      owner: (u.owner === "red" ? "red" : "blue") as "blue" | "red",
      hitPoints: Number(u.hitPoints ?? 0),
      maxHitPoints: Number(u.maxHitPoints ?? 1),
      position: {
        x: Number(u.position?.x ?? u.x ?? 0),
        y: Number(u.position?.y ?? u.y ?? 0),
      },
      ...(u.targetId !== undefined ? { targetId: String(u.targetId) } : {}),
    }));
  }, [renderState]);

  const handCards: CardInfo[] = useMemo(
    () => battle.hand.map((id) => getCard(id)).filter((c): c is CardInfo => !!c),
    [battle.hand],
  );

  const nextCardInfo: CardInfo | null = useMemo(() => {
    if (!battle.nextCard) return null;
    return getCard(battle.nextCard) ?? null;
  }, [battle.nextCard]);

  const opponentSide = side === "blue" ? "red" : "blue";
  const opponentElixir = battle.snapshot?.elixir?.[opponentSide] ?? null;

  const pocket = useMemo(
    () => pocketSidesFromTowers(renderState?.towers, side),
    [renderState, side],
  );

  const selectedCardId = battle.selected !== null ? battle.hand[battle.selected] ?? null : null;

  const flashInvalid = useCallback((message: string) => {
    setNotice(message);
    setInvalidFlash(true);
    playInvalid();
    setTimeout(() => setInvalidFlash(false), 450);
  }, []);

  const handleTile = useCallback(
    async (x: number, y: number) => {
      setHover({ x, y });
      if (battle.selected === null) {
        setNotice("Tap a card first, then tap your half of the arena.");
        return;
      }
      const cardId = battle.hand[battle.selected];
      if (!cardId) return;
      if (!isDeployValid(x, y, side, cardId, pocket)) {
        flashInvalid("Invalid spot — deploy on your half (spells anywhere).");
        return;
      }
      if (Math.floor(displayElixir) < cardCost(cardId)) {
        flashInvalid(`Need ${cardCost(cardId)} elixir for ${cardId}.`);
        return;
      }
      if (!matchId) {
        flashInvalid("Not in a match yet — hit BATTLE and wait for pairing.");
        return;
      }
      const res = await battle.deploy(battle.selected, x, y);
      if (res.ok) {
        setNotice(null);
        playDeploy();
      } else {
        flashInvalid(res.error ?? "Deploy rejected.");
      }
    },
    [battle, side, pocket, displayElixir, matchId, flashInvalid],
  );

  // Desktop hover preview → sibling selectedCell (sibling has no onHover callback;
  // wrapper div synthesizes hover; touch deploy works via click synthesis).
  const tileFromClient = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * 18);
    const y = Math.floor(((clientY - rect.top) / rect.height) * 32);
    return {
      x: Math.max(0, Math.min(17, x)),
      y: Math.max(0, Math.min(31, y)),
    };
  }, []);

  const resultTitle = useMemo(() => {
    const r = battle.result;
    if (!r) return "";
    if (r.winner === "draw") return "Draw!";
    return r.winner === side ? "Victory!" : "Defeat!";
  }, [battle.result, side]);

  const myCrowns = battle.result ? (battle.result.crowns[side] ?? 0) : 0;

  async function handlePlayAgain() {
    prevResultRef.current = null;
    seenUnitsRef.current = new Set();
    battle.leave();
    await battle.join();
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-sky-400 via-green-600 to-amber-950 p-2 text-slate-100">
      <style>{`
        @keyframes battle-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-4px); } }
        .battle-shake { animation: battle-shake 0.4s ease; }
        @keyframes elixir-pulse { 0%,100% { box-shadow: 0 0 6px rgba(232,121,249,0.7); } 50% { box-shadow: 0 0 16px rgba(232,121,249,1); } }
        .elixir-full { animation: elixir-pulse 1.2s ease-in-out infinite; }
        @keyframes battle-spin { to { transform: rotate(360deg); } }
        .battle-spinner { animation: battle-spin 0.9s linear infinite; }
      `}</style>

      <div data-testid="battle-page" className="flex w-full max-w-[420px] flex-col gap-1.5">
        <div className="flex items-center justify-between px-1 pt-1">
          <Link href="/" className="text-xs font-bold text-white/90 underline hover:text-white">
            ← Menu
          </Link>
          <span className="text-xs font-extrabold tracking-wide text-yellow-200 [text-shadow:1px_1px_0_rgba(0,0,0,0.6)]">
            ⚔️ BATTLE
          </span>
          <Link href="/deck" className="text-xs font-bold text-white/90 underline hover:text-white">
            Deck
          </Link>
        </div>

        <BattleTopBar
          enemyName={opponentId ?? "??? (searching)"}
          enemyTrophies={0}
          playerName={playerId || "you"}
          playerTrophies={0}
          timeLeftSec={battle.timeLeftSec}
          isOvertime={battle.isOvertime}
          isMuted={muted}
          onToggleMute={() => setMutedState(toggleMute())}
          onEmote={() => {
            if (matchId && playerId) {
              try {
                void sendEmote(matchId, playerId, "wave");
              } catch {
                // cosmetic only
              }
            }
          }}
        />

        {battle.isDoubleElixir && !battle.isOvertime && phase === "in-match" && (
          <div
            data-testid="double-elixir-badge"
            className="rounded-lg border border-fuchsia-400 bg-fuchsia-950 px-3 py-1 text-center text-[11px] font-extrabold text-fuchsia-200"
          >
            ⚡ 2x Elixir — last minute + overtime rate
          </div>
        )}

        {battle.reconnecting && (
          <div data-testid="reconnect-banner" className="rounded-lg border border-amber-500 bg-amber-950 px-3 py-2 text-center text-xs font-bold text-amber-200">
            Reconnecting… requesting latest snapshot{" "}
            <button type="button" onClick={battle.resync} className="underline hover:text-amber-100">
              Retry sync
            </button>
          </div>
        )}

        {showBanner && phase === "in-match" && (
          <div data-testid="battle-banner" className="rounded-xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-3 py-2 text-center text-2xl font-extrabold text-red-900 [text-shadow:1px_1px_0_rgba(255,255,255,0.5)]">
            Battle! ⚔️
            <span className="block text-xs font-bold text-red-950">
              {playerId || "you"} vs {opponentId ?? "opponent"}
            </span>
          </div>
        )}

        <div
          className={`relative ${invalidFlash ? "battle-shake" : ""}`}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const t = tileFromClient(e.clientX, e.clientY, rect);
            setHover(t);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <ArenaCanvas
            towers={towers}
            entities={entities}
            selectedCell={hover}
            mySide={side}
            onTileClick={(x, y) => void handleTile(x, y)}
          />
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-950/70 p-4 text-center">
              <p className="text-sm text-slate-200">
                {playerId ? `Ready as ${playerId}` : "Set a playerId in Lobby first (or play below)."}
              </p>
              <button
                type="button"
                data-testid="battle-join"
                onClick={() => void battle.join()}
                className="rounded-xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-10 py-3 text-xl font-extrabold text-red-900 hover:brightness-110"
              >
                BATTLE!
              </button>
              <Link href="/lobby" className="text-xs text-sky-300 underline">
                Go to Lobby
              </Link>
            </div>
          )}
          {phase === "searching" && (
            <div data-testid="queue-status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-950/70 p-4 text-center">
              <span className="battle-spinner inline-block text-3xl">🌀</span>
              <p className="text-sm font-bold text-slate-100">
                Searching for opponent…
                {battle.queuePosition !== null ? ` (#${battle.queuePosition} in queue)` : ""}
              </p>
              <button
                type="button"
                onClick={battle.leave}
                className="rounded-lg border-b-4 border-red-800 bg-gradient-to-b from-red-400 to-red-600 px-6 py-2 text-sm font-extrabold text-white"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <ElixirBar elixir={ready ? displayElixir : 5} max={10} opponentElixir={opponentElixir} />

        <Hand
          hand={handCards}
          elixir={displayElixir}
          selectedIndex={battle.selected}
          nextCard={nextCardInfo}
          onSelect={battle.selectCard}
        />

        {(battle.error || notice) && (
          <div
            data-testid="battle-error"
            role={battle.error ? "alert" : "status"}
            className="flex items-start justify-between gap-2 rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-200"
          >
            <span>{battle.error ?? notice}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                battle.clearError();
                setNotice(null);
              }}
              className="font-bold hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {!battle.connected && phase !== "idle" && (
          <p className="text-center text-[11px] text-white/70">Socket offline — check the backend at {backendUrl}.</p>
        )}

        {battle.result && (
          <div data-testid="battle-result" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="w-full max-w-[340px] rounded-2xl border-b-8 border-amber-700 bg-gradient-to-b from-sky-800 to-sky-950 p-6 text-center">
              <h2 className="text-3xl font-extrabold text-yellow-300 [text-shadow:2px_2px_0_rgba(0,0,0,0.6)]">
                {resultTitle} {resultTitle === "Victory!" ? "🏆" : resultTitle === "Defeat!" ? "💀" : "🤝"}
              </h2>
              <p className="mt-2 text-lg" aria-label={`${myCrowns} crowns`}>
                {"⭐".repeat(Math.max(0, Math.min(3, myCrowns))) || "☆☆☆"}
              </p>
              <p className="mt-1 text-xs text-sky-200">
                Crowns — you {battle.result.crowns[side] ?? 0} : {battle.result.crowns[side === "blue" ? "red" : "blue"] ?? 0} foe
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="battle-play-again"
                  onClick={() => void handlePlayAgain()}
                  className="rounded-xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 font-extrabold text-red-900 hover:brightness-110"
                >
                  Play Again
                </button>
                <div className="flex gap-2">
                  <Link href="/deck" className="flex-1 rounded-xl border-b-4 border-sky-900 bg-gradient-to-b from-sky-400 to-sky-600 px-4 py-2 text-center font-extrabold text-white">
                    Deck
                  </Link>
                  <Link href="/" className="flex-1 rounded-xl border-b-4 border-slate-700 bg-slate-800 px-4 py-2 text-center font-extrabold text-white">
                    Menu
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
