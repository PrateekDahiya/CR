"use client";

/**
 * frontend/components/ui/BattleLogPanel.tsx — the "Battle Log" sheet.
 *
 * Layout follows the Clash Royale battle log (see docs/UI_REFERENCE.md):
 *   - a header with the title and the red close button,
 *   - a BATTLES / TOURNAMENTS tab bar,
 *   - one card per battle: the result banner with the crown score, both
 *     players (name + trophies) with the crossed swords between them, the
 *     deck of BOTH sides (2 rows of 4 cards each) and a footer with the
 *     trophy delta, the time ago, a PRACTICE and a WATCH button.
 *
 * The TOURNAMENTS tab lists the open/finished tournaments, lets the player
 * create and join one, and shows the tournament matches.
 *
 * Perf: one fetch per tab switch (cached in the component), rows are capped
 * by the backend (30 newest). Rendering is O(entries * 8) card tiles.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTournament,
  getBattleLog,
  getTournaments,
  joinTournament,
  type BattleLogEntry,
  type TournamentSummary,
} from "../../lib/api";
import { usePlayer } from "../../lib/playerContext";
import { loadDeck } from "../../lib/useDeck";
import { connect, onTournamentMatch, onTournamentWaiting, registerPlayer, tournamentReady } from "../../lib/socket";
import CardArt from "./CardArt";

export interface BattleLogPanelProps {
  playerId: string;
  onClose: () => void;
  /** Opens a fresh practice match (the "Practice" button in the reference). */
  onPractice?: (foeDeck?: string[]) => void;
}

type LogTab = "battles" | "tournaments";

