"""Real statistics for «Объявления»: what each ad's owner sees in the cabinet.

One row per (ad, action, visitor, day): a person who opens the same ad ten times a day is one view.
Actions: impression (shown in the list), view (opened), phone (tapped «Позвонить»), whatsapp, share.
Saves (❤) are kept as current state per visitor, so «сохранили» is how many people have it saved now.
The owner's own actions and bots are not counted. Tables are created on first use (no migration).
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

KINDS = ("impression", "view", "phone", "whatsapp", "share")
CONTACT_KINDS = ("phone", "whatsapp")
BOT_RE = re.compile(r"bot|crawl|spider|slurp|headless|preview|facebookexternalhit|whatsapp/|telegram|lighthouse|curl|python|wget", re.I)
VISITOR_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
KZ = timezone(timedelta(hours=5))

_ready: set[int] = set()


async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    await db.execute(text(
        "CREATE TABLE IF NOT EXISTS ad_events (ann_id INTEGER NOT NULL, kind VARCHAR(16) NOT NULL, "
        "visitor VARCHAR(64) NOT NULL, day VARCHAR(10) NOT NULL, created_at VARCHAR(32))"))
    await db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ad_events_once ON ad_events (ann_id, kind, visitor, day)"))
    await db.execute(text("CREATE INDEX IF NOT EXISTS ad_events_ann ON ad_events (ann_id, day)"))
    await db.execute(text(
        "CREATE TABLE IF NOT EXISTS ad_saves (ann_id INTEGER NOT NULL, visitor VARCHAR(64) NOT NULL, created_at VARCHAR(32))"))
    await db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ad_saves_once ON ad_saves (ann_id, visitor)"))
    await db.commit()
    _ready.add(key)


def is_bot(user_agent: str | None) -> bool:
    return not user_agent or bool(BOT_RE.search(user_agent))


def visitor_key(raw: str | None, ip: str, user_agent: str) -> str:
    """The browser's own random id; without it — a hash of address and browser (never stored as is)."""
    raw = (raw or "").strip()
    if VISITOR_RE.match(raw):
        return raw
    return "h" + hashlib.sha256(f"{ip}|{user_agent}".encode()).hexdigest()[:31]


async def owned_ids(db, ids: list[int], user) -> set[int]:
    """Ads among ids that belong to the signed-in person (their own clicks are not counted)."""
    if not user or not ids:
        return set()
    from services.cabinet_history import owns_content
    rows = (await db.execute(text(
        f"SELECT id, user_id, phone FROM announcements WHERE id IN ({','.join(str(int(i)) for i in ids)})"))).all()
    return {r.id for r in rows if owns_content(user, r.user_id, r.phone)}


async def record(db, events: list[tuple[int, str]], visitor: str) -> int:
    """Store events once per visitor and day; a new «view» also bumps announcements.views_count."""
    await ensure_tables(db)
    now = datetime.now(KZ)
    day, stamp = now.date().isoformat(), now.isoformat(timespec="seconds")
    added = 0
    for ann_id, kind in events:
        res = await db.execute(text(
            "INSERT INTO ad_events (ann_id, kind, visitor, day, created_at) VALUES (:a, :k, :v, :d, :t) "
            "ON CONFLICT DO NOTHING"), {"a": ann_id, "k": kind, "v": visitor, "d": day, "t": stamp})
        if res.rowcount:
            added += 1
            if kind == "view":
                await db.execute(text("UPDATE announcements SET views_count = COALESCE(views_count, 0) + 1 WHERE id = :a"), {"a": ann_id})
    await db.commit()
    return added


async def set_saved(db, ann_id: int, visitor: str, saved: bool) -> None:
    await ensure_tables(db)
    if saved:
        await db.execute(text("INSERT INTO ad_saves (ann_id, visitor, created_at) VALUES (:a, :v, :t) ON CONFLICT DO NOTHING"),
                         {"a": ann_id, "v": visitor, "t": datetime.now(KZ).isoformat(timespec="seconds")})
    else:
        await db.execute(text("DELETE FROM ad_saves WHERE ann_id = :a AND visitor = :v"), {"a": ann_id, "v": visitor})
    await db.commit()


async def summaries(db, ids: list[int]) -> dict[int, dict]:
    """Short numbers for the cabinet list: unique people who opened, saves now, contacts."""
    if not ids:
        return {}
    await ensure_tables(db)
    id_list = ",".join(str(int(i)) for i in ids)
    out = {i: {"views": 0, "people": 0, "saves": 0, "contacts": 0, "impressions": 0} for i in ids}
    for r in (await db.execute(text(
            f"SELECT ann_id, kind, COUNT(*) AS n, COUNT(DISTINCT visitor) AS people FROM ad_events "
            f"WHERE ann_id IN ({id_list}) GROUP BY ann_id, kind"))).all():
        s = out[r.ann_id]
        if r.kind == "view":
            s["views"], s["people"] = int(r.n), int(r.people)
        elif r.kind in CONTACT_KINDS:
            s["contacts"] += int(r.n)
        elif r.kind == "impression":
            s["impressions"] = int(r.n)
    for r in (await db.execute(text(f"SELECT ann_id, COUNT(*) AS n FROM ad_saves WHERE ann_id IN ({id_list}) GROUP BY ann_id"))).all():
        out[r.ann_id]["saves"] = int(r.n)
    return out


async def details(db, ann_id: int, days: int = 14) -> dict:
    """Everything for the owner's statistics screen: totals and a day-by-day series."""
    await ensure_tables(db)
    totals = {k: 0 for k in KINDS}
    for r in (await db.execute(text("SELECT kind, COUNT(*) AS n FROM ad_events WHERE ann_id = :a GROUP BY kind"), {"a": ann_id})).all():
        if r.kind in totals:
            totals[r.kind] = int(r.n)
    people = (await db.execute(text("SELECT COUNT(DISTINCT visitor) FROM ad_events WHERE ann_id = :a AND kind = 'view'"), {"a": ann_id})).scalar() or 0
    contacted = (await db.execute(text(
        "SELECT COUNT(DISTINCT visitor) FROM ad_events WHERE ann_id = :a AND kind IN ('phone', 'whatsapp')"), {"a": ann_id})).scalar() or 0
    saves = (await db.execute(text("SELECT COUNT(*) FROM ad_saves WHERE ann_id = :a"), {"a": ann_id})).scalar() or 0
    today = datetime.now(KZ).date()
    start = today - timedelta(days=days - 1)
    series = {(start + timedelta(days=i)).isoformat(): {"views": 0, "contacts": 0, "impressions": 0} for i in range(days)}
    for r in (await db.execute(text(
            "SELECT day, kind, COUNT(*) AS n FROM ad_events WHERE ann_id = :a AND day >= :d GROUP BY day, kind"),
            {"a": ann_id, "d": start.isoformat()})).all():
        if r.day not in series:
            continue
        if r.kind == "view":
            series[r.day]["views"] = int(r.n)
        elif r.kind in CONTACT_KINDS:
            series[r.day]["contacts"] += int(r.n)
        elif r.kind == "impression":
            series[r.day]["impressions"] = int(r.n)
    return {
        "totals": {**totals, "people": int(people), "contacted": int(contacted), "saves": int(saves)},
        "days": [{"day": d, **v} for d, v in series.items()],
        "since": (await db.execute(text("SELECT MIN(day) FROM ad_events WHERE ann_id = :a"), {"a": ann_id})).scalar(),
    }


def today() -> date:
    return datetime.now(KZ).date()
