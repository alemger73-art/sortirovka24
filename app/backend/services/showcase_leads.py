"""Requests from residents to a partner company page («Записаться», «Узнать цену»), delivered to its Telegram.

The resident leaves a name, phone, what they are interested in and a comment. We keep the request and send it
to every Telegram chat the partner linked through a one-week invite link (several staff may link).
«✅ Связался» under the request marks it handled and shows who took it.

Storage is a few small tables created on first use, like the partner shops.
"""
from __future__ import annotations

import html
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import text

logger = logging.getLogger(__name__)

START_PREFIX = "lead_"
CALLBACK_PREFIX = "ld:"
LINK_MINUTES = 60 * 24 * 7
REQUESTS_PER_PHONE_HOUR = 3

_ready: set[int] = set()


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------- storage ----------------
async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    try:
        await _create(db)
    except Exception:
        await db.rollback()  # two first requests at once: the other one created the tables
        await _create(db)
    _ready.add(key)


async def _create(db) -> None:
    for stmt in (
        "CREATE TABLE IF NOT EXISTS showcase_leads (id SERIAL PRIMARY KEY, slug VARCHAR(80) NOT NULL, "
        "name VARCHAR(80) NOT NULL, phone VARCHAR(20) NOT NULL, choice VARCHAR(120), comment VARCHAR(400), "
        "user_id VARCHAR(64), status VARCHAR(20) NOT NULL DEFAULT 'new', accepted_by VARCHAR(120), "
        "created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32))",
        "CREATE INDEX IF NOT EXISTS showcase_leads_slug ON showcase_leads (slug, created_at)",
        "CREATE TABLE IF NOT EXISTS showcase_telegram (slug VARCHAR(80) NOT NULL, chat_id VARCHAR(32) NOT NULL, "
        "tg_name VARCHAR(120), linked_at VARCHAR(32), PRIMARY KEY (slug, chat_id))",
        "CREATE TABLE IF NOT EXISTS showcase_codes (code VARCHAR(48) PRIMARY KEY, slug VARCHAR(80) NOT NULL, "
        "expires_at VARCHAR(32) NOT NULL)",
    ):
        await db.execute(text(stmt))
    await db.commit()


# ---------------- request from a resident ----------------
def _phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    if not re.fullmatch(r"7\d{10}", digits):
        raise HTTPException(422, "Проверьте номер телефона: +7 7XX XXX XX XX")
    return "+" + digits


