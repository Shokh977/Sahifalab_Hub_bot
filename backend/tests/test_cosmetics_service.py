"""
test_cosmetics_service.py — the profile cosmetics unlock rules
(106_profile_looks): free, streak achievements, Pro, seasonal windows (free
for everyone in season), and the free fallback for a locked saved choice.
Pure logic, no database.
"""
from datetime import date, datetime, timedelta, timezone

from app.services.cosmetics_service import (
    FALLBACK, UnlockContext, _parse_window, effective_look, is_unlocked, item_states, pro_active,
)


def ctx(is_pro=False, best=0, seasons=()):
    return UnlockContext(is_pro=is_pro, best_streak=best, open_seasons=set(seasons))


def test_free_items_always_unlocked():
    assert is_unlocked("banner", "plain", ctx())
    assert is_unlocked("ring", "oddiy", ctx())


def test_achievements_follow_best_streak():
    assert not is_unlocked("banner", "tong", ctx(best=29))
    assert is_unlocked("banner", "tong", ctx(best=30))
    assert not is_unlocked("ring", "olov", ctx(best=49))
    assert is_unlocked("ring", "olov", ctx(best=50))


def test_pro_items_need_pro():
    for slot, item in [("banner", "tun"), ("banner", "oltin"), ("ring", "kometa"), ("ring", "oltin")]:
        assert not is_unlocked(slot, item, ctx())
        assert is_unlocked(slot, item, ctx(is_pro=True))


def test_tree_looks():
    assert is_unlocked("tree", "tabiiy", ctx())
    assert not is_unlocked("tree", "kumush", ctx(best=99))
    assert is_unlocked("tree", "kumush", ctx(best=100))
    assert not is_unlocked("tree", "oltin", ctx(best=400))
    assert is_unlocked("tree", "sakura", ctx(is_pro=True))


def test_seasonal_items_free_in_season_only():
    assert is_unlocked("banner", "bahor", ctx(seasons=["navroz"]))
    assert is_unlocked("ring", "lola", ctx(seasons=["navroz"]))
    assert is_unlocked("banner", "hilol", ctx(seasons=["ramazon"]))
    # Out of season even Pro can't use them.
    assert not is_unlocked("banner", "bahor", ctx(is_pro=True))
    assert not is_unlocked("banner", "hilol", ctx(is_pro=True, seasons=["navroz"]))


def test_unknown_items_are_locked():
    assert not is_unlocked("banner", "nope", ctx(is_pro=True))
    assert not is_unlocked("hat", "plain", ctx(is_pro=True))


def test_locked_choice_renders_fallback_but_is_kept():
    saved = {"banner": "oltin", "ring": "olov", "tree": "oltin"}
    assert effective_look(saved, ctx(best=60)) == {"banner": "plain", "ring": "olov", "tree": "tabiiy"}
    assert effective_look(saved, ctx(is_pro=True, best=60)) == saved
    assert saved == {"banner": "oltin", "ring": "olov", "tree": "oltin"}


def test_empty_or_bad_saved_look_falls_back():
    assert effective_look(None, ctx()) == FALLBACK
    assert effective_look({"banner": 3}, ctx()) == FALLBACK


def test_item_states_cover_catalog():
    states = item_states(ctx(best=30))
    assert states["banner"]["tong"] is True
    assert states["ring"]["olov"] is False


def test_window_parsing():
    today = date(2027, 3, 15)
    assert _parse_window({"start": "03-01", "end": "03-31"}, today) == (date(2027, 3, 1), date(2027, 3, 31))
    assert _parse_window({"start": "2027-02-08", "end": "2027-03-09"}, today) == (date(2027, 2, 8), date(2027, 3, 9))
    assert _parse_window(None, today) is None
    assert _parse_window({"start": "bad", "end": "03-31"}, today) is None


def test_pro_active():
    now = datetime(2026, 10, 26, tzinfo=timezone.utc)
    assert not pro_active(None, now)
    assert pro_active(now + timedelta(days=1), now)
    assert not pro_active(now - timedelta(seconds=1), now)
    assert pro_active((now + timedelta(days=1)).replace(tzinfo=None), now)
