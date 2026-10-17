"""CR Clone AI Service — balance analytics store (Phase 6).

In-memory ring-buffer of per-card match reports used by ``GET /balance/cards``.

Balance targets (docs/GAME_DESIGN.md §2): no card may ship a patch with measured
win rate below 0.45 or above 0.55 — see :meth:`BalanceAnalytics.flag_outliers`.

Complexities (MEMORY#20: best possible time + space):
  * insert is O(k) with k <= 8 deck slots, i.e. effectively O(1) per report;
  * cached aggregate is O(c) with c = 12 cards;
  * audited aggregate is O(n) single-pass with n <= maxlen (10000);
  * extra space is O(n) events + O(c) counters — no per-call allocations
    beyond the O(c) result list, no I/O, no third-party deps (stdlib only).
"""

from __future__ import annotations

from collections import deque
import time

__all__ = [
    "CARD_POOL",
    "CARD_SET",
    "MAX_EVENTS",
    "MIN_GAMES_FLAG",
    "WIN_LOW",
    "WIN_HIGH",
    "BalanceAnalytics",
    "default_store",
    "record_match",
    "card_stats",
    "flag_outliers",
    "reset",
]

# Canonical 12-card pool (docs/GAME_DESIGN.md §1). Kebab-case ids.
CARD_POOL: tuple[str, ...] = (
    "knight",
    "archers",
    "giant",
    "skeletons",
    "musketeer",
    "baby-dragon",
    "mini-pekka",
    "rock-golem",
    "fireball",
    "arrows",
    "zap",
    "cannon",
)
CARD_SET = frozenset(CARD_POOL)

MAX_EVENTS: int = 10000  # ring-buffer capacity (per-card rows)
MIN_GAMES_FLAG: int = 30  # minimum games before an outlier flag (GAME_DESIGN §2)
WIN_LOW: float = 0.45  # ship band lower bound (GAME_DESIGN §2 global rule)
WIN_HIGH: float = 0.55  # ship band upper bound (GAME_DESIGN §2 global rule)


def _normalize_card(name: str) -> str:
    """Normalize a card id to canonical kebab-case. O(1) time/space.

    Accepts case/separator variants (``Baby_Dragon``, ``baby dragon``).
    Raises ``ValueError`` for unknown cards so typos fail loudly.
    """
    key = str(name).strip().lower().replace("_", "-").replace(" ", "-")
    while "--" in key:
        key = key.replace("--", "-")
    if key not in CARD_SET:
        raise ValueError(f"unknown card: {name!r}")
    return key


def _coerce_won(value: object, default: bool) -> bool:
    """Coerce a won flag to bool. O(1) time/space.

    Accepts bool/int and ``win``/``loss``/``draw`` words. Side names such as
    ``"blue"``/``"red"`` are rejected (ambiguous without side context — use
    :meth:`BalanceAnalytics.record_game` for full matches instead).
    """
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        word = value.strip().lower()
        if word in ("win", "won", "winner", "victory", "true", "1", "w"):
            return True
        if word in ("loss", "lose", "lost", "defeat", "draw", "tie", "false", "0", "l"):
            return False
    raise ValueError(
        f"ambiguous won flag {value!r}: pass bool, 'win'/'loss'/'draw', "
        "a per_card_win dict, or use record_game(blue_deck, red_deck, winner)"
    )


