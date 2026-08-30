"""The disk cache for solved plans.

A solve costs seconds and the answer is deterministic given its inputs, so
recomputing it per page load — and again after every restart — is pure
waiting. These tests pin the two properties that make caching safe: identical
inputs give identical output, and different inputs never collide.
"""

from __future__ import annotations

import json

import pytest

from src.api import cache


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path / "plans")
    yield


def test_round_trip():
    k = cache.key(grounded=True, tasks=10, days=7)
    assert cache.load(k) is None
    cache.store(k, {"blocks": [1, 2, 3]})
    assert cache.load(k) == {"blocks": [1, 2, 3]}


def test_same_params_give_the_same_key():
    a = cache.key(grounded=True, tasks=10, days=7)
    b = cache.key(days=7, tasks=10, grounded=True)  # order must not matter
    assert a == b


@pytest.mark.parametrize("patch", [
    {"tasks": 11}, {"days": 30}, {"grounded": False}, {"seed": 43},
    {"time_limit": 20.0},
])
def test_different_params_never_collide(patch):
    base = dict(grounded=True, tasks=10, days=7, seed=42, time_limit=10.0)
    assert cache.key(**base) != cache.key(**{**base, **patch})


def test_version_stamp_invalidates_old_entries(monkeypatch):
    """Bumping the version must orphan plans built by older code, rather than
    serving results from a model that no longer exists."""
    k_old = cache.key(tasks=10)
    monkeypatch.setattr(cache, "CACHE_VERSION", "999")
    assert cache.key(tasks=10) != k_old


def test_corrupt_entry_is_discarded_not_served():
    """Half a plan is worse than no plan."""
    k = cache.key(tasks=10)
    cache.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (cache.CACHE_DIR / f"{k}.json").write_text('{"blocks": [1, 2')
    assert cache.load(k) is None
    assert not (cache.CACHE_DIR / f"{k}.json").exists()


def test_writes_are_atomic():
    """Written via a temp file and renamed, so a crash cannot leave a partial
    file that parses."""
    k = cache.key(tasks=10)
    cache.store(k, {"a": 1})
    leftovers = list(cache.CACHE_DIR.glob("*.tmp"))
    assert not leftovers
    assert json.loads((cache.CACHE_DIR / f"{k}.json").read_text()) == {"a": 1}


def test_clear_removes_entries():
    for i in range(3):
        cache.store(cache.key(tasks=i), {"i": i})
    assert cache.clear() == 3
    assert cache.load(cache.key(tasks=0)) is None


def test_precompute_uses_the_api_budget_by_default():
    """The cache is keyed on the solver budget, so precomputing at a
    different one writes entries the server never looks up.

    This bit once: precompute defaulted to 30s while the API asked for 10s,
    so every precomputed plan was invisible.
    """
    import pathlib

    from src.api.app import DEFAULT_UI_BUDGET

    # Read the file rather than importing it: scripts/ is a directory of entry
    # points, not a package, and making it importable just for a test would
    # give it package semantics it does not want.
    source = (pathlib.Path(__file__).resolve().parents[1]
              / "scripts" / "precompute.py").read_text()
    assert "DEFAULT_UI_BUDGET" in source, (
        "precompute must default to the API's budget, not its own"
    )
    assert isinstance(DEFAULT_UI_BUDGET, float)


def test_cache_key_includes_the_budget():
    """Two budgets are two different plans and must not share an entry."""
    base = dict(grounded=True, tasks=120, days=31, seed=42, horizon_start="2026-08-01")
    assert cache.key(**base, time_limit=10.0) != cache.key(**base, time_limit=30.0)
