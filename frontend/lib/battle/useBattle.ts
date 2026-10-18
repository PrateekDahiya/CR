/**
 * frontend/lib/battle/useBattle.ts — battle-client state hook (Phase 5).
 *
 * Owns: socket connect, queue join/leave, serverTimeMs clock, 10 Hz snapshot
 * intake, 60 fps interpolated render state for canvas, client-side elixir
 * extrapolation between ticks, and optimistic 4-card hand cycling.
 *
 * Protocol per docs/GAME_DESIGN.md §12: deck:select → queue:join →
 * queue:matched (+match:start) → state:update (10 Hz) → card:play
 * {handIndex,x,y} → match:end; errors via error/error:game twins;
 * reconnect via match:sync. Server is authoritative — this hook never
 * mutates snapshot truth, only interpolates/extrapolates for display.
 *
 * Sibling note (MEMORY#16): transport lives in ../socket.ts, card data in
 * ../cards.ts — this file adds battle state only. Canvas rendering lives in
 * the /battle route + components/battle/* (other agents).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  connect,
  disconnect,
  getSocket,
  joinQueue,
  joinAiMatch,
  leaveQueue,
  onGameError,
  onMatchEnd,
  onMatched,
  onStateUpdate,
  playCard,
  requestSync,
  selectDeck,
  type MatchEnd,
  type PlayerSide,
  type QueueMatched,
  type StateUpdate,
} from "../socket";
import { getCard } from "../cards";
import { toBattleDeck } from "../battleDeck";

export type BattlePhase = "idle" | "searching" | "in-match" | "ended";

export interface InterpolatedUnit {
  id: string;
  cardId: string;
  owner: PlayerSide;
  hitPoints: number;
  maxHitPoints: number;
  x: number;
  y: number;
  targetId?: string;
}

export interface RenderState {
  matchId: string;
  tick: number;
  serverTimeMs: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  towers: any[];
  units: InterpolatedUnit[];
  crowns: Record<PlayerSide, number>;
  winner?: PlayerSide | "draw";
  endsAtMs?: number;
}

export interface UseBattleOptions {
  backendUrl: string;
  playerId: string;
  deck: string[];
}

export interface DeployResult {
  ok: boolean;
  error?: string;
}

/** Match clock: 180 s regulation (GAME_DESIGN §8). */
export const REGULATION_MS = 180_000;
/** Double-elixir window starts at t = 120 s (§7). */
export const DOUBLE_ELIXIR_AT_MS = 120_000;
/** Sudden-death overtime length: 60 s (§8.1). */
export const OVERTIME_MS = 60_000;
/** Hard cap: regulation + overtime = 240 s (§8.1). */
export const HARD_CAP_MS = 240_000;
/** Client interp buffer behind server clock (§9: 100 ms). */
const INTERP_DELAY_MS = 100;

/* ---------------- perf scratch (MEMORY#20: no per-frame Map allocs) ---------------- */
// O(1) amortized space: one shared lookup Map reused across interp calls.
// Single-threaded rAF — toRenderUnits is synchronous, so sharing is safe.
// PERF: was `new Map(prev.units.map(...))` per frame (Map + closure + array);
// now clear()+fill via indexed loop, zero allocs for the lookup itself.
const _prevById = new Map<string, unknown>();

/** Elixir regen rate (elixir/sec) for a match elapsed time. */
// O(1) time/space — pure threshold. PERF: branchless-eligible, no alloc.
export function elixirRateFor(elapsedMs: number): number {
  return elapsedMs >= DOUBLE_ELIXIR_AT_MS ? 1 / 1.4 : 1 / 2.8;
}

/** Pocket-4 lane sides (GAME_DESIGN §5.3): true when the enemy princess on that lane side is destroyed. */
export interface PocketSides {
  left: boolean;
  right: boolean;
}

/**
 * Derive pocket sides from a towers array (client hint only; server wins).
 * For `mySide`, the pocket opens on the lane side where the ENEMY princess is destroyed.
 */
