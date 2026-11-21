"""«Новогодняя Сортировка» — contest for the most festive yard and house of the district.

Residents send 1–5 photos of their yard (all neighbours together) or house / balcony / window. The owner checks each
entry in the admin panel before it is shown. During voting every signed-in resident has one vote per nomination
(sign-in is by phone number, so votes cannot be farmed anonymously). The owner marks the winners; they get gifts.
Participants' names and phones are never public: only the title, the street and the photos are shown.
Tables are created on first use (no migration), like toy_invites.
"""
from __future__ import annotations

import base64
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text

KZ = timezone(timedelta(hours=5))
NOMINATIONS = ("yard", "house")
STATUSES = ("pending", "published", "rejected")
MAX_PHOTOS = 5
MAX_PHOTO_BYTES = 900_000
PHOTOS_PER_DAY = 40
PHOTO_KEY_RE = re.compile(r"^[a-f0-9]{16}$")

DEFAULTS: dict[str, Any] = {
    "enabled": True,
    "apply_from": "2026-12-01",
    "apply_to": "2026-12-20",
    "vote_from": "2026-12-21",
    "vote_to": "2026-12-27",
    "prizes_ru": "1, 2 и 3 место в каждой номинации — по 10 000 тг и грамота. Каждый участник получит благодарственное письмо "
                 "от Сортировка 24, «Сортировка Официал» и спонсоров.",
    "prizes_kz": "Әр номинацияда 1, 2 және 3 орын — 10 000 тг-ден және мақтау грамотасы. Әр қатысушы Сортировка 24, "
                 "«Сортировка Официал» және демеушілерден алғыс хат алады.",
}
_DATES = ("apply_from", "apply_to", "vote_from", "vote_to")
_ready: set[int] = set()


class ContestError(ValueError):
    """A resident's request that cannot be done; the message is shown to them as is."""


def now_iso() -> str:
    return datetime.now(KZ).isoformat(timespec="seconds")


def today() -> str:
    return datetime.now(KZ).date().isoformat()


async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    try:
        await _create_tables(db)
    except Exception:
        await db.rollback()  # two first requests at once: the other one created the tables
        await _create_tables(db)
    _ready.add(key)


async def _create_tables(db) -> None:
    dialect = getattr(getattr(db, "bind", None), "dialect", None)
    pk = "SERIAL PRIMARY KEY" if getattr(dialect, "name", "") == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"
    await db.execute(text(
        f"CREATE TABLE IF NOT EXISTS contest_entries (id {pk}, user_id VARCHAR(64) NOT NULL, nomination VARCHAR(16) NOT NULL, "
        "title VARCHAR(80), street VARCHAR(80), about TEXT, photos TEXT, status VARCHAR(16), reason VARCHAR(200), "
        "place INTEGER, created_at VARCHAR(32), updated_at VARCHAR(32))"))
    await db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS contest_entries_one ON contest_entries (user_id, nomination)"))
    await db.execute(text(
        f"CREATE TABLE IF NOT EXISTS contest_votes (id {pk}, user_id VARCHAR(64) NOT NULL, nomination VARCHAR(16) NOT NULL, "
        "entry_id INTEGER NOT NULL, created_at VARCHAR(32))"))
    await db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS contest_votes_one ON contest_votes (user_id, nomination)"))
    await db.execute(text(
        "CREATE TABLE IF NOT EXISTS contest_photos (key VARCHAR(24) PRIMARY KEY, user_id VARCHAR(64), data TEXT, created_at VARCHAR(32))"))
    await db.execute(text("CREATE TABLE IF NOT EXISTS contest_settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL)"))
    await db.commit()


# ---------------- settings and phase ----------------
def _valid_date(value: Any, fallback: str) -> str:
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return fallback


def clean_settings(raw: dict) -> dict:
    out = dict(DEFAULTS)
    if "enabled" in raw:
        out["enabled"] = bool(raw["enabled"])
    for key in _DATES:
        out[key] = _valid_date(raw.get(key, out[key]), DEFAULTS[key])
    for key in ("prizes_ru", "prizes_kz"):
        if isinstance(raw.get(key), str) and raw[key].strip():
            out[key] = raw[key].strip()[:600]
    return out


def phase(s: dict, day: Optional[str] = None) -> str:
    """off → soon → apply → (wait) → vote → results."""
    day = day or today()
    if not s["enabled"]:
        return "off"
    if day < s["apply_from"]:
        return "soon"
    if day <= s["apply_to"]:
        return "apply"
    if day < s["vote_from"]:
        return "wait"
    if day <= s["vote_to"]:
        return "vote"
    return "results"


async def get_settings(db) -> dict:
    await ensure_tables(db)
    row = (await db.execute(text("SELECT data FROM contest_settings WHERE id = 1"))).first()
    return clean_settings(json.loads(row[0]) if row else {})


