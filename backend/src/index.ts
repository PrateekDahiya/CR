import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import {
  joinQueue,
  leaveQueue,
  tryMatch,
  setDeck,
  getDeck,
} from "./matchmaking.js";
import {
  getRoom,
  getSide,
  getHand,
  getPocketFor,
  applyEnginePlay,
  broadcastState,
  startTickLoop,
  type PlayerSide,
} from "./net/rooms.js";
import {
  validateDeck,
  validateHand,
  validateElixir,
  validateTick,
  validatePosition,
  checkPlayRate,
  checkEmoteRate,
  getCardCost,
} from "./net/validation.js";
import { initRedis } from "./net/redis.js";
import { mountMeta } from "./meta.js";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backend" });
});

mountMeta(app);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

void initRedis().catch((err) => {
  console.warn(`[backend] redis init failed (memory fallback): ${String(err)}`);
});

// --- Socket protocol (GAME_DESIGN.md §12; canonical + legacy twins) ---

interface AckError {
  code: string;
  message: string;
}

interface Ack {
  ok: boolean;
  position?: number;
  error?: AckError;
}

type AckFn = (res: Ack) => void;

interface QueueJoinPayload {
  playerId?: string;
  deck?: string[];
}

interface LegacyJoinPayload {
  matchId?: string;
  playerId?: string;
  deck?: string[];
}

interface CardPlayPayload {
  matchId?: string;
  playerId?: string;
  handIndex?: number;
  x?: number;
  y?: number;
  cardId?: string;
  at?: { x?: number; y?: number };
  clientTick?: number;
}

interface EmotePayload {
  matchId?: string;
  playerId?: string;
  emoteId?: string;
}

/** socket.id -> playerId and playerId -> latest socket.id (reconnect-safe). */
const socketPlayer = new Map<string, string>();
const playerSocket = new Map<string, string>();

function emitErrorTwins(socket: Socket, code: string, message: string, matchId?: string): void {
  const payload = matchId === undefined ? { code, message } : { code, message, matchId };
  socket.emit("error", payload);
  socket.emit("error:game", payload);
}

function fail(socket: Socket, ack: AckFn | undefined, code: string, message: string, matchId?: string): void {
  ack?.({ ok: false, error: { code, message } });
  emitErrorTwins(socket, code, message, matchId);
}

function handleQueueJoin(socket: Socket, payload: QueueJoinPayload, ack?: AckFn): void {
  const playerId = payload?.playerId;
  if (typeof playerId !== "string" || playerId.length === 0) {
    fail(socket, ack, "BAD_DECK", "playerId is required");
    return;
  }
  const deck = payload?.deck ?? getDeck(playerId);
  const checked = validateDeck(deck);
  if (!checked.ok) {
    fail(socket, ack, checked.code ?? "BAD_DECK", checked.message ?? "invalid deck");
    return;
  }
  const validDeck = deck as string[];
  setDeck(playerId, validDeck);
  const { position } = joinQueue(socket.id, playerId, validDeck);
  socketPlayer.set(socket.id, playerId);
  playerSocket.set(playerId, socket.id);
  ack?.({ ok: true, position });

  const matched = tryMatch();
  if (matched === null) {
    return;
  }
  const { matchId, blue, red } = matched;
  const room = getRoom(matchId);
  if (room === undefined) {
    return;
  }
  io.sockets.sockets.get(blue.socketId)?.join(matchId);
  io.sockets.sockets.get(red.socketId)?.join(matchId);
  const serverTimeMs = Date.now();
  const blueSocket = io.sockets.sockets.get(blue.socketId);
  const redSocket = io.sockets.sockets.get(red.socketId);
  blueSocket?.emit("queue:matched", {
    matchId,
    opponentId: red.playerId,
    side: "blue" satisfies PlayerSide,
    serverTimeMs,
  });
  blueSocket?.emit("match:found", { matchId, opponentId: red.playerId });
  redSocket?.emit("queue:matched", {
    matchId,
    opponentId: blue.playerId,
    side: "red" satisfies PlayerSide,
    serverTimeMs,
  });
  redSocket?.emit("match:found", { matchId, opponentId: blue.playerId });
  io.to(matchId).emit("match:start", { matchId, state: room.state });
  broadcastState(io, room);
  startTickLoop(io, matchId);
}

