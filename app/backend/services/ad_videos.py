"""One short video per ad («Видео до 60 секунд»).

The file goes to Cloudinary through the usual upload proxy; here we keep only its object key,
in a table of its own that is created on first use (no migration, the ads table is unchanged).
"""
from __future__ import annotations

import re
import weakref

from sqlalchemy import text

from services.storage import video_delivery_urls

KEY_RE = re.compile(r"^announcements/videos/[A-Za-z0-9_-]{1,64}\.(mp4|mov|webm)$", re.I)
NO_VIDEO = {"video_url": None, "video_poster_url": None}

# Engines that already have the table (weak: a closed test database must not be remembered).
_ready: weakref.WeakSet = weakref.WeakSet()


async def ensure_table(db) -> None:
    if db.bind in _ready:
        return
    try:
        await _create_table(db)
    except Exception:
        # Two first requests at the same moment: the other one created the table — just try once more.
        await db.rollback()
        await _create_table(db)
    _ready.add(db.bind)


async def _create_table(db) -> None:
    await db.execute(text(
        "CREATE TABLE IF NOT EXISTS announcement_videos (announcement_id INTEGER PRIMARY KEY, "
        "video_key TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)"))
    await db.commit()


def clean_key(raw: str | None) -> str | None:
    """'' removes the video; anything else must be a video we stored for an ad."""
    key = (raw or "").strip()
    if not key:
        return None
    if not KEY_RE.match(key):
        raise ValueError("Видео: подходит MP4, MOV или WebM, загруженный через форму объявления")
    return key


async def keys_for(db, ids: list[int]) -> dict[int, str]:
    if not ids:
        return {}
    await ensure_table(db)
    rows = (await db.execute(text(
        f"SELECT announcement_id, video_key FROM announcement_videos "
        f"WHERE announcement_id IN ({','.join(str(int(i)) for i in ids)})"))).all()
    return {int(r.announcement_id): r.video_key for r in rows}


async def set_video(db, ann_id: int, key: str | None) -> bool:
    """Save or remove the ad's video. True when it changed (then the ad goes to moderation again)."""
    current = (await keys_for(db, [ann_id])).get(int(ann_id))
    if current == key:
        return False
    await db.execute(text("DELETE FROM announcement_videos WHERE announcement_id = :a"), {"a": ann_id})
    if key:
        await db.execute(text("INSERT INTO announcement_videos (announcement_id, video_key) VALUES (:a, :k)"),
                         {"a": ann_id, "k": key})
    await db.commit()
    return True


def urls(key: str | None) -> dict:
    built = video_delivery_urls(key) if key else None
    return {"video_url": built[0], "video_poster_url": built[1]} if built else dict(NO_VIDEO)


async def urls_for(db, ids: list[int]) -> dict[int, dict]:
    """video_url / video_poster_url for every id (one query for the whole list)."""
    keys = await keys_for(db, ids)
    return {int(i): urls(keys.get(int(i))) for i in ids}


async def video_url(db, ann_id: int) -> str | None:
    return (await urls_for(db, [ann_id]))[int(ann_id)]["video_url"]
