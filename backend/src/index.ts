import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import {
  joinQueue,
  leaveQueue,
  leaveQueueBySocket,
  tryMatch,
  setDeck,
  getDeck,
} from "./matchmaking.js";
import {
  getRoom,
  getSide,
  getSideForClient,
  rebindPlayerSocket,
  getActiveMatchForPlayer,
  getHand,
  getPocketFor,
  applyEnginePlay,
  broadcastState,
  startTickLoop,
  stopTickLoop,
  forfeit,
  createRoom,
  setRoomEndedHandler,
  type PlayerSide,
} from "./net/rooms.js";
import { botDeckFor, startBotLoop, stopBotLoop, stopAllBotLoops } from "./ai.js";
import {
  validateDeck,
  validateHand,
  validateElixir,
  validateTick,
  validatePosition,
  checkPlayRate,
  checkEmoteRate,
  getCardCost,
  validateCardLevels,
  validateTowerTroopId,
} from "./net/validation.js";
import { initRedis } from "./net/redis.js";
import { mountMeta } from "./meta.js";
import { mountContent } from "./content.js";
import { mountShop } from "./shop.js";
import { mountAdmin } from "./admin.js";
import { battleLevelsFor, ensurePlayer, hydratePlayers } from "./players.js";
import { ensureAdminAccount, hydrateAccounts } from "./accounts.js";
import { loadPlayerState } from "./playerStore.js";
import { ensureMysqlDatabase, hydrateLevelStatsFromMysql, hydrateMechanicsFromMysql, hydrateSpawnTemplatesFromMysql, isMysqlConfigured } from "./mysql.js";
import { CARD_LIST } from "./game/cards.js";
import { listGameModes, parseGameMode } from "./game/modes.js";
import { hydrateBattleLog } from "./battleLog.js";
import {
  hydrateTournaments,
  markTournamentReady,
  registerTournamentMatch,
} from "./tournaments.js";
import { finishReplay, recordReplayFrame } from "./replays.js";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backend" });
});

/**
 * Public game-mode registry for the home-screen picker. One source of truth:
 * the client renders whatever this returns (no second hard-coded mode list).
 */
app.get("/game-modes", (_req, res) => {
  res.json({ modes: listGameModes() });
});

mountMeta(app);
mountContent(app);
mountShop(app);
mountAdmin(app);

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
  levels?: Record<string, number>;
  towerTroopId?: string;
  modeId?: string;
}

