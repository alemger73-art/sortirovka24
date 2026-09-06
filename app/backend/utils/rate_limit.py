"""Rate limiting with optional Redis backend (REDIS_URL) and in-memory fallback."""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

_RATE_BUCKETS: dict[str, list[float]] = {}
_redis_client = None
_redis_checked = False


def _get_redis():
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        return None
    try:
        import redis

        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        client.ping()
        _redis_client = client
        logger.info("Rate limiter using Redis")
    except Exception as exc:
        logger.warning("Redis unavailable for rate limiting, using in-memory fallback: %s", exc)
        _redis_client = None
    return _redis_client


def _redis_hit(key: str, *, window_seconds: float, max_hits: int) -> bool:
    client = _get_redis()
    if not client:
        return False
    try:
        count = client.incr(key)
        if count == 1:
            client.expire(key, max(1, int(window_seconds)))
        return int(count) > max_hits
    except Exception as exc:
        logger.warning("Redis rate limit error: %s", exc)
        return False


def _memory_hit(key: str, *, window_seconds: float, max_hits: int) -> bool:
    now = time.time()
    hits = [t for t in _RATE_BUCKETS.get(key, []) if now - t < window_seconds]
    if len(hits) >= max_hits:
        _RATE_BUCKETS[key] = hits
        return True
    hits.append(now)
    _RATE_BUCKETS[key] = hits
    # Evict stale bucket keys so memory stays bounded without Redis.
    if len(_RATE_BUCKETS) > 10_000:
        stale = [
            k for k, ts in _RATE_BUCKETS.items()
            if not ts or now - ts[-1] >= window_seconds
        ]
        for k in stale:
            _RATE_BUCKETS.pop(k, None)
        # If still over cap (all keys active), drop oldest by last hit.
        if len(_RATE_BUCKETS) > 10_000:
            overflow = sorted(
                _RATE_BUCKETS.items(),
                key=lambda item: item[1][-1] if item[1] else 0.0,
            )
            for k, _ in overflow[: len(_RATE_BUCKETS) - 10_000]:
                _RATE_BUCKETS.pop(k, None)
    return False


def check_keyed_rate_limit(
    key: str,
    *,
    window_seconds: float = 3600.0,
    max_hits: int = 10,
    message: str = "Слишком много запросов. Попробуйте позже.",
) -> None:
    bucket_key = f"rl:{key}"
    exceeded = _redis_hit(bucket_key, window_seconds=window_seconds, max_hits=max_hits)
    if not exceeded and _get_redis() is None:
        exceeded = _memory_hit(bucket_key, window_seconds=window_seconds, max_hits=max_hits)
    if exceeded:
        raise HTTPException(status_code=429, detail=message)


def check_ip_rate_limit(
    request: Request,
    *,
    key_prefix: str,
    window_seconds: float = 3600.0,
    max_hits: int = 10,
    message: str = "Слишком много запросов. Попробуйте позже.",
) -> None:
    ip = request.client.host if request.client else "unknown"
    check_keyed_rate_limit(
        f"{key_prefix}:{ip}",
        window_seconds=window_seconds,
        max_hits=max_hits,
        message=message,
    )