function ago(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * The deck of one side: 2 rows of 4 cards (Clash Royale layout).
 * O(8) tiles per side.
 */
function DeckGrid({ cards, view }: { cards: string[]; view: "front" | "back" }) {
  if (cards.length === 0) {
    return (
      <p className="px-1 py-3 text-center text-[10px] font-bold text-slate-400">Unknown deck</p>
    );
  }
  return (
    <div data-testid="battle-log-deck" className="grid grid-cols-4 gap-1">
      {cards.slice(0, 8).map((id, index) => (
        <CardArt
          key={`${id}-${index}`}
          name={id}
          showLevel={false}
          showCost={false}
          size="sm"
          artUrl={`/cardart/${id}-${view}.png`}
          className="!h-11 !w-9"
        />
      ))}
    </div>
  );
}

/** One battle row (the Clash Royale log card). */
function BattleCard({
  entry,
  playerName,
  onPractice,
  onWatch,
}: {
  entry: BattleLogEntry;
  playerName: string;
  onPractice: () => void;
  onWatch: () => void;
}) {
  const win = entry.result === "win";
  const draw = entry.result === "draw";
  const banner = win ? "VICTORY" : draw ? "DRAW" : "DEFEAT";
  const bannerTone = win
    ? "text-sky-300"
    : draw
      ? "text-slate-200"
      : "text-rose-300";
  return (
    <li
      data-testid="battle-log-entry"
      data-result={entry.result}
      className="overflow-hidden rounded-xl border-2 border-slate-600 bg-gradient-to-b from-[#1b2f5c] to-[#101d3d] shadow-md"
    >
      {/* Result banner + crown score */}
      <div className="flex items-center gap-2 border-b border-slate-700/70 bg-black/30 px-2 py-1">
        <span
          data-testid="battle-log-result"
          className={`text-[12px] font-extrabold uppercase tracking-wide ${bannerTone}`}
        >
          {banner}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[12px] font-extrabold text-amber-100">
          <span aria-hidden="true">👑</span>
          <span data-testid="battle-log-score">
            {entry.crowns} - {entry.opponentCrowns}
          </span>
          <span aria-hidden="true">👑</span>
        </span>
      </div>

      {/* Both players: name + trophies, crossed swords in the middle */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-extrabold text-sky-300">
            {playerName}
          </p>
          <p className="text-[10px] font-bold text-amber-300">🏆 {entry.trophies}</p>
        </div>
        <span aria-hidden="true" className="text-base">
          ⚔️
        </span>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-[11px] font-extrabold text-rose-300">
            {entry.opponentName}
          </p>
          <p className="text-[10px] font-bold text-amber-300">🏆 {entry.opponentTrophies}</p>
        </div>
      </div>

      {/* Both decks, side by side (the reference layout) */}
      <div className="flex items-stretch gap-1 px-2 pb-1.5">
        <div className="min-w-0 flex-1">
          <DeckGrid cards={entry.deck} view="front" />
        </div>
        <div className="w-px shrink-0 bg-slate-600/70" />
        <div className="min-w-0 flex-1">
          <DeckGrid cards={entry.opponentDeck} view="back" />
        </div>
      </div>

      {/* Footer: trophy delta + time ago + Practice / Watch */}
      <div className="flex items-center gap-2 border-t border-slate-700/80 bg-black/25 px-2 py-1.5">
        <span
          data-testid="battle-log-trophy-delta"
          className={`text-[11px] font-extrabold ${
            entry.trophyDelta >= 0 ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {entry.trophyDelta >= 0 ? "+" : ""}
          {entry.trophyDelta} 🏆
        </span>
        <span className="text-[9px] font-bold text-slate-400">{ago(entry.createdAtMs)}</span>
        {entry.tournamentName !== undefined ? (
          <span className="text-[9px] font-extrabold uppercase text-fuchsia-300">
            {entry.tournamentName}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            data-testid="battle-log-practice"
            onClick={onPractice}
            className="rounded-md border border-sky-900 bg-gradient-to-b from-sky-400 to-sky-600 px-2.5 py-1 text-[10px] font-extrabold uppercase text-white shadow active:translate-y-0.5"
          >
            Practice
          </button>
          <button
            type="button"
            data-testid="battle-log-watch"
            onClick={onWatch}
            disabled={entry.watchable !== true}
            title={entry.watchable === true ? "Watch the replay" : "Replay no longer available"}
            className="rounded-md border border-emerald-900 bg-gradient-to-b from-emerald-400 to-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase text-white shadow active:translate-y-0.5 disabled:from-slate-500 disabled:to-slate-700 disabled:text-slate-300"
          >
            Watch
          </button>
        </div>
      </div>
    </li>
  );
}

export default function BattleLogPanel({ playerId, onClose, onPractice }: BattleLogPanelProps) {
  const router = useRouter();
  const { profile } = usePlayer();
  const [tab, setTab] = useState<LogTab>("battles");
  const [entries, setEntries] = useState<BattleLogEntry[]>([]);
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const playerName = profile?.name ?? "You";

  const loadEntries = useCallback(async () => {
    if (playerId.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getBattleLog(playerId);
      setEntries(res.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  const loadTournaments = useCallback(async () => {
    if (playerId.length === 0) return;
    try {
      const res = await getTournaments(playerId);
      setTournaments(res.tournaments ?? []);
    } catch {
      setTournaments([]);
    }
  }, [playerId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (tab === "tournaments") void loadTournaments();
  }, [tab, loadTournaments]);

  // Tournament matches move the player into the battle screen.
  useEffect(() => {
    let offMatch: (() => void) | null = null;
    let offWaiting: (() => void) | null = null;
    try {
      const socket = connect(process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000");
      if (socket === null) return;
      // Let the server reach this socket later (the tournament pairing
      // notifies the opponent on its own socket).
      if (playerId.length > 0) registerPlayer(playerId);
      offMatch = onTournamentMatch((m) => {
        router.push(`/battle?matchId=${encodeURIComponent(m.matchId)}&side=${m.side}&opponent=${encodeURIComponent(m.opponentId)}`);
      });
      offWaiting = onTournamentWaiting(() => {
        setNotice("Waiting for an opponent — press Play again when someone joins.");
        setBusy(false);
      });
    } catch {
      // socket unavailable: the Play button reports the error instead
    }
    return () => {
      offMatch?.();
      offWaiting?.();
    };
  }, [router, playerId]);

  const tournamentEntries = useMemo(
    () => entries.filter((entry) => entry.tournamentId !== undefined),
    [entries],
  );

  const handleCreate = useCallback(async () => {
    if (playerId.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await createTournament({
        playerId,
        name: newName.trim().length > 0 ? newName.trim() : "Tournament",
        deck: loadDeck(),
      });
      setNewName("");
      await loadTournaments();
      setNotice("Tournament created — share the name so others can join.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "could not create the tournament");
    } finally {
      setBusy(false);
    }
  }, [playerId, newName, busy, loadTournaments]);

  const handleJoin = useCallback(
    async (tournamentId: string) => {
      if (playerId.length === 0 || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await joinTournament(tournamentId, { playerId, deck: loadDeck() });
        await loadTournaments();
        setNotice("Joined the tournament.");
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "could not join the tournament");
      } finally {
        setBusy(false);
      }
    },
    [playerId, busy, loadTournaments],
  );

  const handlePlay = useCallback(
    async (tournamentId: string) => {
      if (playerId.length === 0 || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        const socket = connect(process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000");
        if (socket === null) throw new Error("socket unavailable");
        const levels: Record<string, number> = {};
        for (const id of loadDeck()) {
          const level = profile?.cards?.[id];
          if (level !== undefined) levels[id] = level;
        }
        await tournamentReady({
          tournamentId,
          playerId,
          deck: loadDeck(),
          levels,
        });
        setNotice("Waiting for an opponent…");
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "could not start the tournament match");
        setBusy(false);
      }
    },
    [playerId, busy, profile],
  );

  const handleWatch = useCallback(
    (entry: BattleLogEntry) => {
      router.push(`/replay?matchId=${encodeURIComponent(entry.matchId)}`);
    },
    [router],
  );

  const handlePractice = useCallback(
    (entry: BattleLogEntry) => {
      if (onPractice !== undefined) {
        onPractice(entry.opponentDeck.length > 0 ? entry.opponentDeck : undefined);
      }
    },
    [onPractice],
  );

  return (
    <div
      data-testid="battle-log"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b1c]/85 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border-4 border-amber-600/70 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] shadow-2xl">
        <header className="flex items-center justify-between border-b-2 border-amber-600/50 bg-gradient-to-b from-[#24407a] to-[#12224a] px-3 py-2">
          <h2 className="text-lg font-extrabold uppercase tracking-wide text-amber-200">Battle Log</h2>
          <button
            type="button"
            data-testid="battle-log-close"
            onClick={onClose}
            aria-label="Close battle log"
            className="grid h-7 w-7 place-items-center rounded-md border-2 border-red-400 bg-gradient-to-b from-red-500 to-red-700 text-sm font-extrabold text-white"
          >
            x
          </button>
        </header>

        {/* Tab bar: BATTLES / TOURNAMENTS */}
        <div className="flex items-end gap-1 border-b border-slate-700 bg-[#0d1a38] px-2 pt-1.5">
          <TabButton
            testId="battle-log-tab-battles"
            label="Battles"
            active={tab === "battles"}
            onClick={() => setTab("battles")}
          />
          <TabButton
            testId="battle-log-tab-tournaments"
            label="Tournaments"
            active={tab === "tournaments"}
            onClick={() => setTab("tournaments")}
          />
        </div>

        <div className="overflow-y-auto p-2">
          {notice !== null ? (
            <p
              data-testid="battle-log-notice"
              className="mb-2 rounded-md border border-amber-700/70 bg-amber-950/60 px-2 py-1 text-[10px] font-bold text-amber-200"
            >
              {notice}
            </p>
          ) : null}

          {tab === "battles" ? (
            loading ? (
              <p className="p-4 text-center text-xs text-slate-300">Loading battles...</p>
            ) : entries.length === 0 ? (
              <p data-testid="battle-log-empty" className="p-4 text-center text-xs text-slate-400">
                No battles yet. Win a match to see it here.
              </p>
            ) : (
              <ul className="space-y-2">
                {entries.map((entry) => (
                  <BattleCard
                    key={entry.id}
                    entry={entry}
                    playerName={playerName}
                    onPractice={() => handlePractice(entry)}
                    onWatch={() => handleWatch(entry)}
                  />
                ))}
              </ul>
            )
          ) : (
            <TournamentsTab
              tournaments={tournaments}
              entries={tournamentEntries}
              playerId={playerId}
              busy={busy}
              newName={newName}
              onNewName={setNewName}
              onCreate={handleCreate}
              onJoin={handleJoin}
              onPlay={handlePlay}
              onWatch={handleWatch}
              onPractice={handlePractice}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-selected={active}
      className={`rounded-t-lg border-x-2 border-t-2 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide ${
        active
          ? "border-slate-500 bg-gradient-to-b from-[#2a4a8f] to-[#1b2f5c] text-amber-200"
          : "border-transparent bg-transparent text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

/** The TOURNAMENTS tab: create/join a tournament and see its matches. */
function TournamentsTab({
  tournaments,
  entries,
  playerId,
  busy,
  newName,
  onNewName,
  onCreate,
  onJoin,
  onPlay,
  onWatch,
  onPractice,
}: {
  tournaments: TournamentSummary[];
  entries: BattleLogEntry[];
  playerId: string;
  busy: boolean;
  newName: string;
  onNewName: (value: string) => void;
  onCreate: () => void;
  onJoin: (id: string) => void;
  onPlay: (id: string) => void;
  onWatch: (entry: BattleLogEntry) => void;
  onPractice: (entry: BattleLogEntry) => void;
}) {
  return (
    <div data-testid="battle-log-tournaments" className="space-y-2">
      <div className="flex items-center gap-1.5">
        <input
          value={newName}
          onChange={(e) => onNewName(e.target.value)}
          placeholder="Tournament name"
          data-testid="battle-log-tournament-name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-md border border-slate-600 bg-[#0a1730] px-2 py-1 text-[11px] font-bold text-white outline-none focus:border-amber-500"
        />
        <button
          type="button"
          data-testid="battle-log-tournament-create"
          onClick={onCreate}
          disabled={busy || playerId.length === 0}
          className="rounded-md border border-amber-900 bg-gradient-to-b from-amber-400 to-amber-600 px-2.5 py-1 text-[10px] font-extrabold uppercase text-white disabled:opacity-50"
        >
          Create
        </button>
      </div>

      {tournaments.length === 0 ? (
        <p data-testid="battle-log-tournaments-empty" className="p-3 text-center text-xs text-slate-400">
          No tournaments yet. Create one and let someone join it.
        </p>
      ) : (
        <ul className="space-y-2">
          {tournaments.map((tournament) => (
            <li
              key={tournament.id}
              data-testid="battle-log-tournament"
              className="rounded-xl border-2 border-slate-600 bg-[#13224a] p-2"
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-[12px] font-extrabold text-amber-200">
                  {tournament.name}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                    tournament.status === "open" ? "bg-emerald-700 text-emerald-100" : "bg-slate-600 text-slate-200"
                  }`}
                >
                  {tournament.status}
                </span>
                <span className="ml-auto text-[10px] font-bold text-slate-300">
                  {tournament.playerCount}/{tournament.maxPlayers}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1">
                {tournament.players.map((player) => (
                  <span
                    key={player.playerId}
                    className={`rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold ${
                      player.eliminated ? "text-slate-500 line-through" : "text-slate-200"
                    }`}
                  >
                    {player.name}
                  </span>
                ))}
              </div>

              {tournament.championName !== undefined ? (
                <p className="mt-1 text-[10px] font-extrabold text-amber-300">
                  🏆 Champion: {tournament.championName}
                </p>
              ) : null}

              <div className="mt-1.5 flex items-center gap-1.5">
                {tournament.joined ? (
                  <button
                    type="button"
                    data-testid="battle-log-tournament-play"
                    onClick={() => onPlay(tournament.id)}
                    disabled={busy || tournament.status === "finished"}
                    className="rounded-md border border-sky-900 bg-gradient-to-b from-sky-400 to-sky-600 px-2.5 py-1 text-[10px] font-extrabold uppercase text-white disabled:opacity-50"
                  >
                    Play
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="battle-log-tournament-join"
                    onClick={() => onJoin(tournament.id)}
                    disabled={busy || tournament.status === "finished"}
                    className="rounded-md border border-emerald-900 bg-gradient-to-b from-emerald-400 to-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase text-white disabled:opacity-50"
                  >
                    Join
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 ? (
        <>
          <p className="pt-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
            Tournament battles
          </p>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <BattleCard
                key={entry.id}
                entry={entry}
                playerName="You"
                onPractice={() => onPractice(entry)}
                onWatch={() => onWatch(entry)}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