async def save_settings(db, updates: dict) -> dict:
    merged = clean_settings({**(await get_settings(db)), **updates})
    for a, b in (("apply_from", "apply_to"), ("apply_to", "vote_from"), ("vote_from", "vote_to")):
        if merged[a] > merged[b]:
            raise ContestError("Даты идут не по порядку: приём заявок, потом голосование")
    data = json.dumps(merged, ensure_ascii=False)
    if not (await db.execute(text("UPDATE contest_settings SET data = :d WHERE id = 1"), {"d": data})).rowcount:
        await db.execute(text("INSERT INTO contest_settings (id, data) VALUES (1, :d)"), {"d": data})
    await db.commit()
    return merged


# ---------------- photos ----------------
def decode_photo(data_url: str) -> bytes:
    match = re.match(r"^data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$", str(data_url or "").strip())
    if not match:
        raise ContestError("Пришлите фото (JPG или PNG)")
    raw = base64.b64decode(match.group(2), validate=True)
    if len(raw) > MAX_PHOTO_BYTES:
        raise ContestError("Фото слишком большое")
    if len(raw) < 1500:
        raise ContestError("Фото не читается — попробуйте другое")
    return raw


async def save_photo(db, user_id: str, data_url: str) -> str:
    raw = decode_photo(data_url)
    await ensure_tables(db)
    since = (datetime.now(KZ) - timedelta(days=1)).isoformat(timespec="seconds")
    count = (await db.execute(text("SELECT COUNT(*) FROM contest_photos WHERE user_id = :u AND created_at >= :s"),
                              {"u": user_id, "s": since})).scalar() or 0
    if count >= PHOTOS_PER_DAY:
        raise ContestError("Слишком много фото за сутки — попробуйте завтра")
    key = secrets.token_hex(8)
    await db.execute(text("INSERT INTO contest_photos (key, user_id, data, created_at) VALUES (:k, :u, :d, :t)"),
                     {"k": key, "u": user_id, "d": base64.b64encode(raw).decode(), "t": now_iso()})
    await db.commit()
    return key


async def photo_bytes(db, key: str) -> Optional[bytes]:
    if not PHOTO_KEY_RE.match(key or ""):
        return None
    await ensure_tables(db)
    value = (await db.execute(text("SELECT data FROM contest_photos WHERE key = :k"), {"k": key})).scalar()
    return base64.b64decode(value) if value else None


async def _own_photos(db, user_id: str, keys: list) -> list[str]:
    keys = [k for k in keys if isinstance(k, str) and PHOTO_KEY_RE.match(k)][:MAX_PHOTOS]
    if not keys:
        return []
    marks = ", ".join(f":k{i}" for i in range(len(keys)))
    found = {r[0] for r in (await db.execute(text(f"SELECT key FROM contest_photos WHERE user_id = :u AND key IN ({marks})"),
                                             {"u": user_id, **{f"k{i}": k for i, k in enumerate(keys)}})).all()}
    return [k for k in keys if k in found]


# ---------------- entries ----------------
def _row(r) -> dict:
    return {"id": r.id, "user_id": r.user_id, "nomination": r.nomination, "title": r.title or "", "street": r.street or "",
            "about": r.about or "", "photos": json.loads(r.photos or "[]"), "status": r.status, "reason": r.reason or "",
            "place": r.place, "created_at": r.created_at}


async def _votes(db) -> dict[int, int]:
    rows = (await db.execute(text("SELECT entry_id, COUNT(*) FROM contest_votes GROUP BY entry_id"))).all()
    return {int(r[0]): int(r[1]) for r in rows}


async def submit(db, user_id: str, body: dict) -> dict:
    settings = await get_settings(db)
    if phase(settings) != "apply":
        raise ContestError("Приём заявок сейчас закрыт")
    nomination = body.get("nomination")
    if nomination not in NOMINATIONS:
        raise ContestError("Выберите номинацию")
    title = str(body.get("title") or "").strip()[:80]
    street = str(body.get("street") or "").strip()[:80]
    about = str(body.get("about") or "").strip()[:500]
    if len(title) < 3 or len(street) < 3:
        raise ContestError("Напишите название и улицу")
    photos = await _own_photos(db, user_id, list(body.get("photos") or []))
    if not photos:
        raise ContestError("Добавьте хотя бы одно фото")
    params = {"u": user_id, "n": nomination, "ti": title, "s": street, "a": about, "p": json.dumps(photos), "t": now_iso()}
    existing = (await db.execute(text("SELECT id, status FROM contest_entries WHERE user_id = :u AND nomination = :n"), params)).first()
    if existing and existing.status == "published":
        raise ContestError("Заявка уже опубликована — изменить её можно через администратора")
    if existing:
        await db.execute(text("UPDATE contest_entries SET title = :ti, street = :s, about = :a, photos = :p, status = 'pending', "
                              "reason = NULL, updated_at = :t WHERE id = :id"), {**params, "id": existing.id})
    else:
        await db.execute(text("INSERT INTO contest_entries (user_id, nomination, title, street, about, photos, status, created_at, updated_at) "
                              "VALUES (:u, :n, :ti, :s, :a, :p, 'pending', :t, :t)"), params)
    await db.commit()
    row = (await db.execute(text("SELECT * FROM contest_entries WHERE user_id = :u AND nomination = :n"), params)).first()
    return _row(row)