interface LegacyJoinPayload {
  matchId?: string;
  playerId?: string;
  deck?: string[];
  levels?: Record<string, number>;
  towerTroopId?: string;
  modeId?: string;
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

/**
 * Practice match vs the AI bot: the player is always blue and the server owns
 * the red side. The room is a normal authoritative room (same engine, same
 * validation), so `card:play`, `state:update` and `match:end` all work exactly
 * like PvP — no fake match ids, no client-side simulation.
 */
function handlePracticeMatch(
  socket: Socket,
  payload: { playerId?: string; deck?: string[]; difficulty?: string; levels?: Record<string, number>; towerTroopId?: string; modeId?: string; foeDeck?: string[] },
  ack?: AckFn,
): void {
  const playerId = payload?.playerId;
  if (typeof playerId !== "string" || playerId.length === 0) {
    fail(socket, ack, "BAD_PLAYER", "playerId is required");
    return;
  }
  const parsedMode = parseGameMode(payload?.modeId);
  if (!parsedMode.ok) {
    fail(socket, ack, parsedMode.code, parsedMode.message);
    return;
  }
  const mode = parsedMode.mode;
  const deck = payload?.deck ?? getDeck(playerId);
  const checked = validateDeck(deck);
  if (!checked.ok) {
    fail(socket, ack, checked.code ?? "BAD_DECK", checked.message ?? "invalid deck");
    return;
  }
  const validDeck = deck as string[];
  const levels = validateCardLevels(payload.levels, validDeck, payload.towerTroopId);
  const towerTroop = validateTowerTroopId(payload.towerTroopId);
  if (!levels.ok) {
    fail(socket, ack, levels.code ?? "BAD_DECK", levels.message ?? "invalid level selection");
    return;
  }
  if (!towerTroop.ok) {
    fail(socket, ack, towerTroop.code ?? "BAD_DECK", towerTroop.message ?? "invalid tower troop");
    return;
  }
  const difficulty = payload?.difficulty === "hard" || payload?.difficulty === "easy"
    ? payload.difficulty
    : "medium";
  const matchId = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Practice against a specific opponent deck (the battle log "Practice"
  // button replays the deck the player faced). Falls back to the generated
  // bot deck when the requested one is not a legal 8-card deck.
  const requestedFoeDeck = Array.isArray(payload.foeDeck) ? payload.foeDeck.slice(0, 8) : [];
  const foeDeckCheck = validateDeck(requestedFoeDeck);
  const botDeck = foeDeckCheck.ok ? requestedFoeDeck : botDeckFor(matchId);
  // AI fairness: every bot card is normalized to the player deck's average
  // owned-card level, so a level-5 player never faces level-15 bots.
  const playerProfile = ensurePlayer(playerId);
  const resolvedLevels = battleLevelsFor(playerId, validDeck, payload.towerTroopId, (levels as { levels: Record<string, number> }).levels);
  const averageLevel = Math.max(
    1,
    Math.min(
      16,
      Math.round(
        validDeck.reduce((sum, id) => sum + (playerProfile.cards[id] ?? 1), 0) / validDeck.length,
      ),
    ),
  );
  const botLevels = Object.fromEntries(botDeck.map((id) => [id, averageLevel]));
  const botTowerTroopId = payload.towerTroopId ?? "tower-princess";
  const playerKingLevel = Math.max(1, Math.min(16, Math.trunc(playerProfile.kingLevel ?? 1)));
  const playerTowerLevel = Math.max(
    playerKingLevel,
    Math.min(16, Math.trunc(playerProfile.towerLevels?.[botTowerTroopId] ?? playerKingLevel)),
  );
  botLevels["king-tower"] = playerKingLevel;
  botLevels[botTowerTroopId] = playerTowerLevel;
  const room = createRoom(
    matchId,
    { playerId, socketId: socket.id, deck: validDeck, levels: resolvedLevels, towerTroopId: payload.towerTroopId },
    { playerId: `bot-${matchId}`, socketId: `bot-${matchId}`, deck: botDeck, levels: botLevels, towerTroopId: botTowerTroopId },
    mode.id,
  );
  socketPlayer.set(socket.id, playerId);
  playerSocket.set(playerId, socket.id);
  socket.join(matchId);
  const serverTimeMs = Date.now();
  const opponentId = `AI (${difficulty})`;
  socket.emit("queue:matched", {
    matchId,
    opponentId,
    side: "blue" satisfies PlayerSide,
    serverTimeMs,
    modeId: mode.id,
    mode,
    matchType: "ai",
    difficulty,
  });
  socket.emit("match:found", { matchId, opponentId, modeId: mode.id, mode });
  socket.emit("match:start", { matchId, state: room.state });
  broadcastState(io, room);
  startTickLoop(io, matchId);
  startBotLoop(io, room, difficulty);
  ack?.({ ok: true });
}

function handleQueueJoin(socket: Socket, payload: QueueJoinPayload, ack?: AckFn): void {
  const playerId = payload?.playerId;
  if (typeof playerId !== "string" || playerId.length === 0) {
    fail(socket, ack, "BAD_DECK", "playerId is required");
    return;
  }
  const parsedMode = parseGameMode(payload?.modeId);
  if (!parsedMode.ok) {
    fail(socket, ack, parsedMode.code, parsedMode.message);
    return;
  }
  const mode = parsedMode.mode;
  const deck = payload?.deck ?? getDeck(playerId);
  const checked = validateDeck(deck);
  if (!checked.ok) {
    fail(socket, ack, checked.code ?? "BAD_DECK", checked.message ?? "invalid deck");
    return;
  }
  const validDeck = deck as string[];
  const levels = validateCardLevels(payload.levels, validDeck, payload.towerTroopId);
  const towerTroop = validateTowerTroopId(payload.towerTroopId);
  if (!levels.ok) {
    fail(socket, ack, levels.code ?? "BAD_DECK", levels.message ?? "invalid level selection");
    return;
  }
  if (!towerTroop.ok) {
    fail(socket, ack, towerTroop.code ?? "BAD_DECK", towerTroop.message ?? "invalid tower troop");
    return;
  }
  setDeck(playerId, validDeck);
  const resolvedLevels = battleLevelsFor(playerId, validDeck, payload.towerTroopId, (levels as { levels: Record<string, number> }).levels);
  const { position } = joinQueue(socket.id, playerId, validDeck, resolvedLevels, payload.towerTroopId, mode.id);
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
  const modeId = room.state.modeId;
  const matchMode = room.state.mode;
  // NOTE: the legacy `match:found` twin MUST carry the same `side`, otherwise
  // clients that listen to both events flip the red player to blue.
  blueSocket?.emit("queue:matched", {
    matchId,
    opponentId: red.playerId,
    side: "blue" satisfies PlayerSide,
    serverTimeMs,
    modeId,
    mode: matchMode,
  });
  blueSocket?.emit("match:found", {
    matchId,
    opponentId: red.playerId,
    side: "blue" satisfies PlayerSide,
    serverTimeMs,
    modeId,
    mode: matchMode,
  });
  redSocket?.emit("queue:matched", {
    matchId,
    opponentId: blue.playerId,
    side: "red" satisfies PlayerSide,
    serverTimeMs,
    modeId,
    mode: matchMode,
  });
  redSocket?.emit("match:found", {
    matchId,
    opponentId: blue.playerId,
    side: "red" satisfies PlayerSide,
    serverTimeMs,
    modeId,
    mode: matchMode,
  });
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
  const side = getSideForClient(room, socket.id, playerId);
  if (side === null) {
    fail(socket, ack, "CARD_REJECTED", "not a participant of this match", matchId);
    return;
  }
  // Rate-limit per live client (socket), not per playerId: two players can share
  // an id and must not throttle each other.
  const rate = checkPlayRate(socket.id);
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
  const applied = applyEnginePlay(room, side, slot, x as number, y as number, cardId, matchId, socket.id);
  if (!applied.ok) {
    fail(socket, ack, applied.code ?? "CARD_REJECTED", applied.message ?? "card rejected", matchId);
    return;
  }
  ack?.({ ok: true });
}

function handleForfeit(socket: Socket, payload: { matchId?: string; playerId?: string }, ack?: AckFn): void {
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
  const side = getSideForClient(room, socket.id, playerId);
  if (side === null) {
    fail(socket, ack, "CARD_REJECTED", "not a participant of this match", matchId);
    return;
  }
  const ok = forfeit(room, side);
  if (!ok) {
    fail(socket, ack, "CARD_REJECTED", "match already finished", matchId);
    return;
  }
  ack?.({ ok: true });
  stopBotLoop(matchId);
  // Emit immediately so the forfeiter sees the defeat without waiting a tick.
  io.to(matchId).emit("match:end", {
    matchId,
    winner: side === "blue" ? "red" : "blue",
    crowns: room.state.crowns,
    forfeit: true,
  });
  broadcastState(io, room);
  stopTickLoop(matchId);
}

/**
 * Tournament match: the player pressed "Play" in a tournament. The server
 * pairs the ready players; as soon as two of them are ready it creates a
 * normal authoritative room (same engine, same validation) and tells BOTH
 * players which side they play and which match to join.
 *
 * O(p) over the tournament roster (p <= 8); the room creation is O(1).
 */
function handleTournamentReady(
  socket: Socket,
  payload: {
    tournamentId?: string;
    playerId?: string;
    deck?: string[];
    levels?: Record<string, number>;
    towerTroopId?: string;
    modeId?: string;
  },
  ack?: AckFn,
): void {
  const tournamentId = typeof payload?.tournamentId === "string" ? payload.tournamentId : "";
  const playerId = typeof payload?.playerId === "string" ? payload.playerId : "";
  if (tournamentId.length === 0 || playerId.length === 0) {
    fail(socket, ack, "BAD_PLAYER", "tournamentId and playerId are required");
    return;
  }
  const ready = markTournamentReady(tournamentId, playerId);
  if (!ready.ok) {
    fail(socket, ack, ready.code ?? "NOT_READY", ready.message ?? "not ready");
    return;
  }
  const opponent = ready.opponent;
  if (opponent === undefined) {
    // Nobody to play yet: the client keeps the button in the "waiting" state.
    ack?.({ ok: true });
    socket.emit("tournament:waiting", { tournamentId, playerId });
    return;
  }
  const mode = parseGameMode(payload?.modeId ?? "standard");
  const modeId = mode.ok ? mode.mode.id : "standard";
  const myDeck = Array.isArray(payload?.deck) ? (payload.deck as string[]).slice(0, 8) : [];
  const foeDeck = opponent.deck.slice(0, 8);
  if (myDeck.length === 0 || foeDeck.length === 0) {
    fail(socket, ack, "BAD_DECK", "both players need a deck");
    return;
  }
  const matchId = `trn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const blueId = playerId;
  const redId = opponent.playerId;
  const levels = battleLevelsFor(playerId, myDeck, payload?.towerTroopId, payload?.levels ?? {});
  const foeLevels = battleLevelsFor(redId, foeDeck, payload?.towerTroopId, {});
  const room = createRoom(
    matchId,
    { playerId: blueId, socketId: socket.id, deck: myDeck, levels, towerTroopId: payload?.towerTroopId },
    { playerId: redId, socketId: `trn-${redId}`, deck: foeDeck, levels: foeLevels, towerTroopId: payload?.towerTroopId },
    modeId,
  );
  registerTournamentMatch(tournamentId, matchId);
  socketPlayer.set(socket.id, playerId);
  playerSocket.set(playerId, socket.id);
  socket.join(matchId);
  // The opponent may be on another socket: bind it and start its side too.
  const foeSocketId = playerSocket.get(redId);
  const foeSocket = foeSocketId !== undefined ? io.sockets.sockets.get(foeSocketId) : undefined;
  if (foeSocket !== undefined) {
    foeSocket.join(matchId);
    foeSocket.emit("tournament:match", {
      matchId,
      side: "red" satisfies PlayerSide,
      opponentId: blueId,
      tournamentId,
    });
  }
  socket.emit("tournament:match", {
    matchId,
    side: "blue" satisfies PlayerSide,
    opponentId: redId,
    tournamentId,
  });
  io.to(matchId).emit("match:start", { matchId, state: room.state });
  broadcastState(io, room);
  startTickLoop(io, matchId);
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
  if (room === undefined || getSideForClient(room, socket.id, playerId) === null) {
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

  // Practice vs AI: instant real match against the server-side bot.
  socket.on("match:practice", (payload: { playerId?: string; deck?: string[]; difficulty?: string; modeId?: string }, ack?: AckFn) => {
    handlePracticeMatch(socket, payload, ack);
  });
  socket.on("queue:ai", (payload: { playerId?: string; deck?: string[]; difficulty?: string; modeId?: string }, ack?: AckFn) => {
    handlePracticeMatch(socket, payload, ack);
  });

  // Legacy alias: matchId is ignored, treated as queue:join (§11/§12.3).
  socket.on("match:join", (payload: LegacyJoinPayload, ack?: AckFn) => {
    handleQueueJoin(socket, { playerId: payload?.playerId, deck: payload?.deck, levels: payload?.levels, towerTroopId: payload?.towerTroopId, modeId: payload?.modeId }, ack);
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

  // Tournament bracket: "Play" in the TOURNAMENTS tab of the battle log.
  socket.on("tournament:ready", (payload: { tournamentId?: string; playerId?: string; deck?: string[]; levels?: Record<string, number>; towerTroopId?: string; modeId?: string }, ack?: AckFn) => {
    handleTournamentReady(socket, payload, ack);
  });

  // The client identifies itself so the server can reach it later (e.g. the
  // tournament pairing notifies the opponent on its own socket). O(1).
  socket.on("player:register", (payload: { playerId?: string }) => {
    const playerId = typeof payload?.playerId === "string" ? payload.playerId : "";
    if (playerId.length === 0) return;
    socketPlayer.set(socket.id, playerId);
    playerSocket.set(playerId, socket.id);
  });

  // Surrender: this player loses, the opponent wins, both receive match:end.
  socket.on("match:forfeit", (payload: { matchId?: string; playerId?: string }, ack?: AckFn) => {
    handleForfeit(socket, payload, ack);
  });

  // Reconnect / resume helper (§10): re-request the latest snapshot. Also binds
// this socket to the room again so a player who left and came back resumes the
// SAME running match (deploys keep working after a reload).
  socket.on("match:sync", (payload: { matchId?: string; playerId?: string }) => {
    const matchId = typeof payload?.matchId === "string" ? payload.matchId : "";
    const playerId = typeof payload?.playerId === "string" ? payload.playerId : "";
    const room = getRoom(matchId);
    if (room === undefined) {
      return;
    }
    if (playerId.length > 0) {
      const side = rebindPlayerSocket(room, playerId, socket.id);
      if (side === null) {
        return; // not a participant of this match
      }
      socketPlayer.set(socket.id, playerId);
      playerSocket.set(playerId, socket.id);
    }
    void socket.join(matchId);
    socket.emit("state:update", room.state);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[backend] client disconnected: ${socket.id} (${reason})`);
    const playerId = socketPlayer.get(socket.id);
    // Socket-scoped: never drop another live player's queue entry.
    leaveQueueBySocket(socket.id);
    if (playerId !== undefined) {
      socketPlayer.delete(socket.id);
      if (playerSocket.get(playerId) === socket.id) {
        playerSocket.delete(playerId);
      }
    }
  });
});

