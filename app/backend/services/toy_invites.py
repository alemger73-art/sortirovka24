"""«Шақыру» — electronic invitations to a той, sold on Сортировка 24.

A person builds an invitation (kind, names, date, place, programme, design), sees a preview, then asks to publish it.
The owner gets the order in Telegram; the support WhatsApp number sends the person the price and the Kaspi link.
The owner taps «Оплачено» → the invitation opens for guests at /toy/<slug>. Guests answer «Приду / Не смогу»,
the host sees the list in «Мои приглашения». Tables are created on first use (no migration), like ad_stats.
"""
from __future__ import annotations

import html
import json
import logging
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import text

logger = logging.getLogger(__name__)
KZ = timezone(timedelta(hours=5))
SITE = os.getenv("PUBLIC_SITE_URL", "https://www.sortirovka24.kz").rstrip("/")
CALLBACK_RE = re.compile(r"^ty:(p|r):(\d+)$")
KINDS = ("wedding", "uzatu", "sundet", "tusau", "merey")
THEMES = ("night", "ivory", "pomegranate", "sky")
STATUSES = ("draft", "pending", "published", "rejected", "archived")
KIND_TITLES = {"wedding": "Үйлену тойы / Свадьба", "uzatu": "Қыз ұзату", "sundet": "Сүндет той",
               "tusau": "Тұсаукесер", "merey": "Мерейтой / Юбилей"}
MAX_DRAFTS = 10

DEFAULT_SETTINGS: dict[str, Any] = {"enabled": True, "price": 4990, "kaspi_link": ""}

_ready: set[int] = set()


def now_iso() -> str:
    return datetime.now(KZ).isoformat(timespec="seconds")


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
        f"CREATE TABLE IF NOT EXISTS toy_invites (id {pk}, slug VARCHAR(64) NOT NULL, user_id VARCHAR(64), "
        "phone VARCHAR(20), status VARCHAR(16), data TEXT, price INTEGER, views INTEGER DEFAULT 0, "
        "created_at VARCHAR(32), updated_at VARCHAR(32), paid_at VARCHAR(32))"))
    await db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS toy_invites_slug ON toy_invites (slug)"))
    await db.execute(text("CREATE INDEX IF NOT EXISTS toy_invites_user ON toy_invites (user_id)"))
    await db.execute(text(
        f"CREATE TABLE IF NOT EXISTS toy_rsvps (id {pk}, invite_id INTEGER NOT NULL, visitor VARCHAR(64) NOT NULL, "
        "name VARCHAR(80), coming INTEGER, guests INTEGER, wish TEXT, created_at VARCHAR(32), updated_at VARCHAR(32))"))
    await db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS toy_rsvps_once ON toy_rsvps (invite_id, visitor)"))
    await db.execute(text("CREATE TABLE IF NOT EXISTS toy_settings (key VARCHAR(40) PRIMARY KEY, value TEXT)"))
    await db.commit()


# ---------------- settings ----------------
def _clean_settings(raw: dict) -> dict:
    out = dict(DEFAULT_SETTINGS)
    if "enabled" in raw:
        out["enabled"] = bool(raw["enabled"])
    try:
        price = int(str(raw.get("price", out["price"])).replace(" ", ""))
        if 0 < price <= 1_000_000:
            out["price"] = price
    except ValueError:
        pass
    link = str(raw.get("kaspi_link") or "").strip()
    out["kaspi_link"] = link[:300] if link.startswith("https://") else ""
    return out


async def get_settings(db) -> dict:
    await ensure_tables(db)
    value = (await db.execute(text("SELECT value FROM toy_settings WHERE key = 'config'"))).scalar()
    try:
        return _clean_settings(json.loads(value) if value else {})
    except (ValueError, TypeError):
        return _clean_settings({})


async def save_settings(db, raw: dict) -> dict:
    cfg = _clean_settings(raw or {})
    await ensure_tables(db)
    await db.execute(text("DELETE FROM toy_settings WHERE key = 'config'"))
    await db.execute(text("INSERT INTO toy_settings (key, value) VALUES ('config', :v)"), {"v": json.dumps(cfg)})
    await db.commit()
    return cfg


def money(n: int) -> str:
    return f"{int(n):,}".replace(",", " ") + " тг"


# ---------------- invitation data ----------------
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _s(v: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:limit]


def _text(v: Any, limit: int) -> str:
    return re.sub(r"[ \t]+", " ", str(v or "")).strip()[:limit]


