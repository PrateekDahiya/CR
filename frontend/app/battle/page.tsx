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
import NextCardPanel from "../../components/battle/NextCardPanel";
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
import { getSocket, requestSync, sendEmote } from "../../lib/socket";
import { reportMatch, getPlayerProfile, getMatchRoster } from "../../lib/api";
import { usePlayer } from "../../lib/playerContext";
import { crBgStyle } from "../../lib/crTheme";
import { CRButton } from "../../components/ui";
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
  // Single source of truth: `cr-clone-deck-v1` always holds the deck currently
  // selected in the Deck tab (edits included). The old `cr-clone-active-deck`
  // copy was only written on deck *selection*, so edits were lost here.
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
    const existing = window.localStorage.getItem(PLAYER_STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    // Always have an id so card deploys are accepted by the server.
    const generated = `guest-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(PLAYER_STORAGE_KEY, generated);
    return generated;
  } catch {
    return "guest";
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
  const reportedRef = useRef<string | null>(null);
  const [trophyDelta, setTrophyDelta] = useState<number | null>(null);
  const [coinDelta, setCoinDelta] = useState<number | null>(null);
  const [foe, setFoe] = useState<{ name: string; club: string; trophies: number } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  /** Horizontal inset of the arena inside its container (arena is centred). */
  const [hudInset, setHudInset] = useState(0);

  useEffect(() => {
    setDeck(loadDeck());
    setPlayerId(loadPlayerId());
    setMutedState(isMuted());
    setReady(true);
    // Arriving from the matchmaking loader, the resume guard, or a mid-match
    // reload: ask the server for that match's snapshot so the hook adopts it,
    // rebinds this socket, and the battle continues where it was left.
    try {
      const params = new URLSearchParams(window.location.search);
      const mid = params.get("matchId");
      const socket = getSocket();
      if (mid && socket !== null && socket.connected) {
        requestSync(mid, loadPlayerId());
      } else if (mid) {
        // Socket still connecting: sync as soon as it is up.
        const onConnect = () => {
          requestSync(mid, loadPlayerId());
          socket?.off("connect", onConnect);
        };
        socket?.on("connect", onConnect);
      }
    } catch {
      // ignore
    }
  }, []);

  const battle = useBattle({ backendUrl, playerId, deck });
  const { phase, matchId, side, opponentId, renderState, displayElixir } = battle;
  const { refresh: refreshProfile, profile } = usePlayer();

  // Adopt the match from the matchmaking redirect (client-side only, after
  // mount): the red player must render/deploy on their own half.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const mid = params.get("matchId");
      if (!mid) return;
      battle.adoptMatch({
        matchId: mid,
        side: params.get("side") === "red" ? "red" : "blue",
        opponentId: params.get("opponent") ?? undefined,
      });
    } catch {
      // ignore malformed query
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Report the result so trophies/coins update server-side (once per match).
  // Bot matches count too — they are real wins/losses for the ladder.
  useEffect(() => {
    const r = battle.result;
    if (!r || reportedRef.current === r.matchId || playerId.length === 0) return;
    reportedRef.current = r.matchId;
    void reportMatch(
      {
        blueId: side === "blue" ? playerId : "ai-opponent",
        redId: side === "red" ? playerId : "ai-opponent",
        winner: r.winner === "draw" ? "draw" : r.winner,
        blueCrowns: r.crowns?.blue ?? 0,
        redCrowns: r.crowns?.red ?? 0,
        durationMs: Math.max(0, 180_000 - battle.timeLeftSec * 1000),
      },
      backendUrl,
    )
      .then((res) => {
        const mine = res.deltas?.find((d) => d.playerId === playerId);
        if (mine) {
          setTrophyDelta(mine.trophyDelta);
          setCoinDelta(mine.coinDelta);
        }
        void refreshProfile();
      })
      .catch(() => undefined);
  }, [battle.result, battle.timeLeftSec, playerId, side, backendUrl, refreshProfile]);

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

  /**
   * Show the opponent's REAL name + trophies, not a placeholder. The redirect
   * carries `?opponent=`; when it does not (direct load / refresh) we read the
   * match roster and resolve the other side's profile. The bot keeps "AI".
   */
  useEffect(() => {
    let cancelled = false;

    const showFoe = (oid: string | null) => {
      const isBot =
        oid === null || /^ai\b/i.test(oid) || oid.startsWith("bot-") || oid.startsWith("ai-");
      if (isBot) {
        if (!cancelled) setFoe(oid === null ? null : { name: "AI", club: "Difficulty: medium", trophies: 0 });
        return;
      }
      void getPlayerProfile(oid as string, backendUrl)
        .then((p) => {
          if (cancelled) return;
          setFoe({ name: p.name, club: p.season ? `Season ${p.season}` : "Player", trophies: p.trophies });
        })
        .catch(() => {
          if (!cancelled) setFoe({ name: oid as string, club: "Player", trophies: 0 });
        });
    };

    if (opponentId !== null && opponentId.length > 0) {
      showFoe(opponentId);
      return () => {
        cancelled = true;
      };
    }
    if (matchId === null) return () => undefined;
    void getMatchRoster(matchId, backendUrl)
      .then((r) => {
        if (cancelled) return;
        const other = side === "blue" ? r.redId : r.blueId;
        showFoe(other);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [opponentId, matchId, side, backendUrl]);

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
    await battle.joinSearch("medium");
  }

  // The arena is centred and narrower than the column, so the HUD must inset to
  // the ARENA edges (top-right of the battle screen), not the viewport's.
  useEffect(() => {
    const el = arenaRef.current;
    if (el === null) return;
    const measure = () => {
      const canvas = el.querySelector('[data-testid="arena-canvas"]');
      if (canvas === null) return;
      const box = el.getBoundingClientRect();
      const art = canvas.getBoundingClientRect();
      setHudInset(Math.max(0, Math.round(art.left - box.left)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const canvas = el.querySelector('[data-testid="arena-canvas"]');
    if (canvas !== null) ro.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden text-white" style={crBgStyle()}>
      <style>{`
        @keyframes battle-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-4px); } }
        .battle-shake { animation: battle-shake 0.4s ease; }
        @keyframes elixir-pulse { 0%,100% { box-shadow: 0 0 6px rgba(232,121,249,0.7); } 50% { box-shadow: 0 0 16px rgba(232,121,249,1); } }
        .elixir-full { animation: elixir-pulse 1.2s ease-in-out infinite; }
        @keyframes battle-spin { to { transform: rotate(360deg); } }
        .battle-spinner { animation: battle-spin 0.9s linear infinite; }
      `}</style>

      <div
        data-testid="battle-page"
        data-phase={phase}
        data-match={matchId ?? ""}
        data-pid={playerId}
        className="relative mx-auto flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden"
      >
        {/* Arena takes all free space; the HUD is a sibling below it, so no part
            of the playable board is ever covered and the page never scrolls. */}
        <div
          ref={arenaRef}
          className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${
            invalidFlash ? "battle-shake" : ""
          }`}
        >
          <ArenaCanvas
            towers={towers}
            entities={entities}
            selectedCell={hover}
            mySide={side}
            onHover={(cell) => setHover(cell)}
            onTileClick={(x, y) => void handleTile(x, y)}
            className="h-full"
          />
          {phase === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#050b1c]/55">
              <CRButton
                variant="gold"
                size="xl"
                testId="battle-join"
                onClick={() => void battle.joinSearch("medium")}
                icon="⚔️"
              >
                Battle
              </CRButton>
            </div>
          )}
          {phase === "searching" && (
            <div
              data-testid="queue-status"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050b1c]/70 text-center"
            >
              <span className="battle-spinner inline-block text-3xl">🌀</span>
              <p className="text-sm font-extrabold uppercase tracking-wide text-amber-300">
                Searching…
              </p>
              <CRButton variant="red" size="sm" testId="queue-cancel" onClick={battle.leave}>
                Cancel
              </CRButton>
            </div>
          )}
          {showBanner && phase === "in-match" && (
            <div
              data-testid="battle-banner"
              className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-6 py-1.5 text-2xl font-extrabold uppercase text-red-900 shadow-lg [text-shadow:1px_1px_0_rgba(255,255,255,0.5)]"
            >
              Battle! ⚔️
            </div>
          )}
        </div>

        {/* Top HUD — sits at the top of the ARENA (battle screen), not the viewport. */}
        <div
          className="pointer-events-none absolute top-0 z-10"
          style={{ left: hudInset, right: hudInset }}
        >
          <BattleTopBar
            enemyName={foe?.name ?? opponentId ?? "Opponent"}
            enemyClub={foe?.club ?? "Guest"}
            enemyTrophies={foe?.trophies ?? 0}
            timeLeftSec={battle.timeLeftSec}
            isOvertime={battle.isOvertime}
          />
          {/* Elixir speed hint, right under the timer. */}
          {battle.elixirMultiplier > 1 && phase === "in-match" && (
            <div className="mt-0.5 flex justify-end pr-2">
              <div
                data-testid="double-elixir-badge"
                className="rounded-full bg-fuchsia-950/85 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-fuchsia-200"
              >
                ⚡ {battle.elixirMultiplier}x Elixir
              </div>
            </div>
          )}
          {battle.reconnecting && (
            <div
              data-testid="reconnect-banner"
              className="mx-auto mt-1 w-fit rounded-full bg-amber-950/90 px-3 py-0.5 text-[10px] font-bold text-amber-200"
            >
              Reconnecting…{" "}
              <button type="button" onClick={battle.resync} className="underline hover:text-amber-100">
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Bottom HUD - CR blue bar: emote + Next on the left, 4 cards, elixir strip.
            Sits BELOW the arena (flex sibling), never on top of the board. */}
        <div className="z-10 shrink-0 bg-gradient-to-b from-[#1f4b9c] via-[#17407f] to-[#102f63] px-1 pb-0.5 pt-1 shadow-[0_-4px_14px_rgba(0,0,0,0.5)]">
          <div className="flex items-end gap-1">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="emote-button"
                  onClick={() => {
                    if (matchId && playerId) {
                      try {
                        void sendEmote(matchId, playerId, "wave");
                      } catch {
                        // cosmetic only
                      }
                    }
                  }}
                  title="Emotes"
                  aria-label="Open emotes"
                  className="grid h-7 w-7 place-items-center rounded-lg border-2 border-white/60 bg-white/90 text-sm text-slate-800 shadow active:translate-y-0.5"
                >
                  💬
                </button>
                <button
                  type="button"
                  data-testid="mute-toggle"
                  onClick={() => setMutedState(toggleMute())}
                  title={muted ? "Unmute" : "Mute"}
                  aria-label={muted ? "Unmute sound" : "Mute sound"}
                  aria-pressed={muted}
                  className="grid h-7 w-6 place-items-center rounded-lg border-2 border-white/40 bg-white/25 text-[11px] text-white shadow active:translate-y-0.5"
                >
                  {muted ? "🔇" : "🔊"}
                </button>
              </div>
              {/* End Battle: ends the match for BOTH players; the player who
                  ends it loses. Lives in the bottom panel so it is always
                  reachable and never overlaps the board. */}
              {phase === "in-match" && (
                <button
                  type="button"
                  data-testid="battle-forfeit"
                  onClick={() => setConfirmEnd(true)}
                  title="End the battle (you lose)"
                  className="w-full rounded-md border-b-2 border-red-900 bg-gradient-to-b from-red-500 to-red-700 px-1 py-0.5 text-[8px] font-extrabold uppercase leading-tight tracking-wide text-white shadow active:translate-y-0.5"
                >
                  End
                  <br />
                  Battle
                </button>
              )}
              <NextCardPanel card={nextCardInfo} />
            </div>
            <Hand
              hand={handCards}
              elixir={displayElixir}
              selectedIndex={battle.selected}
              onSelect={battle.selectCard}
            />
          </div>
          <div className="mt-0.5">
            <ElixirBar elixir={ready ? displayElixir : 5} max={10} opponentElixir={opponentElixir} />
          </div>
        </div>

        {/* Transient notices sit just above the hand. */}
        {(battle.error || notice) && (
          <div
            data-testid="battle-error"
            role={battle.error ? "alert" : "status"}
            className="absolute inset-x-4 bottom-4 z-20 flex items-start justify-between gap-2 rounded-lg border border-red-700 bg-red-950/95 px-3 py-1.5 text-[11px] text-red-100"
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
          <p className="absolute inset-x-0 top-16 z-20 text-center text-[11px] text-amber-200">
            Socket offline — backend at {backendUrl}
          </p>
        )}

        {/* Surrender confirmation: ending the battle counts as a loss. */}
      {confirmEnd && (
        <div
          data-testid="forfeit-confirm"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#050b1c]/90 p-4"
        >
          <div className="w-full max-w-[300px] rounded-2xl border-4 border-red-700 bg-gradient-to-b from-[#3a1414] to-[#1a0a0a] p-4 text-center shadow-2xl">
            <h3 className="text-lg font-extrabold uppercase tracking-wide text-red-300">
              End this battle?
            </h3>
            <p className="mt-1 text-xs font-bold text-slate-200">
              The battle ends for both players and <span className="text-red-300">you lose</span>.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                data-testid="forfeit-confirm-yes"
                onClick={() => {
                  setConfirmEnd(false);
                  void battle.surrender();
                }}
                className="rounded-xl border-b-4 border-red-900 bg-gradient-to-b from-red-500 to-red-700 px-4 py-2 text-sm font-extrabold uppercase text-white active:translate-y-0.5"
              >
                End &amp; Lose
              </button>
              <button
                type="button"
                data-testid="forfeit-cancel"
                onClick={() => setConfirmEnd(false)}
                className="rounded-xl border-b-4 border-sky-900 bg-gradient-to-b from-sky-400 to-sky-600 px-4 py-2 text-sm font-extrabold uppercase text-white active:translate-y-0.5"
              >
                Keep Playing
              </button>
            </div>
          </div>
        </div>
      )}

      {battle.result && (
          <div
            data-testid="battle-result"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b1c]/90 p-4 backdrop-blur-[2px]"
          >
            <div className="w-full max-w-[340px] overflow-hidden rounded-2xl border-4 border-amber-600/70 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] text-center shadow-2xl">
              <div className="border-b-2 border-amber-500/30 bg-gradient-to-r from-[#24407a] to-[#12224a] px-3 py-2">
                <h2 className="text-3xl font-extrabold uppercase tracking-wide text-amber-300 [text-shadow:2px_2px_0_rgba(0,0,0,0.6)]">
                  {resultTitle}
                </h2>
              </div>
              <div className="px-4 py-4">
                <p className="text-2xl" aria-label={`${myCrowns} crowns`}>
                  {"👑".repeat(Math.max(0, Math.min(3, myCrowns))) || "☆☆☆"}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-300">
                  You {battle.result.crowns[side] ?? 0} —{" "}
                  {battle.result.crowns[side === "blue" ? "red" : "blue"] ?? 0} foe
                </p>
                {(trophyDelta !== null || coinDelta !== null) && (
                  <div
                    data-testid="result-rewards"
                    className="mt-2 flex items-center justify-center gap-2 text-sm font-extrabold"
                  >
                    {trophyDelta !== null && (
                      <span className={trophyDelta >= 0 ? "text-emerald-300" : "text-rose-300"}>
                        🏆 {trophyDelta >= 0 ? "+" : ""}
                        {trophyDelta}
                      </span>
                    )}
                    {coinDelta !== null && (
                      <span className="text-amber-300">
                        🪙 +{coinDelta}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-2">
                  <CRButton
                    variant="gold"
                    size="md"
                    testId="battle-play-again"
                    onClick={() => void handlePlayAgain()}
                    icon="⚔️"
                  >
                    Play Again
                  </CRButton>
                  <div className="flex gap-2">
                    <CRButton variant="blue" size="sm" testId="battle-result-deck" href="/decks">
                      Deck
                    </CRButton>
                    <CRButton variant="gray" size="sm" testId="battle-result-menu" href="/">
                      Home
                    </CRButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