void ensureMysqlDatabase().then(async (bootstrap) => {
  if (isMysqlConfigured() && !bootstrap.tables) {
    console.error("[backend] database configured but full schema bootstrap failed; refusing to start");
    return null;
  }
  const stored = await loadPlayerState();
  const playerCount = hydratePlayers(stored.players, stored.decks);
  const accountCount = hydrateAccounts(stored.accounts);
  const battleLogCount = await hydrateBattleLog();
  const tournamentCount = await hydrateTournaments();
  const syncedAdmin = ensureAdminAccount();
  if (syncedAdmin !== null) console.log(`[backend] admin account ready: ${syncedAdmin}`);
  if (isMysqlConfigured()) {
    console.log(`[backend] restored ${playerCount} players, ${accountCount} accounts, ${stored.decks.length} decks, ${battleLogCount} battle-log entries, ${tournamentCount} tournaments`);
  }
  return Promise.all([hydrateMechanicsFromMysql(), hydrateSpawnTemplatesFromMysql(), hydrateLevelStatsFromMysql()]);
}).then((result) => {
  if (result === null) return;
  const [mechanics, spawns, levels] = result;
  const { loaded, source } = mechanics;
  if (source === "unavailable" && isMysqlConfigured()) {
    console.error("[backend] mechanics database configured but unavailable; refusing to start matchmaking");
    return;
  }
  if (source === "mysql" && loaded !== CARD_LIST.length) {
    console.error(`[backend] mechanic readiness failure: ${loaded}/${CARD_LIST.length} card rows loaded`);
    return;
  }
  if (loaded === 0) {
    console.warn("[backend] mechanics database unavailable; mechanic-dependent matches are not ready");
  }
  if (spawns.loaded === 0) console.warn("[backend] spawn template data unavailable; spawner cards are not ready");
  if (levels.loaded === 0) console.warn("[backend] level stat data unavailable; fallback stats are active");
  httpServer.listen(PORT, () => {
    console.log(`[backend] listening on :${PORT}`);
  });
});

// Let the room registry notify the bot brain when a match ends.
setRoomEndedHandler((matchId) => stopBotLoop(matchId));

// Free every bot think loop on shutdown (dev restarts keep the process clean).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopAllBotLoops();
    httpServer.close(() => process.exit(0));
  });
}