def clean_data(raw: dict) -> dict:
    """Keeps only known fields with sane lengths. Raises ValueError with a message for the person."""
    raw = raw or {}
    kind = raw.get("kind") if raw.get("kind") in KINDS else "wedding"
    theme = raw.get("theme") if raw.get("theme") in THEMES else "night"
    first, second = _s(raw.get("name1"), 40), _s(raw.get("name2"), 40)
    if not first:
        raise ValueError("Напишите имя" if kind != "wedding" else "Напишите имена жениха и невесты")
    if kind == "wedding" and not second:
        raise ValueError("Напишите имя невесты")
    day = _s(raw.get("date"), 10)
    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise ValueError("Укажите дату тоя") from None
    today = datetime.now(KZ).date()
    if d < today - timedelta(days=1) or d > today + timedelta(days=730):
        raise ValueError("Проверьте дату тоя")
    tm = _s(raw.get("time"), 5)
    if not TIME_RE.match(tm):
        raise ValueError("Укажите время начала, например 18:00")
    map_url = _s(raw.get("map_url"), 300)
    if map_url and not map_url.startswith("https://"):
        map_url = ""
    photo = _s(raw.get("photo"), 400)
    if photo and not photo.startswith("https://"):
        photo = ""
    program = []
    for item in (raw.get("program") or [])[:8]:
        if not isinstance(item, dict):
            continue
        t = _s(item.get("time"), 5)
        kz, ru = _s(item.get("kz"), 120), _s(item.get("ru"), 120)
        if (kz or ru) and (not t or TIME_RE.match(t)):
            program.append({"time": t, "kz": kz, "ru": ru})
    langs = raw.get("langs") if raw.get("langs") in ("both", "kz", "ru") else "both"
    return {
        "kind": kind, "theme": theme, "langs": langs, "name1": first, "name2": second if kind == "wedding" else _s(raw.get("name2"), 40),
        "date": d.isoformat(), "time": tm,
        "place": _s(raw.get("place"), 80), "address": _s(raw.get("address"), 160), "map_url": map_url,
        "hosts": _s(raw.get("hosts"), 120), "text_kz": _text(raw.get("text_kz"), 700), "text_ru": _text(raw.get("text_ru"), 700),
        "program": program, "photo": photo,
    }


_TRANSLIT = str.maketrans({"а": "a", "ә": "a", "б": "b", "в": "v", "г": "g", "ғ": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
                           "з": "z", "и": "i", "й": "i", "і": "i", "к": "k", "қ": "q", "л": "l", "м": "m", "н": "n", "ң": "n",
                           "о": "o", "ө": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ұ": "u", "ү": "u", "ф": "f",
                           "х": "h", "һ": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "y", "ь": "", "э": "e",
                           "ю": "yu", "я": "ya"})


def make_slug(data: dict) -> str:
    base = "-".join(p for p in (data.get("name1", ""), data.get("name2", "")) if p).lower().translate(_TRANSLIT)
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:30] or "toy"
    return f"{base}-{secrets.token_hex(2)}"


def _row(r) -> dict:
    d = dict(r._mapping)
    try:
        d["data"] = json.loads(d.get("data") or "{}")
    except ValueError:
        d["data"] = {}
    return d


async def get_invite(db, invite_id: int) -> Optional[dict]:
    await ensure_tables(db)
    r = (await db.execute(text("SELECT * FROM toy_invites WHERE id = :i"), {"i": invite_id})).first()
    return _row(r) if r else None


async def get_by_slug(db, slug: str) -> Optional[dict]:
    await ensure_tables(db)
    r = (await db.execute(text("SELECT * FROM toy_invites WHERE slug = :s"), {"s": slug[:64]})).first()
    return _row(r) if r else None


async def list_for_user(db, user_id: str) -> list[dict]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT * FROM toy_invites WHERE user_id = :u AND status <> 'archived' ORDER BY id DESC LIMIT 50"),
                             {"u": user_id})).all()
    return [_row(r) for r in rows]


async def list_all(db, limit: int = 100) -> list[dict]:
    await ensure_tables(db)
    return [_row(r) for r in (await db.execute(text("SELECT * FROM toy_invites ORDER BY id DESC LIMIT :n"), {"n": limit})).all()]


