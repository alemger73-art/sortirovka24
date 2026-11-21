"""Seasonal (New Year) decoration settings — one JSON row, edited in the admin panel, read by every page."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy import text

DEFAULTS: Dict[str, Any] = {
    "enabled": True,           # master switch; off → the site looks exactly as usual
    "starts_at": "2026-12-01",  # Asia/Almaty dates, inclusive
    "ends_at": "2027-01-14",
    "snow": True,
    "snow_intensity": 2,       # 1 light · 2 normal · 3 heavy
    "garland": True,
    "countdown": True,
    "hero_image": "/seasonal/ny-hero.webp",
    "title_ru": "Новогодняя Сортировка",
    "title_kz": "Жаңажылдық Сортировка",
    "greeting_ru": "С Новым 2027 годом, Сортировка!",
    "greeting_kz": "Жаңа 2027 жылыңызбен, Сортировка!",
}
_BOOLS = ("enabled", "snow", "garland", "countdown")
_TEXTS = ("hero_image", "title_ru", "title_kz", "greeting_ru", "greeting_kz")
_ready: set[int] = set()


async def _ensure_table(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    await db.execute(text("CREATE TABLE IF NOT EXISTS seasonal_settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at VARCHAR(32))"))
    await db.commit()
    _ready.add(key)


def _valid_date(value: Any, fallback: str) -> str:
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return fallback


def clean(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Defaults merged with known keys only, each coerced to its type."""
    out = dict(DEFAULTS)
    for key in _BOOLS:
        if key in raw:
            out[key] = bool(raw[key])
    for key in _TEXTS:
        if isinstance(raw.get(key), str):
            out[key] = raw[key].strip()[:300] or DEFAULTS[key]
    if "snow_intensity" in raw:
        try:
            out["snow_intensity"] = min(3, max(1, int(raw["snow_intensity"])))
        except (TypeError, ValueError):
            pass
    out["starts_at"] = _valid_date(raw.get("starts_at", out["starts_at"]), DEFAULTS["starts_at"])
    out["ends_at"] = _valid_date(raw.get("ends_at", out["ends_at"]), DEFAULTS["ends_at"])
    return out


async def get_settings(db) -> Dict[str, Any]:
    await _ensure_table(db)
    row = (await db.execute(text("SELECT data FROM seasonal_settings WHERE id = 1"))).first()
    return clean(json.loads(row[0]) if row else {})


async def save_settings(db, updates: Dict[str, Any]) -> Dict[str, Any]:
    current = await get_settings(db)
    merged = clean({**current, **updates})
    data = json.dumps(merged, ensure_ascii=False)
    now = datetime.now(timezone.utc).isoformat()
    updated = await db.execute(text("UPDATE seasonal_settings SET data = :d, updated_at = :t WHERE id = 1"), {"d": data, "t": now})
    if not updated.rowcount:
        await db.execute(text("INSERT INTO seasonal_settings (id, data, updated_at) VALUES (1, :d, :t)"), {"d": data, "t": now})
    await db.commit()
    return merged