// O(t) time single-pass, t=6 towers; O(1) space.
// PERF: indexed loop + hoisted enemy/ids; early-out when both lanes found.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pocketSidesFromTowers(towers: any[] | null | undefined, mySide: PlayerSide): PocketSides {
  const empty = { left: false, right: false };
  if (!Array.isArray(towers)) return empty;
  const enemy: PlayerSide = mySide === "blue" ? "red" : "blue";
  let left = false;
  let right = false;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (!t || t.owner !== enemy || t.kind !== "princess" || !t.destroyed) continue;
    const id = String(t.id ?? "");
    const px = Number(t.position?.x ?? (id.includes("left") ? 3.5 : id.includes("right") ? 13.5 : NaN));
    if (id.includes("left") || (Number.isFinite(px) && px < 9)) left = true;
    else if (id.includes("right") || (Number.isFinite(px) && px >= 9)) right = true;
    else {
      left = true;
      right = true;
    }
    if (left && right) break;
  }
  return { left, right };
}

/**
 * Deploy-zone precheck mirroring GAME_DESIGN §5.3/§11 (client-side hint only;
 * server validation is authoritative). Spells may target anywhere.
 * Pocket-4 (ISS-F5-007): after an enemy princess kill, the taken lane side
 * extends 4 tiles past the river — Blue y=17-20 (Blue<=20), Red y=11-14
 * (Red>=11) — river y15-16 always rejected.
 */
// O(1) time/space — pure arithmetic + one getCard hash lookup. PERF: no alloc.
export function isDeployValid(
  x: number,
  y: number,
  side: PlayerSide,
  cardId?: string,
  pocket?: PocketSides | null,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0 || x > 18 || y < 0 || y > 32) return false;
  const card = cardId ? getCard(cardId) : undefined;
  if (card?.type === "spell") return true; // spells cast anywhere
  if (y >= 15 && y <= 16) return false; // river band always rejected
  if (side === "blue") {
    if (y >= 0 && y <= 14) return true;
    // pocket-4 band Blue<=20 on the taken lane side only
    if (pocket) {
      const lanePocket = x < 9 ? pocket.left : pocket.right;
      if (lanePocket && y >= 17 && y <= 20) return true;
    }
    return false;
  }
  if (y >= 17 && y <= 31) return true;
  // pocket-4 band Red>=11 on the taken lane side only
  if (pocket) {
    const lanePocket = x < 9 ? pocket.left : pocket.right;
    if (lanePocket && y >= 11 && y <= 14) return true;
  }
  return false;
}

// O(v) time, v=visible units (<=40); O(v) space for the output array.
// PERF: shared _prevById scratch (no per-frame Map/closure); single indexed
// pass with hoisted positions; early-out alpha=1 fast path (snap) and
// cross-match reset (no lookup fill). Per-unit cost is O(1).
function toRenderUnits(
  prev: StateUpdate | null,
  curr: StateUpdate,
  renderTimeMs: number,
): InterpolatedUnit[] {
  const units = curr.units;
  const n = units.length;
  const out = new Array<InterpolatedUnit>(n);
  if (!prev || prev.matchId !== curr.matchId) {
    for (let i = 0; i < n; i++) {
      const u = units[i];
      out[i] = {
        id: String(u.id),
        cardId: String(u.cardId),
        owner: u.owner as PlayerSide,
        hitPoints: Number(u.hitPoints ?? 0),
        maxHitPoints: Number(u.maxHitPoints ?? 1),
        x: Number(u.position?.x ?? 0),
        y: Number(u.position?.y ?? 0),
        targetId: u.targetId !== undefined ? String(u.targetId) : undefined,
      };
    }
    return out;
  }
  const span = curr.serverTimeMs - prev.serverTimeMs;
  const alpha = span > 0 ? Math.min(1, Math.max(0, (renderTimeMs - prev.serverTimeMs) / span)) : 1;
  _prevById.clear();
  const prevUnits = prev.units;
  for (let i = 0; i < prevUnits.length; i++) {
    const p = prevUnits[i];
    _prevById.set(String(p.id), p);
  }
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = units[i] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = _prevById.get(String(u.id)) as any;
    const cx = Number(u.position?.x ?? 0);
    const cy = Number(u.position?.y ?? 0);
    const px = p ? Number(p.position?.x ?? cx) : cx;
    const py = p ? Number(p.position?.y ?? cy) : cy;
    out[i] = {
      id: String(u.id),
      cardId: String(u.cardId),
      owner: u.owner as PlayerSide,
      hitPoints: Number(u.hitPoints ?? 0),
      maxHitPoints: Number(u.maxHitPoints ?? 1),
      x: px + (cx - px) * alpha,
      y: py + (cy - py) * alpha,
      targetId: u.targetId !== undefined ? String(u.targetId) : undefined,
    };
  }
  return out;
}

