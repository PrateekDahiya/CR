/**
 * frontend/lib/socket.ts — Socket.io client wrapper for CR Clone.
 *
 * Covers GAME_DESIGN.md §12 protocol (canonical events + legacy twins):
 *  - client -> server: queue:join, queue:leave, deck:select, card:play,
 *    emote:send, ping, match:sync
 *  - server -> client: queue:matched (+ match:found twin), match:start,
 *    state:update (10 Hz, canonical snapshot), match:end,
 *    error + error:game twins, pong
 *
 * Tracks `serverTimeMs` from queue:matched / state:update / pong so the
 * 60fps renderer (Phase 5) can interpolate against server clock, never local.
 *
 * Read-only sibling note (MEMORY#16): app shell + deck UI live in
 * frontend/app/* and frontend/components/deck/* (other agents) — this file
 * owns transport only and must not import UI components.
 */

import { io, type Socket } from "socket.io-client";

export type PlayerSide = "blue" | "red";

export interface Vec2 {
  x: number;
  y: number;
}

/** Minimal snapshot shape — structurally compatible with shared/types.ts GameState. */
export interface StateUpdate {
  matchId: string;
  tick: number;
  serverTimeMs: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elixir: Record<PlayerSide, number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  towers: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  units: any[];
  crowns: Record<PlayerSide, number>;
  winner?: PlayerSide | "draw";
  endsAtMs?: number;
}

export interface QueueMatched {
  matchId: string;
  opponentId: string;
  side: PlayerSide;
  serverTimeMs: number;
}

export interface MatchEnd {
  matchId: string;
  winner: PlayerSide | "draw";
  crowns: Record<PlayerSide, number>;
}

export interface GameError {
  code: string;
  message: string;
  matchId?: string;
}

export interface Ack {
  ok: boolean;
  position?: number;
  error?: { code: string; message: string };
}

export interface CardPlayArgs {
  matchId: string;
  playerId: string;
  handIndex: number; // 0..3, authoritative (server resolves via handIndex)
  x: number; // arena units [0,18]
  y: number; // arena units [0,32]
  cardId?: string; // back-compat echo; mismatch -> CARD_REJECTED
  at?: Vec2; // back-compat alias for {x,y}
  clientTick?: number; // stale rejection when |Δ| > 5 ticks
}

type Unsubscribe = () => void;

let socket: Socket | null = null;
let autoConnectUrl: string | null = null;
let lastServerTimeMs = 0;

function trackServerTime(value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    lastServerTimeMs = value;
  }
}

/** Last observed server clock. 0 until the first server event arrives. */
export function getLastServerTimeMs(): number {
  return lastServerTimeMs;
}

/** Current singleton socket (null until connect() is called). */
export function getSocket(): Socket | null {
  return socket;
}

// Auto-connect singleton used by matchmaking loader / home Battle. Returns a
// stable wrapper that exposes joinQueue / leaveQueue / selectDeck / onMatched
// / onGameError, hiding the underlying Socket.io instance.
export interface SocketClient {
  socket: Socket | null;
  joinQueue: (playerId: string, deck?: string[]) => void;
  /** Instant real match vs the server-side bot (match:practice). */
  joinAiMatch: (playerId: string, deck: string[], difficulty?: "easy" | "medium" | "hard") => void;
  leaveQueue: (playerId?: string) => void;
  selectDeck: (playerId: string, deck: string[]) => void;
  onMatched: (cb: (matchId: string, side: "blue" | "red", opponentId?: string) => void) => Unsubscribe;
  onGameError: (cb: (code: string, message: string) => void) => Unsubscribe;
  close: () => void;
}