def _text(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def lead_options(profile: dict[str, Any]) -> list[str]:
    """What a resident may pick in the form: the form's own list, otherwise the price titles."""
    lead = profile.get("lead") or {}
    options = [o for o in (lead.get("options") or []) if o]
    return options or [p["title"] for p in profile.get("prices") or [] if p.get("title")]


async def place_lead(db, slug: str, profile: dict[str, Any], body: dict[str, Any],
                     user_id: Optional[str] = None) -> dict[str, Any]:
    if not (profile.get("lead") or {}).get("enabled"):
        raise HTTPException(404, "Заявки этой компании сейчас не принимаются")
    await ensure_tables(db)
    name = _text(body.get("name"), 80)
    if len(name) < 2:
        raise HTTPException(422, "Напишите, как к вам обращаться")
    phone = _phone(str(body.get("phone") or ""))
    choice = _text(body.get("choice"), 120)
    options = lead_options(profile)
    if choice and options and choice not in options:
        raise HTTPException(422, "Выберите вариант из списка")
    comment = _text(body.get("comment"), 400)

    recent = await db.scalar(text("SELECT COUNT(*) FROM showcase_leads WHERE phone = :p AND created_at > :t"),
                             {"p": phone, "t": (now() - timedelta(hours=1)).isoformat()})
    if recent >= REQUESTS_PER_PHONE_HOUR:
        raise HTTPException(429, "Заявка с этого номера уже отправлена. Компания скоро свяжется с вами.")

    lead_id = await db.scalar(text(
        "INSERT INTO showcase_leads (slug, name, phone, choice, comment, user_id, created_at) "
        "VALUES (:s, :n, :p, :c, :m, :u, :t) RETURNING id"),
        {"s": slug, "n": name, "p": phone, "c": choice, "m": comment, "u": user_id, "t": now().isoformat()})
    await db.commit()
    lead = {"id": lead_id, "name": name, "phone": phone, "choice": choice, "comment": comment}
    delivered = await notify(db, slug, profile, lead)
    return {"id": lead_id, "notified": delivered}


# ---------------- Telegram ----------------
def lead_card(profile: dict[str, Any], lead: dict[str, Any], accepted_by: str = "") -> str:
    e = html.escape
    out = [f"<b>📝 Новая заявка №{lead['id']}</b> · {e(profile.get('name') or '')}", "с сайта Сортировка 24", "",
           f"👤 {e(lead['name'])}", f"📞 {e(lead['phone'])}"]
    if lead.get("choice"):
        out.append(f"📌 {e(lead['choice'])}")
    if lead.get("comment"):
        out.append(f"💬 {e(lead['comment'])}")
    out.append("")
    out.append(f"✅ Связался: {e(accepted_by)}" if accepted_by else "Позвоните человеку и нажмите «✅ Связался».")
    return "\n".join(out)


async def chats(db, slug: str) -> list[str]:
    await ensure_tables(db)
    return list((await db.scalars(text("SELECT chat_id FROM showcase_telegram WHERE slug = :s"), {"s": slug})).all())


async def notify(db, slug: str, profile: dict[str, Any], lead: dict[str, Any]) -> int:
    from services.news_agent import bot_token, tg
    targets = await chats(db, slug)
    if not targets or not bot_token():
        logger.warning("[ShowcaseLeads] request %s of %s: no Telegram linked", lead["id"], slug)
        return 0
    payload = {"text": lead_card(profile, lead), "parse_mode": "HTML", "disable_web_page_preview": True,
               "reply_markup": {"inline_keyboard": [[{"text": "✅ Связался", "callback_data": f"{CALLBACK_PREFIX}a:{lead['id']}"}]]}}
    sent = 0
    async with httpx.AsyncClient(timeout=10) as client:
        for chat_id in targets:
            try:
                await tg(client, "sendMessage", {"chat_id": chat_id, **payload})
                sent += 1
            except Exception as exc:
                logger.warning("[ShowcaseLeads] send to %s failed: %s", chat_id, exc)
    return sent


async def link_url(db, slug: str) -> dict[str, Any]:
    """A one-week link the partner opens in Telegram to receive requests."""
    from services.courier_telegram import bot_username
    await ensure_tables(db)
    bot = await bot_username()
    if not bot:
        raise HTTPException(503, "Бот Telegram не настроен")
    code = secrets.token_urlsafe(18)
    await db.execute(text("DELETE FROM showcase_codes WHERE expires_at < :n"), {"n": now().isoformat()})
    await db.execute(text("INSERT INTO showcase_codes (code, slug, expires_at) VALUES (:c, :s, :e)"),
                     {"c": code, "s": slug, "e": (now() + timedelta(minutes=LINK_MINUTES)).isoformat()})
    await db.commit()
    return {"url": f"https://t.me/{bot}?start={START_PREFIX}{code}", "linked": len(await chats(db, slug))}


async def _profile(db, slug: str) -> dict[str, Any]:
    from models.partner_profiles import PartnerShowcase
    row = await db.get(PartnerShowcase, slug)
    return dict(row.content) if row else {}


async def handle_message(db, client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """/start lead_<code> links this private chat to the company page. True when the message was ours."""
    from services.news_agent import tg
    chat = message.get("chat") or {}
    words = str(message.get("text") or "").strip().split()
    if chat.get("type") != "private" or len(words) != 2 or words[0] != "/start" or not words[1].startswith(START_PREFIX):
        return False
    await ensure_tables(db)
    code = words[1][len(START_PREFIX):]
    row = (await db.execute(text("SELECT slug, expires_at FROM showcase_codes WHERE code = :c"), {"c": code})).first()
    if not row or row.expires_at < now().isoformat():
        answer = "Ссылка устарела. Попросите у Сортировка 24 новую."
    else:
        sender = message.get("from") or {}
        name = " ".join(x for x in (sender.get("first_name"), sender.get("last_name")) if x) or sender.get("username") or ""
        await db.execute(text("DELETE FROM showcase_telegram WHERE slug = :s AND chat_id = :c"),
                         {"s": row.slug, "c": str(chat.get("id"))})
        await db.execute(text("INSERT INTO showcase_telegram (slug, chat_id, tg_name, linked_at) VALUES (:s, :c, :n, :t)"),
                         {"s": row.slug, "c": str(chat.get("id")), "n": name[:120], "t": now().isoformat()})
        await db.commit()
        title = (await _profile(db, row.slug)).get("name") or row.slug
        answer = (f"✅ Готово! Заявки «{title}» с сайта Сортировка 24 будут приходить сюда.\n\n"
                  "В каждой заявке — имя, телефон и что интересует человека. Позвоните ему и нажмите «✅ Связался», "
                  "чтобы коллеги видели, что заявка в работе.")
    await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": answer})
    return True


async def handle_callback(db, client: httpx.AsyncClient, data: str, chat_id: Any, sender: dict, message: dict) -> str:
    """«✅ Связался» under a request: the first press marks it taken and shows who took it."""
    from services.news_agent import tg
    try:
        lead_id = int(data.split(":")[2])
    except (IndexError, ValueError):
        return "Неизвестная команда"
    await ensure_tables(db)
    row = (await db.execute(text("SELECT * FROM showcase_leads WHERE id = :i"), {"i": lead_id})).mappings().first()
    if not row or str(chat_id) not in await chats(db, row["slug"]):
        return "Этот чат не подключён к заявкам"
    if row["status"] == "new":
        name = " ".join(x for x in (sender.get("first_name"), sender.get("last_name")) if x) or sender.get("username") or "сотрудник"
        await db.execute(text("UPDATE showcase_leads SET status = 'accepted', accepted_by = :w, updated_at = :t "
                              "WHERE id = :i AND status = 'new'"), {"w": name[:120], "t": now().isoformat(), "i": lead_id})
        await db.commit()
    who = await db.scalar(text("SELECT accepted_by FROM showcase_leads WHERE id = :i"), {"i": lead_id}) or ""
    lead = {"id": row["id"], "name": row["name"], "phone": row["phone"], "choice": row["choice"], "comment": row["comment"]}
    try:
        await tg(client, "editMessageText", {"chat_id": chat_id, "message_id": message.get("message_id"),
                                             "text": lead_card(await _profile(db, row["slug"]), lead, who),
                                             "parse_mode": "HTML", "disable_web_page_preview": True})
    except Exception as exc:
        logger.info("[ShowcaseLeads] edit failed: %s", exc)
    return "Отмечено: связались"


async def recent_leads(db, slug: str, limit: int = 100) -> list[dict[str, Any]]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT id, name, phone, choice, comment, status, accepted_by, created_at "
                                  "FROM showcase_leads WHERE slug = :s ORDER BY id DESC LIMIT :l"),
                             {"s": slug, "l": limit})).mappings().all()
    return [dict(r) for r in rows]
