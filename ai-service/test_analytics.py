"""Pytest for the Phase 6 balance analytics store (pytest only, no I/O)."""

import pytest

from analytics import (
    CARD_POOL,
    BalanceAnalytics,
    flag_outliers,
)


def _by_name(rows):
    return {r["name"]: r for r in rows}


def test_record_and_aggregate_math():
    store = BalanceAnalytics()
    store.record_match(["knight", "archers"], winner_side=True)
    store.record_match(["knight", "giant"], winner_side=False)

    stats = _by_name(store.card_stats())
    assert stats["knight"]["games"] == 2
    assert stats["knight"]["win_rate"] == pytest.approx(0.5)
    assert stats["archers"]["games"] == 1
    assert stats["archers"]["win_rate"] == pytest.approx(1.0)
    assert stats["giant"]["games"] == 1
    assert stats["giant"]["win_rate"] == pytest.approx(0.0)
    # 4 stored appearances: knight 2/4, archers 1/4, giant 1/4.
    assert stats["knight"]["pick_rate"] == pytest.approx(0.5)
    assert stats["archers"]["pick_rate"] == pytest.approx(0.25)
    # per-card dict path: mirror-adjusted wins.
    store2 = BalanceAnalytics()
    store2.record_match(
        ["knight", "giant"],
        per_card_win={"knight": True, "giant": False},
    )
    s2 = _by_name(store2.card_stats())
    assert s2["knight"]["win_rate"] == pytest.approx(1.0)
    assert s2["giant"]["win_rate"] == pytest.approx(0.0)


def test_empty_store_zeros():
    store = BalanceAnalytics()
    stats = store.card_stats()
    assert len(stats) == len(CARD_POOL) == 12
    for row in stats:
        assert row["games"] == 0
        assert row["win_rate"] == 0.0
        assert row["pick_rate"] == 0.0
    assert store.flag_outliers() == []


def test_outlier_flagging():
    store = BalanceAnalytics()
    for _ in range(30):  # giant: 30/30 wins -> high outlier.
        store.record_match(["giant"], winner_side=True)
    for _ in range(15):  # knight: 15-15 -> 0.50, never flags.
        store.record_match(["knight"], winner_side=True)
    for _ in range(15):
        store.record_match(["knight"], winner_side=False)
    for _ in range(30):  # zap: 0/30 wins -> low outlier.
        store.record_match(["zap"], winner_side=False)
    for _ in range(5):  # cannon: 5/5 but games < 30 -> must NOT flag.
        store.record_match(["cannon"], winner_side=True)

    flags = {f["name"]: f for f in store.flag_outliers()}
    assert flags["giant"]["direction"] == "high"
    assert flags["giant"]["win_rate"] == pytest.approx(1.0)
    assert flags["zap"]["direction"] == "low"
    assert flags["zap"]["win_rate"] == pytest.approx(0.0)
    assert "knight" not in flags
    assert "cannon" not in flags
    # Module-level default store delegates too (empty by default).
    assert flag_outliers() == []


def test_ring_cap_eviction_small_override():
    store = BalanceAnalytics(maxlen=5)
    store.record_match(["knight", "knight", "knight"], winner_side=True)
    store.record_match(["giant", "giant", "giant"], winner_side=False)
    assert len(store) == 5  # 6th row evicted the oldest knight row.
    stats = _by_name(store.card_stats())
    assert stats["knight"]["games"] == 2
    assert stats["giant"]["games"] == 3
    # Cached O(c) counters agree with the O(n) single-pass recompute.
    cached = _by_name(store.card_stats_cached())
    assert cached == stats


def test_pick_rate_sums_to_hand_share():
    store = BalanceAnalytics()
    deck_blue = ["knight", "archers", "giant", "skeletons", "musketeer", "baby-dragon", "fireball", "cannon"]
    deck_red = ["mini-pekka", "rock-golem", "arrows", "zap", "knight", "archers", "musketeer", "cannon"]
    store.record_game(deck_blue, deck_red, winner="blue")
    stats = store.card_stats()
    total_pick = sum(r["pick_rate"] for r in stats)
    assert total_pick == pytest.approx(1.0)
    total_games = sum(r["games"] for r in stats)
    assert total_games == 16  # 8 + 8 card appearances.
    by_name = _by_name(stats)
    assert by_name["knight"]["pick_rate"] == pytest.approx(2 / 16)
    assert by_name["giant"]["win_rate"] == pytest.approx(1.0)  # blue won.
    assert by_name["zap"]["win_rate"] == pytest.approx(0.0)  # red lost.