function wrapSocket(s: Socket | null): SocketClient {
  return {
    socket: s,
    joinQueue: (playerId, deck) => {
      if (!s) return;
      const payload: Record<string, unknown> = { playerId };
      if (deck) payload.deck = deck;
      s.emit("queue:join", payload);
    },
    joinAiMatch: (playerId, deck, difficulty) => {
      if (!s) return;
      s.emit("match:practice", { playerId, deck, ...(difficulty ? { difficulty } : {}) });
    },
    leaveQueue: (playerId) => {
      if (!s) return;
      s.emit("queue:leave", playerId ? { playerId } : {});
    },
    selectDeck: (playerId, deck) => {
      if (!s) return;
      s.emit("deck:select", { playerId, deck });
    },
    onMatched: (cb) => {
      if (!s) return () => {};
      // Both twins can fire for the same match. The canonical `queue:matched`
      // carries the authoritative side; the legacy twin must never flip it
      // (that bug put BOTH players on blue).
      let canonical = "";
      const handler = (payload: { matchId: string; opponentId?: string; side?: "blue" | "red" }) => {
        const side = payload.side ?? "blue";
        if (payload.side !== undefined) canonical = payload.matchId;
        else if (canonical === payload.matchId) return;
        cb(payload.matchId, side, payload.opponentId);
      };
      s.on("queue:matched", handler);
      s.on("match:found", handler);
      return () => {
        s.off("queue:matched", handler);
        s.off("match:found", handler);
      };
    },
    onGameError: (cb) => {
      if (!s) return () => {};
      let lastKey = "";
      let lastAt = 0;
      const handler = (e: { code: string; message: string }) => {
        const key = JSON.stringify(e ?? null);
        const now = Date.now();
        if (key === lastKey && now - lastAt < 100) return;
        lastKey = key;
        lastAt = now;
        cb(e?.code ?? "ERROR", e?.message ?? "");
      };
      s.on("error", handler);
      s.on("error:game", handler);
      return () => {
        s.off("error", handler);
        s.off("error:game", handler);
      };
    },
    close: () => {
      // no-op for singleton; matchmaking loader will route away on match.
    },
  };
}

function ensureConnected(): Socket | null {
  if (socket !== null) return socket;
  if (!autoConnectUrl) return null;
  try {
    socket = io(autoConnectUrl, { transports: ["websocket", "polling"], reconnection: true });
    autoBindSocket(socket);
  } catch {
    socket = null;
  }
  return socket;
}

function autoBindSocket(s: Socket): void {
  s.on("queue:matched", (payload: QueueMatched) => {
    trackServerTime(payload?.serverTimeMs);
  });
  s.on("match:found", () => {
    // legacy twin
  });
  s.on("match:start", (payload: { state?: StateUpdate }) => {
    trackServerTime(payload?.state?.serverTimeMs);
  });
  s.on("state:update", (state: StateUpdate) => {
    trackServerTime(state?.serverTimeMs);
  });
  s.on("pong", (payload: { serverTime?: number; serverTimeMs?: number }) => {
    trackServerTime(payload?.serverTime ?? payload?.serverTimeMs);
  });
}

/**
 * Get-or-create a SocketClient bound to the given backend URL. Idempotent;
 * callers can call this in render safely.
 */
export function getSocketClient(url: string): SocketClient {
  if (socket === null || (autoConnectUrl && autoConnectUrl !== url)) {
    autoConnectUrl = url;
    if (socket !== null) {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch {
        // ignore
      }
      socket = null;
    }
    try {
      socket = io(url, { transports: ["websocket", "polling"], reconnection: true });
      autoBindSocket(socket);
    } catch {
      socket = null;
    }
  } else if (!socket.connected) {
    // already a socket, will auto-reconnect via Socket.io
  }
  return wrapSocket(socket);
}

/**
 * Connect (or reuse) the singleton socket for the given backend URL.
 * Backwards-compatible: returns the raw socket.
 */
export function connect(url: string): Socket {
  return getSocketClient(url).socket ?? ensureConnected() ?? io(url, { transports: ["websocket", "polling"] });
}

/** Disconnect and clear the singleton. Safe to call when not connected. */
export function disconnect(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

function requireSocket(): Socket {
  if (socket === null) {
    throw new Error("socket not connected — call connect(url) first");
  }
  return socket;
}

function emitWithAck(event: string, payload: unknown, timeoutMs = 5000): Promise<Ack> {
  const s = requireSocket();
  return new Promise<Ack>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), timeoutMs);
    s.emit(event, payload, (res: Ack) => {
      clearTimeout(timer);
      resolve(res ?? { ok: true });
    });
  });
}

/** Request matchmaking. Deck must be 8 distinct card ids (GAME_DESIGN §4/§11). */
export function joinQueue(playerId: string, deck: string[]): Promise<Ack> {
  return emitWithAck("queue:join", { playerId, deck });
}

/**
 * Instant practice match against the server-side AI bot. The server creates a
 * real authoritative room (blue = you, red = bot) and answers with
 * queue:matched — so every gameplay event works exactly like PvP.
 */
export function joinAiMatch(
  playerId: string,
  deck: string[],
  difficulty: "easy" | "medium" | "hard" = "medium",
): Promise<Ack> {
  return emitWithAck("match:practice", { playerId, deck, difficulty });
}