export interface UseBattle {
  phase: BattlePhase;
  connected: boolean;
  reconnecting: boolean;
  matchId: string | null;
  side: PlayerSide;
  opponentId: string | null;
  queuePosition: number | null;
  snapshot: StateUpdate | null;
  renderState: RenderState | null;
  /** Display elixir for our side (floored server float + interp). */
  displayElixir: number;
  /** Fractional progress to the next whole elixir (0..1) for the pips bar. */
  elixirProgress: number;
  hand: string[];
  nextCard: string | null;
  selected: number | null;
  selectCard: (index: number | null) => void;
  deploy: (handIndex: number, x: number, y: number) => Promise<DeployResult>;
  serverNowMs: number;
  timeLeftSec: number;
  /** Sudden-death overtime (GAME_DESIGN §8): true only in OT, NOT during double-elixir (ISS-F5-004). */
  isOvertime: boolean;
  /** Double-elixir rate window: t>=120s through end of OT (GAME_DESIGN §7). */
  isDoubleElixir: boolean;
  result: MatchEnd | null;
  error: string | null;
  clearError: () => void;
  join: () => Promise<void>;
  /** Starts a real authoritative match vs the server-side AI bot. */
  joinPractice: (difficulty?: "easy" | "medium" | "hard") => Promise<void>;
  leave: () => void;
  resync: () => void;
}

