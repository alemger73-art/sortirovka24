"""Unit tests for in-memory rate limiter."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from utils import rate_limit


@pytest.fixture(autouse=True)
def _clear_buckets():
    rate_limit._RATE_BUCKETS.clear()
    yield
    rate_limit._RATE_BUCKETS.clear()


def test_rate_limit_blocks_over_max():
    for _ in range(3):
        rate_limit.check_keyed_rate_limit("test-key", window_seconds=60, max_hits=3)
    with pytest.raises(HTTPException) as exc:
        rate_limit.check_keyed_rate_limit("test-key", window_seconds=60, max_hits=3)
    assert exc.value.status_code == 429


def test_rate_limit_evicts_stale_buckets(monkeypatch):
    import time

    monkeypatch.setattr(rate_limit, "_RATE_BUCKETS", {"stale": [0.0]})
    now = time.time()
    for i in range(50):
        rate_limit._memory_hit(f"k{i}", window_seconds=60, max_hits=100)
    # Force eviction path
    for i in range(50, 10_050):
        rate_limit._memory_hit(f"k{i}", window_seconds=60, max_hits=100)
    assert "stale" not in rate_limit._RATE_BUCKETS
    assert len(rate_limit._RATE_BUCKETS) <= 10_000