async def create(db, *, user_id: str, phone: str, data: dict) -> dict:
    await ensure_tables(db)
    drafts = (await db.execute(text("SELECT COUNT(*) FROM toy_invites WHERE user_id = :u AND status IN ('draft', 'pending')"),
                               {"u": user_id})).scalar() or 0
    if drafts >= MAX_DRAFTS:
        raise ValueError("У вас уже много черновиков. Удалите лишние в «Моих приглашениях».")
    stamp = now_iso()
    for _ in range(5):
        slug = make_slug(data)
        if not await get_by_slug(db, slug):
            break
    res = await db.execute(text(
        "INSERT INTO toy_invites (slug, user_id, phone, status, data, price, views, created_at, updated_at) "
        "VALUES (:s, :u, :p, 'draft', :d, NULL, 0, :t, :t) RETURNING id"),
        {"s": slug, "u": user_id, "p": phone, "d": json.dumps(data, ensure_ascii=False), "t": stamp})
    new_id = res.scalar()
    await db.commit()
    return await get_invite(db, int(new_id))


async def update_data(db, invite_id: int, data: dict) -> dict:
    await db.execute(text("UPDATE toy_invites SET data = :d, updated_at = :t WHERE id = :i"),
                     {"d": json.dumps(data, ensure_ascii=False), "t": now_iso(), "i": invite_id})
    await db.commit()
    return await get_invite(db, invite_id)


async def set_status(db, invite_id: int, status: str, **extra) -> dict:
    fields = {"status": status, "updated_at": now_iso(), **extra}
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    await db.execute(text(f"UPDATE toy_invites SET {sets} WHERE id = :id"), {**fields, "id": invite_id})
    await db.commit()
    return await get_invite(db, invite_id)


async def add_view(db, invite_id: int) -> None:
    await db.execute(text("UPDATE toy_invites SET views = COALESCE(views, 0) + 1 WHERE id = :i"), {"i": invite_id})
    await db.commit()


# ---------------- guests ----------------
async def save_rsvp(db, invite_id: int, visitor: str, name: str, coming: bool, guests: int, wish: str) -> dict:
    await ensure_tables(db)
    stamp = now_iso()
    params = {"i": invite_id, "v": visitor, "n": name[:80], "c": 1 if coming else 0,
              "g": max(1, min(10, guests)) if coming else 0, "w": wish[:400], "t": stamp}
    updated = await db.execute(text(
        "UPDATE toy_rsvps SET name = :n, coming = :c, guests = :g, wish = :w, updated_at = :t WHERE invite_id = :i AND visitor = :v"), params)
    if not updated.rowcount:
        await db.execute(text(
            "INSERT INTO toy_rsvps (invite_id, visitor, name, coming, guests, wish, created_at, updated_at) "
            "VALUES (:i, :v, :n, :c, :g, :w, :t, :t)"), params)
    await db.commit()
    return {"name": params["n"], "coming": coming, "guests": params["g"], "wish": params["w"]}


async def guests(db, invite_id: int) -> dict:
    await ensure_tables(db)
    rows = (await db.execute(text(
        "SELECT name, coming, guests, wish, updated_at FROM toy_rsvps WHERE invite_id = :i ORDER BY updated_at DESC"),
        {"i": invite_id})).all()
    items = [{"name": r.name, "coming": bool(r.coming), "guests": int(r.guests or 0), "wish": r.wish or "", "at": r.updated_at} for r in rows]
    return {"items": items, "coming": sum(1 for i in items if i["coming"]), "people": sum(i["guests"] for i in items if i["coming"]),
            "declined": sum(1 for i in items if not i["coming"])}


# ---------------- payment by the owner ----------------
def link_for(inv: dict) -> str:
    return f"{SITE}/toy/{inv['slug']}"


def pay_message(inv: dict, price: int, kaspi: str) -> str:
    d = inv["data"]
    who = " и ".join(p for p in (d.get("name1"), d.get("name2")) if p)
    lines = [f"Здравствуйте! Ваше приглашение «{who}» готово.", f"Стоимость — {money(price)}."]
    lines.append(f"Оплатить можно по ссылке: {kaspi}" if kaspi else "Ссылку на оплату пришлём следующим сообщением.")
    lines.append("После оплаты приглашение сразу откроется для гостей, и его можно будет разослать: " + link_for(inv))
    return "\n".join(lines)


PUBLISHED_MESSAGE = ("Оплата получена, спасибо! Приглашение открыто для гостей: {link}\n"
                     "Ответы гостей — в разделе «Мои приглашения» на сайте.")