function handleCardPlay(socket: Socket, payload: CardPlayPayload, ack?: AckFn): void {
  const matchId = payload?.matchId;
  const playerId = payload?.playerId;
  if (typeof matchId !== "string" || typeof playerId !== "string") {
    fail(socket, ack, "CARD_REJECTED", "matchId and playerId are required", matchId);
    return;
  }
  const room = getRoom(matchId);
  if (room === undefined) {
    fail(socket, ack, "CARD_REJECTED", "unknown match", matchId);
    return;
  }
  const side = playerId.length > 0 ? getSide(room, playerId) : null;
  if (side === null) {
    fail(socket, ack, "CARD_REJECTED", "not a participant of this match", matchId);
    return;
  }
  const rate = checkPlayRate(playerId);
  if (!rate.ok) {
    fail(socket, ack, rate.code ?? "RATE_LIMITED", rate.message ?? "rate-limited", matchId);
    return;
  }
  const stale = validateTick(payload?.clientTick, room.state.tick);
  if (!stale.ok) {
    fail(socket, ack, stale.code ?? "STALE_TICK", stale.message ?? "stale tick", matchId);
    return;
  }
  const hand = getHand(room, side);
  const handIndex = payload?.handIndex;
  const hv = validateHand(handIndex, hand, payload?.cardId);
  if (!hv.ok) {
    fail(socket, ack, hv.code ?? "BAD_HAND_INDEX", hv.message ?? "bad hand", matchId);
    return;
  }
  const slot = handIndex as number;
  const cardId = hand[slot] as string;
  const cost = getCardCost(cardId);
  if (cost === null) {
    fail(socket, ack, "CARD_REJECTED", `unknown card: ${cardId}`, matchId);
    return;
  }
  const ev = validateElixir(room.state.elixir[side], cost);
  if (!ev.ok) {
    fail(socket, ack, ev.code ?? "NO_ELIXIR", ev.message ?? "insufficient elixir", matchId);
    return;
  }
  const x = payload?.x ?? payload?.at?.x;
  const y = payload?.y ?? payload?.at?.y;
  const pv = validatePosition(side, x, y, cardId, getPocketFor(room, side));
  if (!pv.ok) {
    fail(socket, ack, pv.code ?? "BAD_POSITION", pv.message ?? "bad position", matchId);
    return;
  }
  const applied = applyEnginePlay(room, side, slot, x as number, y as number, cardId, matchId, playerId);
  if (!applied.ok) {
    fail(socket, ack, applied.code ?? "CARD_REJECTED", applied.message ?? "card rejected", matchId);
    return;
  }
  ack?.({ ok: true });
}

function handleEmote(socket: Socket, payload: EmotePayload, ack?: AckFn): void {
  const matchId = payload?.matchId;
  const playerId = payload?.playerId;
  const emoteId = payload?.emoteId;
  if (typeof matchId !== "string" || typeof playerId !== "string" || typeof emoteId !== "string") {
    fail(socket, ack, "CARD_REJECTED", "matchId, playerId and emoteId are required", matchId);
    return;
  }
  const room = getRoom(matchId);
  if (room === undefined || getSide(room, playerId) === null) {
    fail(socket, ack, "CARD_REJECTED", "not a participant of this match", matchId);
    return;
  }
  const throttled = checkEmoteRate(playerId);
  if (!throttled.ok) {
    ack?.({ ok: false, error: { code: "RATE_LIMITED", message: "emote rate-limited (1 per 5s)" } });
    return;
  }
  ack?.({ ok: true });
  // Cosmetic relay only — never touches simulation state.
  io.to(matchId).emit("emote:send", { matchId, playerId, emoteId });
}

io.on("connection", (socket) => {
  console.log(`[backend] client connected: ${socket.id}`);

  // Ping/pong probe for RTT + client clock offset (10Hz interp). Kept verbatim.
  socket.on("ping", (payload?: unknown) => {
    socket.emit("pong", {
      received: payload ?? null,
      serverTime: Date.now(),
    });
  });

  socket.on("queue:join", (payload: QueueJoinPayload, ack?: AckFn) => {
    handleQueueJoin(socket, payload, ack);
  });

  // Legacy alias: matchId is ignored, treated as queue:join (§11/§12.3).
  socket.on("match:join", (payload: LegacyJoinPayload, ack?: AckFn) => {
    handleQueueJoin(socket, { playerId: payload?.playerId, deck: payload?.deck }, ack);
  });

  socket.on("queue:leave", (payload: { playerId?: string }, ack?: AckFn) => {
    leaveQueue(socket.id);
    if (typeof payload?.playerId === "string") {
      leaveQueue(payload.playerId);
    }
    ack?.({ ok: true });
  });

  // Legacy alias for queue:leave.
  socket.on("match:leave", (payload: { playerId?: string }, ack?: AckFn) => {
    leaveQueue(socket.id);
    if (typeof payload?.playerId === "string") {
      leaveQueue(payload.playerId);
    }
    ack?.({ ok: true });
  });

  socket.on("deck:select", (payload: QueueJoinPayload, ack?: AckFn) => {
    const playerId = payload?.playerId;
    const checked = validateDeck(payload?.deck);
    if (typeof playerId !== "string" || playerId.length === 0 || !checked.ok) {
      fail(socket, ack, checked.code ?? "BAD_DECK", checked.message ?? "invalid deck");
      return;
    }
    setDeck(playerId, payload.deck as string[]);
    ack?.({ ok: true });
  });

  socket.on("card:play", (payload: CardPlayPayload, ack?: AckFn) => {
    handleCardPlay(socket, payload, ack);
  });

  socket.on("emote:send", (payload: EmotePayload, ack?: AckFn) => {
    handleEmote(socket, payload, ack);
  });

  // Reconnect helper (§10): client re-requests the latest snapshot.
  socket.on("match:sync", (payload: { matchId?: string }) => {
    const room = typeof payload?.matchId === "string" ? getRoom(payload.matchId) : undefined;
    if (room !== undefined) {
      socket.emit("state:update", room.state);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[backend] client disconnected: ${socket.id} (${reason})`);
    const playerId = socketPlayer.get(socket.id);
    leaveQueue(socket.id);
    if (playerId !== undefined) {
      leaveQueue(playerId);
      socketPlayer.delete(socket.id);
      if (playerSocket.get(playerId) === socket.id) {
        playerSocket.delete(playerId);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});