async def withdraw(db, user_id: str, entry_id: int) -> None:
    row = (await db.execute(text("SELECT id, status FROM contest_entries WHERE id = :id AND user_id = :u"),
                            {"id": entry_id, "u": user_id})).first()
    if not row:
        raise ContestError("Заявка не найдена")
    await db.execute(text("DELETE FROM contest_votes WHERE entry_id = :id"), {"id": entry_id})
    await db.execute(text("DELETE FROM contest_entries WHERE id = :id"), {"id": entry_id})
    await db.commit()


async def vote(db, user_id: str, entry_id: int) -> None:
    if phase(await get_settings(db)) != "vote":
        raise ContestError("Голосование сейчас закрыто")
    entry = (await db.execute(text("SELECT id, user_id, nomination, status FROM contest_entries WHERE id = :id"), {"id": entry_id})).first()
    if not entry or entry.status != "published":
        raise ContestError("Участник не найден")
    if entry.user_id == user_id:
        raise ContestError("За свою заявку голосовать нельзя")
    done = (await db.execute(text("SELECT 1 FROM contest_votes WHERE user_id = :u AND nomination = :n"),
                             {"u": user_id, "n": entry.nomination})).first()
    if done:
        raise ContestError("Вы уже проголосовали в этой номинации")
    await db.execute(text("INSERT INTO contest_votes (user_id, nomination, entry_id, created_at) VALUES (:u, :n, :e, :t)"),
                     {"u": user_id, "n": entry.nomination, "e": entry_id, "t": now_iso()})
    await db.commit()


async def public_view(db, user_id: Optional[str]) -> dict:
    """Everything the contest page shows. Vote counts appear only once voting has started."""
    settings = await get_settings(db)
    current = phase(settings)
    counts = await _votes(db) if current in ("vote", "results") else {}
    rows = (await db.execute(text("SELECT * FROM contest_entries WHERE status = 'published' ORDER BY id"))).all()
    entries = []
    for r in rows:
        e = _row(r)
        entries.append({k: e[k] for k in ("id", "nomination", "title", "street", "about", "photos", "place")}
                       | {"votes": counts.get(e["id"], 0) if counts else None, "mine": e["user_id"] == user_id})
    if current in ("vote", "results"):
        entries.sort(key=lambda e: (e["place"] or 99, -(e["votes"] or 0), e["id"]))
    mine: dict = {"entries": [], "votes": {}}
    if user_id:
        own = (await db.execute(text("SELECT * FROM contest_entries WHERE user_id = :u ORDER BY id"), {"u": user_id})).all()
        mine["entries"] = [{k: v for k, v in _row(r).items() if k != "user_id"} for r in own]
        voted = (await db.execute(text("SELECT nomination, entry_id FROM contest_votes WHERE user_id = :u"), {"u": user_id})).all()
        mine["votes"] = {r[0]: int(r[1]) for r in voted}
    public_settings = {k: settings[k] for k in ("apply_from", "apply_to", "vote_from", "vote_to", "prizes_ru", "prizes_kz")}
    return {"phase": current, "settings": public_settings, "entries": entries, "mine": mine, "signed_in": bool(user_id)}


# ---------------- admin ----------------
async def admin_view(db) -> dict:
    settings = await get_settings(db)
    counts = await _votes(db)
    rows = (await db.execute(text(
        "SELECT e.*, u.name AS user_name, u.phone AS user_phone FROM contest_entries e "
        "LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC"))).all()
    entries = [_row(r) | {"votes": counts.get(r.id, 0), "user_name": r.user_name or "", "user_phone": r.user_phone or ""} for r in rows]
    return {"settings": settings, "phase": phase(settings), "entries": entries}


async def admin_update(db, entry_id: int, body: dict) -> None:
    row = (await db.execute(text("SELECT id FROM contest_entries WHERE id = :id"), {"id": entry_id})).first()
    if not row:
        raise ContestError("Заявка не найдена")
    sets, params = [], {"id": entry_id, "t": now_iso()}
    if "status" in body:
        if body["status"] not in STATUSES:
            raise ContestError("Неизвестный статус")
        sets.append("status = :st")
        params["st"] = body["status"]
        sets.append("reason = :r")
        params["r"] = str(body.get("reason") or "").strip()[:200] or None
    if "place" in body:
        place = body["place"]
        if place not in (None, 1, 2, 3):
            raise ContestError("Место — 1, 2 или 3")
        sets.append("place = :pl")
        params["pl"] = place
    if sets:
        await db.execute(text(f"UPDATE contest_entries SET {', '.join(sets)}, updated_at = :t WHERE id = :id"), params)
        await db.commit()