REJECT_MESSAGE = "Не получилось опубликовать приглашение. Если есть вопросы — просто ответьте на это сообщение."


async def _whatsapp(phone: str, body: str) -> bool:
    try:
        from services.customer_payment_notice import _whatsapp as send
        await send(phone, body)
        return True
    except Exception as exc:
        logger.warning("[Toy] WhatsApp failed: %s", exc)
        return False


async def _cabinet(db, inv: dict, title: str, body: str) -> None:
    if not inv.get("user_id"):
        return
    try:
        from services.user_notifications import notify_user_by_id
        await notify_user_by_id(db, user_id=str(inv["user_id"]), category="announcements",
                                event_key=f"toy:{inv['id']}:{inv['status']}", title=title, body=body,
                                path="/toy/my", entity_type="toy_invite", entity_id=str(inv["id"]))
    except Exception as exc:
        logger.info("[Toy] cabinet notice skipped: %s", exc)


def card_text(inv: dict, price: int) -> str:
    d = inv["data"]
    esc = lambda v: html.escape(str(v or ""))  # noqa: E731
    who = " и ".join(p for p in (d.get("name1"), d.get("name2")) if p)
    return "\n".join([
        f"💌 <b>Приглашение на той №{inv['id']}</b> · {esc(KIND_TITLES.get(d.get('kind'), ''))}",
        f"{esc(who)} · {esc(d.get('date'))} {esc(d.get('time'))}",
        f"📍 {esc(d.get('place'))} {esc(d.get('address'))}".strip(),
        f"👤 {esc(inv.get('phone'))} · к оплате {money(price)}",
        f"Предпросмотр: {link_for(inv)}",
        "", "Клиенту отправлена ссылка на оплату. Как деньги придут в Kaspi — нажмите «Оплачено».",
    ])[:4000]


async def request_payment(db, inv: dict) -> dict:
    cfg = await get_settings(db)
    price = cfg["price"]
    inv = await set_status(db, inv["id"], "pending", price=price)
    await _whatsapp(inv["phone"], pay_message(inv, price, cfg["kaspi_link"]))
    from services.news_agent import approval_chat, bot_token, tg
    if bot_token() and approval_chat():
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": card_text(inv, price), "parse_mode": "HTML",
                         "disable_web_page_preview": True, "reply_markup": {"inline_keyboard": [
                             [{"text": f"💰 Оплачено — {money(price)}", "callback_data": f"ty:p:{inv['id']}"}],
                             [{"text": "❌ Отклонить", "callback_data": f"ty:r:{inv['id']}"}]]}})
        except Exception as exc:
            logger.warning("[Toy] owner card failed: %s", exc)
    return inv


async def decide(db, invite_id: int, paid: bool) -> tuple[str, Optional[dict]]:
    inv = await get_invite(db, invite_id)
    if not inv:
        return "Приглашение не найдено", None
    if inv["status"] == "published":
        return "Уже опубликовано", inv
    if paid:
        inv = await set_status(db, invite_id, "published", paid_at=now_iso())
        msg = PUBLISHED_MESSAGE.format(link=link_for(inv))
        await _whatsapp(inv["phone"], msg)
        await _cabinet(db, inv, "Приглашение опубликовано", msg)
        return "Опубликовано, клиенту написали", inv
    inv = await set_status(db, invite_id, "rejected")
    await _whatsapp(inv["phone"], REJECT_MESSAGE)
    await _cabinet(db, inv, "Приглашение не опубликовано", REJECT_MESSAGE)
    return "Отклонено, клиенту написали", inv


async def handle_callback(db, client: httpx.AsyncClient, data: str, chat_id: Any, message: dict) -> Optional[str]:
    from services.news_agent import tg
    match = CALLBACK_RE.match(data or "")
    if not match:
        return None
    answer, inv = await decide(db, int(match.group(2)), match.group(1) == "p")
    button = ({"text": "✅ Опубликовано — открыть", "url": link_for(inv)} if inv and inv["status"] == "published"
              else {"text": f"• {answer}", "callback_data": "ty:x"})
    try:
        await tg(client, "editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message.get("message_id"),
                                                    "reply_markup": {"inline_keyboard": [[button]]}})
    except Exception as exc:
        logger.info("[Toy] could not update buttons: %s", exc)
    return answer
