/**
 * Tournament registry tests: create/join, the ready pairing, the bracket
 * (single elimination) and the listing payload.
 *
 * O(p) per case (p <= 8 roster entries). Run: npm test (tsx --test).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createTournament,
  findTournamentByMatch,
  getTournament,
  joinTournament,
  listTournaments,
  markTournamentReady,
  recordTournamentMatch,
  registerTournamentMatch,
  resetTournaments,
  MAX_PLAYERS,
} from "../src/tournaments.js";

const DECK = ["knight", "archers", "giant", "skeletons", "musketeer", "baby-dragon", "fireball", "arrows"];

beforeEach(() => {
  resetTournaments();
});

describe("tournament registry", () => {
  it("creates a tournament with the creator in the roster", () => {
    const tournament = createTournament({
      name: "Spring Cup",
      playerId: "alice",
      playerName: "Alice",
      deck: DECK,
      trophies: 120,
    });
    assert.equal(tournament.name, "Spring Cup");
    assert.equal(tournament.status, "open");
    assert.equal(tournament.players.length, 1);
    assert.equal(tournament.players[0].name, "Alice");
    assert.equal(tournament.players[0].deck.length, 8);
    assert.equal(tournament.maxPlayers, MAX_PLAYERS);
  });

  it("joins a tournament and rejects unknown / full / finished ones", () => {
    const tournament = createTournament({ name: "Cup", playerId: "alice", deck: DECK });
    const joined = joinTournament(tournament.id, { playerId: "bob", deck: DECK });
    assert.equal(joined.ok, true);
    assert.equal(joined.tournament?.players.length, 2);

    const unknown = joinTournament("nope", { playerId: "bob", deck: DECK });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, "NO_TOURNAMENT");

    // Re-joining is idempotent (the deck is refreshed instead).
    const again = joinTournament(tournament.id, { playerId: "bob", deck: DECK });
    assert.equal(again.ok, true);
    assert.equal(again.tournament?.players.length, 2);
  });

  it("rejects a join when the tournament is full", () => {
    const tournament = createTournament({ name: "Duel", playerId: "alice", deck: DECK, maxPlayers: 2 });
    assert.equal(joinTournament(tournament.id, { playerId: "bob", deck: DECK }).ok, true);
    const full = joinTournament(tournament.id, { playerId: "carol", deck: DECK });
    assert.equal(full.ok, false);
    assert.equal(full.code, "TOURNAMENT_FULL");
  });

  it("pairs two ready players and hands out the opponent", () => {
    const tournament = createTournament({ name: "Cup", playerId: "alice", deck: DECK });
    joinTournament(tournament.id, { playerId: "bob", deck: DECK });

    const first = markTournamentReady(tournament.id, "alice");
    assert.equal(first.ok, true);
    assert.equal(first.opponent, undefined);

    const second = markTournamentReady(tournament.id, "bob");
    assert.equal(second.ok, true);
    assert.equal(second.opponent?.playerId, "alice");
    assert.equal(second.opponent?.deck.length, 8);
  });

  it("refuses a player that never joined", () => {
    const tournament = createTournament({ name: "Cup", playerId: "alice", deck: DECK });
    const ready = markTournamentReady(tournament.id, "mallory");
    assert.equal(ready.ok, false);
    assert.equal(ready.code, "NOT_JOINED");
  });

  it("records the bracket result and crowns the winner", () => {
    const tournament = createTournament({ name: "Cup", playerId: "alice", deck: DECK });
    joinTournament(tournament.id, { playerId: "bob", deck: DECK });
    registerTournamentMatch(tournament.id, "m1");

    const updated = recordTournamentMatch(tournament.id, {
      matchId: "m1",
      blueId: "alice",
      redId: "bob",
      winner: "blue",
      blueCrowns: 3,
      redCrowns: 0,
    });
    assert.equal(updated?.status, "finished");
    assert.equal(updated?.championId, "alice");
    assert.equal(updated?.matches.length, 1);
    assert.equal(updated?.players.find((p) => p.playerId === "bob")?.eliminated, true);
    assert.equal(updated?.players.find((p) => p.playerId === "alice")?.wins, 1);

    // The match is linked back to its tournament.
    assert.equal(findTournamentByMatch("m1")?.id, tournament.id);
  });

  it("lists the tournaments with the joined flag", () => {
    const tournament = createTournament({ name: "Cup", playerId: "alice", deck: DECK });
    joinTournament(tournament.id, { playerId: "bob", deck: DECK });
    const list = listTournaments("bob");
    assert.equal(list.length, 1);
    assert.equal(list[0].joined, true);
    assert.equal(list[0].playerCount, 2);
    assert.equal(list[0].status, "open");
    assert.equal(listTournaments("carol")[0].joined, false);
  });
});
