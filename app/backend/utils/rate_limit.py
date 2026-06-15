import time

from fastapi import HTTPException, Request

_RATE_BUCKETS: dict[str, list[float]] = {}


def check_ip_rate_limit(
    request: Request,
    *,
    key_prefix: str,
    window_seconds: float = 3600.0,
    max_hits: int = 10,
    message: str = "Слишком много запросов. Попробуйте позже.",
) -> None:
    ip = request.client.host if request.client else "unknown"
    bucket_key = f"{key_prefix}:{ip}"
    now = time.time()
    hits = [t for t in _RATE_BUCKETS.get(bucket_key, []) if now - t < window_seconds]
    if len(hits) >= max_hits:
        raise HTTPException(status_code=429, detail=message)
    hits.append(now)
    _RATE_BUCKETS[bucket_key] = hits