class BalanceAnalytics:
    """Ring-buffer balance store.

    Each :meth:`record_match` appends one ``(card, won, timestamp)`` row per
    deck slot into a ``deque(maxlen=...)``; oldest rows auto-evict. Incremental
    O(c) counters are maintained alongside so the cached aggregate never
    drifts under eviction.
    """

    def __init__(self, maxlen: int = MAX_EVENTS, cards: tuple[str, ...] = CARD_POOL) -> None:
        """Create a store. O(c) time/space to init counters (c = len(cards)).

        ``maxlen`` caps stored per-card rows (tests may pass a small override).
        """
        self._cards: tuple[str, ...] = tuple(cards)
        self._index: dict[str, int] = {c: i for i, c in enumerate(self._cards)}
        self._events: deque[tuple[str, bool, float]] = deque(maxlen=maxlen)
        self._games: list[int] = [0] * len(self._cards)
        self._wins: list[int] = [0] * len(self._cards)
        self._total: int = 0

    def __len__(self) -> int:
        """Number of stored per-card rows. O(1)."""
        return len(self._events)

    @property
    def maxlen(self) -> int | None:
        """Ring capacity. O(1)."""
        return self._events.maxlen

    def reset(self) -> None:
        """Clear all events and counters. O(c) time to zero counters."""
        self._events.clear()
        self._games = [0] * len(self._cards)
        self._wins = [0] * len(self._cards)
        self._total = 0

    def _append(self, card: str, won: bool, ts: float) -> None:
        """Append one row with eviction accounting. O(1) amortized time/space."""
        buf = self._events
        if buf.maxlen is not None and len(buf) == buf.maxlen:
            old_card, old_won, _ = buf[0]  # leftmost evicted by the append below
            j = self._index.get(old_card)
            if j is not None:
                self._games[j] -= 1
                if old_won:
                    self._wins[j] -= 1
            self._total -= 1
        buf.append((card, won, ts))
        j = self._index[card]
        self._games[j] += 1
        if won:
            self._wins[j] += 1
        self._total += 1

    def record_match(
        self,
        card_names,
        winner_side: object = True,
        per_card_win: dict | None = None,
        timestamp: float | None = None,
    ) -> int:
        """Record one side's deck report. O(k) time, O(1) extra space (k <= 8).

        Args:
            card_names: iterable of card ids for one deck (typically 8).
            winner_side: won flag for the whole deck (bool / ``win`` / ``loss`` /
                ``draw``; ``draw`` counts as a game but not a win). Ignored per
                card when ``per_card_win`` is given (then used only as fallback
                for cards missing from the dict).
            per_card_win: optional mapping of card id -> won, for full-match or
                mirror-adjusted reports.
            timestamp: event time; defaults to ``time.time()`` (one call total).

        Returns:
            Number of rows appended (k). Raises ``ValueError`` on unknown cards
            (validated before any append, so failures are atomic).
        """
        names = [_normalize_card(c) for c in card_names]  # validate first: O(k)
        ts = timestamp if timestamp is not None else time.time()  # O(1), once
        if per_card_win is not None:
            fallback = _coerce_won(winner_side, default=False) if winner_side is not None else False
            norm_map: dict[str, bool] = {}
            for raw_key, raw_won in per_card_win.items():
                try:
                    norm_map[_normalize_card(raw_key)] = bool(raw_won)
                except ValueError:
                    norm_map[str(raw_key)] = bool(raw_won)
            for card in names:  # O(k) appends, each O(1)
                self._append(card, norm_map.get(card, fallback), ts)
        else:
            won = _coerce_won(winner_side, default=True)
            for card in names:  # O(k) appends, each O(1)
                self._append(card, won, ts)
        return len(names)

    def record_game(self, blue_deck, red_deck, winner: str, timestamp: float | None = None) -> int:
        """Record a full match (both decks). O(k) time, O(1) extra space.

        ``winner`` is ``"blue"``, ``"red"`` or ``"draw"`` (draw = games counted,
        no wins). Equivalent to two :meth:`record_match` calls sharing one
        timestamp.
        """
        w = str(winner).strip().lower()
        if w not in ("blue", "red", "draw"):
            raise ValueError(f"winner must be 'blue'|'red'|'draw', got {winner!r}")
        ts = timestamp if timestamp is not None else time.time()
        n = self.record_match(blue_deck, winner_side=(w == "blue"), timestamp=ts)
        n += self.record_match(red_deck, winner_side=(w == "red"), timestamp=ts)
        return n

    def _emit(self, games: list[int], wins: list[int], total: int) -> list[dict]:
        """Build the c=12 result rows. O(c) time/space."""
        rows: list[dict] = []
        for i, name in enumerate(self._cards):
            g = games[i]
            rows.append(
                {
                    "name": name,
                    "games": g,
                    "win_rate": (wins[i] / g) if g else 0.0,
                    "pick_rate": (g / total) if total else 0.0,
                }
            )
        return rows

    def card_stats(self) -> list[dict]:
        """Aggregate per-card stats via single pass. O(n + c) time, O(c) space.

        Recomputes from the ring-buffer (n <= maxlen) so it is exact even if a
        caller mutated internals; for the O(c) cached-counter path use
        :meth:`card_stats_cached`. Returns ``[{name, games, win_rate,
        pick_rate}]`` in canonical order, where ``pick_rate`` is the card's
        share of all stored card appearances (sums to 1.0 when non-empty).
        """
        games = [0] * len(self._cards)
        wins = [0] * len(self._cards)
        idx = self._index
        for card, won, _ in self._events:  # single pass: O(n)
            i = idx.get(card)
            if i is None:
                continue
            games[i] += 1
            if won:
                wins[i] += 1
        return self._emit(games, wins, len(self._events))  # O(c) emit

    def card_stats_cached(self) -> list[dict]:
        """Aggregate from incremental counters. O(c) time/space (c = 12)."""
        return self._emit(self._games, self._wins, self._total)

    def flag_outliers(
        self,
        min_games: int = MIN_GAMES_FLAG,
        low: float = WIN_LOW,
        high: float = WIN_HIGH,
        stats: list[dict] | None = None,
    ) -> list[dict]:
        """Flag cards outside the [low, high] ship band. O(c) scan.

        A card flags when ``games >= min_games`` and ``win_rate`` is outside
        ``[low, high]`` (defaults: 0.45–0.55, >= 30 games per GAME_DESIGN §2).
        Pass precomputed ``stats`` for a pure O(c) scan, else stats are
        recomputed (O(n + c)). Returns ``[{name, games, win_rate, pick_rate,
        direction}]`` with ``direction`` ``"high"`` or ``"low"``.
        """
        rows = stats if stats is not None else self.card_stats()
        out: list[dict] = []
        for row in rows:  # O(c)
            if row["games"] >= min_games and (row["win_rate"] < low or row["win_rate"] > high):
                out.append({**row, "direction": "high" if row["win_rate"] > high else "low"})
        return out


# Shared default store wired by main.py (Phase 6 bot/balance endpoints).
default_store = BalanceAnalytics()


def record_match(card_names, winner_side: object = True, per_card_win: dict | None = None) -> int:
    """Record on the default store. O(k) time (k <= 8), O(1) extra space."""
    return default_store.record_match(card_names, winner_side, per_card_win)


def card_stats() -> list[dict]:
    """Aggregate the default store via single pass. O(n + c) time, O(c) space."""
    return default_store.card_stats()


def flag_outliers(
    min_games: int = MIN_GAMES_FLAG,
    low: float = WIN_LOW,
    high: float = WIN_HIGH,
) -> list[dict]:
    """Flag default-store outliers. O(n + c) recompute + O(c) scan."""
    return default_store.flag_outliers(min_games, low, high)


def reset() -> None:
    """Clear the default store. O(c)."""
    default_store.reset()