export function useBattle({ backendUrl, playerId, deck }: UseBattleOptions): UseBattle {
  const [phase, setPhase] = useState<BattlePhase>("idle");
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [side, setSide] = useState<PlayerSide>("blue");
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<StateUpdate | null>(null);
  const [prevSnapshot, setPrevSnapshot] = useState<StateUpdate | null>(null);
  const [renderState, setRenderState] = useState<RenderState | null>(null);
  const [serverNowMs, setServerNowMs] = useState(0);
  const [displayElixir, setDisplayElixir] = useState(5);
  const [elixirProgress, setElixirProgress] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<MatchEnd | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optimistic hand: first 4 of deck in hand, rest cycle as next queue.
  const [hand, setHand] = useState<string[]>(() => deck.slice(0, 4));
  const [queue, setQueue] = useState<string[]>(() => (deck.length > 4 ? deck.slice(4) : []));

  const matchStartMsRef = useRef(0);
  const lastServerMsRef = useRef(0);
  const lastLocalAtRef = useRef(0);
  const sideRef = useRef<PlayerSide>("blue");
  sideRef.current = side;
  const matchIdRef = useRef<string | null>(null);
  matchIdRef.current = matchId;
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;
  const deckRef = useRef(deck);
  deckRef.current = deck;
  // Ref mirrors for the 60fps loop + deploy (ISS-F5-006: read refs/locals outside
  // setState updaters so no nested setState runs inside another updater).
  const snapshotRef = useRef<StateUpdate | null>(null);
  snapshotRef.current = snapshot;
  const prevSnapshotRef = useRef<StateUpdate | null>(null);
  prevSnapshotRef.current = prevSnapshot;
  const handRef = useRef<string[]>(hand);
  handRef.current = hand;
  const queueRef = useRef<string[]>(queue);
  queueRef.current = queue;

  // Reset optimistic hand when the deck identity changes (lobby/deck edits).
  const deckKey = deck.join(",");
  useEffect(() => {
    setHand(deck.slice(0, 4));
    setQueue(deck.length > 4 ? deck.slice(4) : []);
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey]);

  const trackClock = useCallback((serverTimeMs: number) => {
    if (typeof serverTimeMs === "number" && Number.isFinite(serverTimeMs) && serverTimeMs > 0) {
      lastServerMsRef.current = serverTimeMs;
      lastLocalAtRef.current = Date.now();
      setServerNowMs(serverTimeMs);
    }
  }, []);

  const join = useCallback(async () => {
    const id = playerIdRef.current.trim();
    const d = deckRef.current;
    if (id.length === 0) {
      setError("Enter a playerId first (opaque until Phase 7 auth).");
      return;
    }
    if (d.length !== 8) {
      setError(`Deck must be exactly 8 cards (have ${d.length}). Edit in Deck.`);
      return;
    }
    setError(null);
    setResult(null);
    setSnapshot(null);
    setPrevSnapshot(null);
    setRenderState(null);
    // Fresh clock for the new queue attempt (ISS-F5-011: stale timer on Play Again).
    matchStartMsRef.current = 0;
    lastServerMsRef.current = 0;
    lastLocalAtRef.current = 0;
    snapshotRef.current = null;
    prevSnapshotRef.current = null;
    try {
      const sock = connect(backendUrl);
      setConnected(sock.connected);
      const sel = await selectDeck(id, d);
      if (!sel.ok) {
        setError(sel.error ? `${sel.error.code}: ${sel.error.message}` : "deck:select rejected");
        return;
      }
      const ack = await joinQueue(id, d);
      if (!ack.ok) {
        setError(ack.error ? `${ack.error.code}: ${ack.error.message}` : "queue:join rejected");
        return;
      }
      setQueuePosition(typeof ack.position === "number" ? ack.position : null);
      setPhase("searching");
    } catch (e) {
      setError(e instanceof Error ? e.message : "queue join failed");
    }
  }, [backendUrl]);

  /**
   * Starts a real match against the server-side bot (`match:practice`).
   * Used by the BATTLE button on /battle: PvP needs two clients, so a solo
   * player always gets an authoritative AI game instead of an empty queue.
   */
  const joinPractice = useCallback(
    async (difficulty: "easy" | "medium" | "hard" = "medium") => {
      const id = playerIdRef.current.trim();
      const raw = deckRef.current;
      const d = toBattleDeck(raw);
      if (id.length === 0) {
        setError("Missing playerId.");
        return;
      }
      setError(null);
      setResult(null);
      setSnapshot(null);
      setPrevSnapshot(null);
      matchStartMsRef.current = 0;
      snapshotRef.current = null;
      prevSnapshotRef.current = null;
      try {
        const sock = connect(backendUrl);
        setConnected(sock.connected);
        const sel = await selectDeck(id, d);
        if (!sel.ok) {
          setError(sel.error ? `${sel.error.code}: ${sel.error.message}` : "deck:select rejected");
          return;
        }
        const ack = await joinAiMatch(id, d, difficulty);
        if (!ack.ok) {
          setError(ack.error ? `${ack.error.code}: ${ack.error.message}` : "match:practice rejected");
          return;
        }
        setQueuePosition(null);
        setPhase("searching");
      } catch (e) {
        setError(e instanceof Error ? e.message : "practice match failed");
      }
    },
    [backendUrl],
  );

  const leave = useCallback(() => {
    const id = playerIdRef.current.trim();
    if (id.length > 0) {
      try {
        void leaveQueue(id);
      } catch {
        // leave is best-effort/idempotent
      }
    }
    setPhase("idle");
    setMatchId(null);
    setOpponentId(null);
    setQueuePosition(null);
    setSnapshot(null);
    setPrevSnapshot(null);
    setRenderState(null);
    setResult(null);
    setSelected(null);
    setReconnecting(false);
    // Reset clock so idle/searching shows 3:00, not stale mid-game time (ISS-F5-011).
    matchStartMsRef.current = 0;
    lastServerMsRef.current = 0;
    lastLocalAtRef.current = 0;
    snapshotRef.current = null;
    prevSnapshotRef.current = null;
  }, []);

  const resync = useCallback(() => {
    const m = matchIdRef.current;
    if (m) {
      try {
        requestSync(m);
      } catch {
        // socket may be down — reconnect banner stays until snapshots resume
      }
    }
  }, []);

  // Subscriptions: matched / snapshots / end / errors + reconnect handling.
  useEffect(() => {
    let offMatched: (() => void) | null = null;
    let offState: (() => void) | null = null;
    let offEnd: (() => void) | null = null;
    let offErr: (() => void) | null = null;
    try {
      const sock = connect(backendUrl);
      setConnected(sock.connected);
      const handleConnect = () => {
        setConnected(true);
        // Reconnect path (GAME_DESIGN §10): re-request latest snapshot.
        if (matchIdRef.current) {
          setReconnecting(false);
          resync();
        }
      };
      const handleDisconnect = () => {
        setConnected(false);
        if (matchIdRef.current) setReconnecting(true);
      };
      sock.on("connect", handleConnect);
      sock.on("disconnect", handleDisconnect);

      offMatched = onMatched((m: QueueMatched) => {
        trackClock(m.serverTimeMs);
        matchStartMsRef.current = m.serverTimeMs || Date.now();
        setMatchId(m.matchId);
        setSide(m.side);
        setOpponentId(m.opponentId);
        setQueuePosition(null);
        setPhase("in-match");
        setResult(null);
        setSelected(null);
      });
      offState = onStateUpdate((s: StateUpdate) => {
        trackClock(s.serverTimeMs);
        // Flat updates from refs/locals (ISS-F5-006: no nested setState updaters;
        // StrictMode double-invokes updaters, so never call setState inside another updater).
        const cur = snapshotRef.current;
        if (cur && cur.matchId === s.matchId) {
          prevSnapshotRef.current = cur;
          setPrevSnapshot(cur);
        } else {
          prevSnapshotRef.current = null;
          setPrevSnapshot(null);
        }
        snapshotRef.current = s;
        setSnapshot(s);
        // Adopting a snapshot means we are IN that match. Without this the
        // matchId stays null when the page mounts after match:start (the usual
        // case when arriving from the matchmaking loader) and every deploy is
        // rejected with "Not in a match yet".
        if (s.matchId && matchIdRef.current !== s.matchId) {
          matchIdRef.current = s.matchId;
          setMatchId(s.matchId);
        }
        setReconnecting(false);
        setPhase((p) => (p === "ended" ? p : "in-match"));
        if (s.matchId && !matchStartMsRef.current) matchStartMsRef.current = s.serverTimeMs;
      });
      offEnd = onMatchEnd((m: MatchEnd) => {
        setResult(m);
        setPhase("ended");
        setSelected(null);
      });
      offErr = onGameError((e) => {
        setError(e?.matchId ? `${e.code}: ${e.message}` : `${e.code}: ${e.message}`);
      });

      // Prime the server clock for elixir interp + timer.
      sock.emit("ping", { t0: Date.now() });

      return () => {
        sock.off("connect", handleConnect);
        sock.off("disconnect", handleDisconnect);
        offMatched?.();
        offState?.();
        offEnd?.();
        offErr?.();
      };
    } catch {
      // connect() throws only when URL/socket init fails — surface via error.
      setError("socket connect failed — is the backend running?");
      return () => {
        offMatched?.();
        offState?.();
        offEnd?.();
        offErr?.();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  // match:start carries the first snapshot for the lobby→battle transition.
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    const handler = (payload: { matchId?: string; state?: StateUpdate }) => {
      const s = payload?.state;
      if (s && s.matchId) {
        trackClock(s.serverTimeMs);
        matchStartMsRef.current = s.serverTimeMs || Date.now();
        setMatchId(s.matchId);
        setPrevSnapshot(null);
        setSnapshot(s);
        setPhase("in-match");
        setResult(null);
      } else if (payload?.matchId) {
        setMatchId(payload.matchId);
        setPhase("in-match");
      }
    };
    sock.on("match:start", handler);
    return () => {
      sock.off("match:start", handler);
    };
  }, [backendUrl, trackClock]);

  // 60 fps loop: server clock + elixir extrapolation + interp render state.
  // Flat setState only (ISS-F5-006): reads snapshotRef/prevSnapshotRef/sideRef,
  // never calls setState inside another updater (StrictMode-safe).
  // O(v) per frame, v=visible units (toRenderUnits single-pass); elixir O(1).
  // PERF: document.hidden skip (rAF already throttles hidden tabs — explicit
  // per MEMORY#20); game-over dirty-check freezes settled end-frames instead
  // of re-lerping identical snapshots; shared _prevById scratch (no Map alloc).
  useEffect(() => {
    let raf = 0;
    let lastSettledTick = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      // Tab hidden → skip all work (no setState, no interp allocs).
      if (typeof document !== "undefined" && document.hidden) return;
      const base = lastServerMsRef.current;
      const nowLocal = Date.now();
      const serverNow =
        base > 0 ? base + (lastLocalAtRef.current > 0 ? nowLocal - lastLocalAtRef.current : 0) : 0;
      if (serverNow > 0) setServerNowMs(serverNow);
      const cur = snapshotRef.current;
      if (!cur) return;
      // Game over → render the final settled frame once, then freeze.
      if (cur.winner !== undefined && cur.tick === lastSettledTick) return;
      if (cur.winner !== undefined) lastSettledTick = cur.tick;
      if (cur) {
        const mySide = sideRef.current;
        const snapElixir = Number(cur.elixir?.[mySide] ?? 5);
        const elapsed = matchStartMsRef.current > 0 ? Math.max(0, serverNow - matchStartMsRef.current) : 0;
        const rate = elixirRateFor(elapsed);
        const dtSec = Math.max(0, (serverNow - Number(cur.serverTimeMs ?? serverNow)) / 1000);
        const interp = Math.min(10, snapElixir + rate * dtSec);
        setDisplayElixir(Math.floor(interp * 100) / 100);
        setElixirProgress(interp - Math.floor(interp));
        const prev = prevSnapshotRef.current;
        const renderTime = serverNow - INTERP_DELAY_MS;
        setRenderState({
          matchId: cur.matchId,
          tick: cur.tick,
          serverTimeMs: serverNow,
          towers: cur.towers,
          units: toRenderUnits(prev, cur, renderTime),
          crowns: cur.crowns,
          winner: cur.winner,
          endsAtMs: cur.endsAtMs,
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const selectCard = useCallback(
    (index: number | null) => {
      setSelected((cur) => (cur === index ? null : index));
    },
    [],
  );

  const deploy = useCallback(
    async (handIndex: number, x: number, y: number): Promise<DeployResult> => {
      const m = matchIdRef.current;
      const id = playerIdRef.current.trim();
      if (!m) return { ok: false, error: "not in a match yet" };
      if (id.length === 0) return { ok: false, error: "missing playerId" };
      if (handIndex < 0 || handIndex > 3) return { ok: false, error: "BAD_HAND_INDEX" };
      try {
        const sock = getSocket();
        const clientTick = snapshotRef.current ? snapshotRef.current.tick : snapshot ? snapshot.tick : undefined;
        const ack = await playCard({
          matchId: m,
          playerId: id,
          handIndex,
          x,
          y,
          clientTick,
        });
        void sock;
        if (!ack.ok) {
          const code = ack.error?.code ?? "CARD_REJECTED";
          const msg = ack.error?.message ?? "card rejected";
          setError(`${code}: ${msg}`);
          return { ok: false, error: code };
        }
        // Optimistic hand cycle (server truth arrives via next snapshots;
        // no hand array on the wire in Phase 5).
        // Flat updates (ISS-F5-006): compute from refs/locals, then sequential
        // setHand/setQueue — never nested — so StrictMode double-invoke cannot
        // rotate twice per deploy.
        const curHand = handRef.current;
        const curQueue = queueRef.current;
        if (curQueue.length > 0) {
          const incoming = curQueue[0];
          const rest = curQueue.slice(1);
          const played = curHand[handIndex];
          const nextHand = curHand.slice();
          nextHand[handIndex] = incoming;
          const nextQueue = [...rest, played];
          handRef.current = nextHand;
          queueRef.current = nextQueue;
          setHand(nextHand);
          setQueue(nextQueue);
        }
        setSelected(null);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "card:play failed";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [snapshot],
  );

  const clearError = useCallback(() => setError(null), []);

  // Clock derivation (GAME_DESIGN §8 + ISS-F5-004):
  // - Double-elixir (t>=120s through hard cap) is a RATE hint, NOT overtime.
  // - Overtime (sudden death) is true ONLY when the server signals OT
  //   (snapshot.overtime / extraTime / isOvertime forward-compat) OR
  //   elapsed>180s with no winner yet — never on t>=120s alone.
  // - Regulation counts 180->0; OT counts 60->0 toward the 240s hard cap;
  //   idle/searching shows 180 (ISS-F5-011 stale-timer guard).
  const { timeLeftSec, isOvertime, isDoubleElixir } = useMemo(() => {
    if (phase !== "in-match" && phase !== "ended") {
      return { timeLeftSec: 180, isOvertime: false, isDoubleElixir: false };
    }
    const snapAny = snapshot as unknown as Record<string, unknown> | null;
    const serverFlag =
      !!snapAny &&
      (snapAny["overtime"] === true ||
        snapAny["extraTime"] === true ||
        (snapAny as { isOvertime?: unknown })["isOvertime"] === true);
    if (!matchStartMsRef.current || serverNowMs <= 0) {
      return { timeLeftSec: 180, isOvertime: Boolean(serverFlag), isDoubleElixir: false };
    }
    const elapsedMs = Math.max(0, serverNowMs - matchStartMsRef.current);
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const noWinner = !snapshot?.winner && !result?.winner;
    const overtime = Boolean(serverFlag || (elapsedMs > REGULATION_MS && noWinner && phase === "in-match"));
    const doubleElixir = elapsedMs >= DOUBLE_ELIXIR_AT_MS;
    let left: number;
    if (elapsedMs <= REGULATION_MS) left = 180 - elapsedSec;
    else if (elapsedMs <= HARD_CAP_MS) left = Math.max(0, Math.floor((HARD_CAP_MS - elapsedMs) / 1000));
    else left = 0;
    return { timeLeftSec: left, isOvertime: overtime, isDoubleElixir: doubleElixir };
  }, [serverNowMs, phase, snapshot, result]);

  const nextCard = queue.length > 0 ? queue[0] : null;

  return {
    phase,
    connected,
    reconnecting,
    matchId,
    side,
    opponentId,
    queuePosition,
    snapshot,
    renderState,
    displayElixir,
    elixirProgress,
    hand,
    nextCard,
    selected,
    selectCard,
    deploy,
    serverNowMs,
    timeLeftSec,
    isOvertime,
    isDoubleElixir,
    result,
    error,
    clearError,
    join,
    joinPractice,
    leave,
    resync,
  };
}

/** Disconnect the shared socket (route unmount / Play Again reset). */
export function disconnectBattle(): void {
  try {
    disconnect();
  } catch {
    // safe when never connected
  }
}