/** Leave matchmaking. Idempotent — server acks ok even if not queued. */
export function leaveQueue(playerId: string): Promise<Ack> {
  return emitWithAck("queue:leave", { playerId });
}

/** Lock/select deck pre-queue (lobby/deck-builder). Validates without queueing. */
export function selectDeck(playerId: string, deck: string[]): Promise<Ack> {
  return emitWithAck("deck:select", { playerId, deck });
}

/** Core gameplay intent — validated + applied on the next 10 Hz server tick. */
export function playCard(args: CardPlayArgs): Promise<Ack> {
  const { matchId, playerId, handIndex, x, y, cardId, at, clientTick } = args;
  return emitWithAck("card:play", {
    matchId,
    playerId,
    handIndex,
    x,
    y,
    ...(cardId !== undefined ? { cardId } : {}),
    ...(at !== undefined ? { at } : {}),
    ...(clientTick !== undefined ? { clientTick } : {}),
  });
}

/** Cosmetic emote relay. Rate-limited server-side to 1 per 5 s. */
export function sendEmote(matchId: string, playerId: string, emoteId: string): Promise<Ack> {
  return emitWithAck("emote:send", { matchId, playerId, emoteId });
}

/** RTT / clock-offset probe. Resolves with the server timestamp. */
export function ping(payload: unknown = null, timeoutMs = 5000): Promise<number> {
  const s = requireSocket();
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ping timeout")), timeoutMs);
    s.emit("ping", payload);
    s.once("pong", (res: { received?: unknown; serverTime?: number; serverTimeMs?: number }) => {
      clearTimeout(timer);
      const t = res?.serverTime ?? res?.serverTimeMs ?? 0;
      trackServerTime(t);
      resolve(t);
    });
  });
}

/** Reconnect helper (GAME_DESIGN §10): re-request the latest snapshot. */
export function requestSync(matchId: string): void {
  requireSocket().emit("match:sync", { matchId });
}

/** Subscribe to the canonical 10 Hz snapshot stream. */
export function onStateUpdate(cb: (state: StateUpdate) => void): Unsubscribe {
  const s = requireSocket();
  const handler = (state: StateUpdate): void => {
    trackServerTime(state?.serverTimeMs);
    cb(state);
  };
  s.on("state:update", handler);
  return () => {
    s.off("state:update", handler);
  };
}

/** Subscribe to matchmaking hits (canonical queue:matched + legacy match:found). */
export function onMatched(cb: (m: QueueMatched) => void): Unsubscribe {
  const s = requireSocket();
  let canonical = "";
  const handler = (m: QueueMatched): void => {
    trackServerTime(m?.serverTimeMs);
    if (typeof m?.side === "string") canonical = m.matchId;
    cb(m);
  };
  // Legacy twin: same match, no authoritative side -> never override.
  const legacy = (m: { matchId: string; opponentId: string; side?: "blue" | "red"; serverTimeMs?: number }): void => {
    if (canonical === m.matchId) return;
    trackServerTime(m?.serverTimeMs);
    cb({
      matchId: m.matchId,
      opponentId: m.opponentId,
      side: m.side ?? "blue",
      serverTimeMs: getLastServerTimeMs(),
    });
  };
  s.on("queue:matched", handler);
  s.on("match:found", legacy);
  return () => {
    s.off("queue:matched", handler);
    s.off("match:found", legacy);
  };
}

/** Subscribe to terminal match results. */
export function onMatchEnd(cb: (m: MatchEnd) => void): Unsubscribe {
  const s = requireSocket();
  s.on("match:end", cb);
  return () => {
    s.off("match:end", cb);
  };
}

/**
 * Subscribe to game errors. The server twin-emits `error` + `error:game`
 * with identical payloads (GAME_DESIGN §12.7) — duplicates within 100 ms
 * are coalesced so UI toasts fire once.
 */
export function onGameError(cb: (e: GameError) => void): Unsubscribe {
  const s = requireSocket();
  let lastKey = "";
  let lastAt = 0;
  const handler = (e: GameError): void => {
    const key = JSON.stringify(e ?? null);
    const now = Date.now();
    if (key === lastKey && now - lastAt < 100) return;
    lastKey = key;
    lastAt = now;
    cb(e);
  };
  s.on("error", handler);
  s.on("error:game", handler);
  return () => {
    s.off("error", handler);
    s.off("error:game", handler);
  };
}
