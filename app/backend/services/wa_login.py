"""WhatsApp sign-in where the person writes first.

The site never sends a WhatsApp message to a stranger (that got the number restricted).
Instead: the login form gets a short code and a wa.me link with the ready text
«Вход на Сортировка 24: 4821». The person sends it to our number; the support-bot
webhook checks that the SENDER's own number is the one typed on the site, marks the
login verified and answers once. The browser polls and gets its session.

The pending login lives in wa_logins (created at runtime). The browser holds a random
login id; only its hash is stored, so the table alone cannot be used to sign in.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import secrets
import time
from typing import Any, Optional
from urllib.parse import quote

from sqlalchemy import text

from utils.phone import phone_digits

logger = logging.getLogger(__name__)

TTL_SECONDS = 300
MESSAGE_RE = re.compile(r"вход\s+на\s+[«\"]?сортировка\s*24[»\"]?\D{0,5}(\d{4})\b", re.IGNORECASE)

DONE = "Готово, вы вошли на Сортировка 24 ✓"
WRONG_NUMBER = ("Этот WhatsApp не совпадает с номером, который вы ввели на сайте. "
                "Введите на сайте номер этого WhatsApp или войдите через Telegram.")
NO_NUMBER = "Не получилось определить ваш номер в WhatsApp. Пожалуйста, войдите на сайте через Telegram."
EXPIRED = "Этот код устарел. Нажмите на сайте «Войти через WhatsApp» ещё раз."
REPLIES = (DONE, WRONG_NUMBER, NO_NUMBER, EXPIRED)

def site_number() -> str:
    return phone_digits(os.getenv("WAHA_PHONE", "77004280280"))


def message_text(code: str) -> str:
    return f"Вход на Сортировка 24: {code}"


def wa_url(code: str) -> str:
    return f"https://wa.me/{site_number()}?text={quote(message_text(code))}"


def login_code(body: str) -> Optional[str]:
    match = MESSAGE_RE.search(body or "")
    return match.group(1) if match else None


def _hash(login_id: str) -> str:
    return hashlib.sha256(login_id.encode()).hexdigest()


def _kz_phone(jid: str) -> str:
    """'77011234567@c.us' / '77011234567:12@s.whatsapp.net' → '77011234567'. Never a @lid: those are not numbers."""
    user, _, server = str(jid or "").partition("@")
    if server not in ("c.us", "s.whatsapp.net"):
        return ""
    digits = phone_digits(user.split(":", 1)[0])
    return digits if len(digits) == 11 and digits.startswith("7") else ""


def sender_phone(payload: dict[str, Any]) -> str:
    """The real number of whoever sent this incoming message, or '' when WhatsApp hides it.
    New WhatsApp ids (xxx@lid) carry the number in Info.SenderAlt (WAHA GOWS/NOWEB)."""
    if payload.get("fromMe"):
        return ""
    info = (payload.get("_data") or {}).get("Info") or {}
    for jid in (payload.get("from"), info.get("SenderAlt"), info.get("Sender"), info.get("ChatAlt"), info.get("Chat")):
        phone = _kz_phone(str(jid or ""))
        if phone:
            return phone
    return ""


async def ensure_table(db) -> None:
    await db.execute(text(
        "CREATE TABLE IF NOT EXISTS wa_logins (token_hash VARCHAR(64) PRIMARY KEY, phone VARCHAR(20) NOT NULL, "
        "code VARCHAR(8) NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, "
        "verified_at BIGINT, consumed_at BIGINT)"))
    await db.execute(text("CREATE INDEX IF NOT EXISTS wa_logins_code ON wa_logins (code, expires_at)"))
    await db.commit()


async def start(db, phone: str) -> tuple[str, str]:
    """A new pending login for *phone* (earlier unfinished ones are dropped). Returns (login id, code)."""
    await ensure_table(db)
    now = int(time.time())
    await db.execute(text("DELETE FROM wa_logins WHERE expires_at < :old OR (phone = :p AND verified_at IS NULL)"),
                     {"old": now - 3600, "p": phone})
    login_id, code = secrets.token_urlsafe(24), f"{secrets.randbelow(10_000):04d}"
    await db.execute(text("INSERT INTO wa_logins (token_hash, phone, code, created_at, expires_at) VALUES (:h, :p, :c, :t, :e)"),
                     {"h": _hash(login_id), "p": phone, "c": code, "t": now, "e": now + TTL_SECONDS})
    await db.commit()
    return login_id, code


async def state(db, login_id: str) -> tuple[str, str]:
    """('pending' | 'verified' | 'expired', phone) for the browser's login id."""
    await ensure_table(db)
    row = (await db.execute(text("SELECT phone, expires_at, verified_at, consumed_at FROM wa_logins WHERE token_hash = :h"),
                            {"h": _hash(login_id or "")})).first()
    if not row or row.consumed_at or row.expires_at <= time.time():
        return "expired", ""
    return ("verified" if row.verified_at else "pending"), row.phone


async def consume(db, login_id: str) -> bool:
    """Use a verified login exactly once."""
    result = await db.execute(text(
        "UPDATE wa_logins SET consumed_at = :t WHERE token_hash = :h AND verified_at IS NOT NULL "
        "AND consumed_at IS NULL AND expires_at > :t"), {"h": _hash(login_id or ""), "t": int(time.time())})
    return result.rowcount == 1


async def confirm(db, payload: dict[str, Any], code: str) -> str:
    """The person sent «Вход на Сортировка 24: code». Returns the one reply to send ('' = stay silent)."""
    await ensure_table(db)
    phone = sender_phone(payload)
    if not phone:
        logger.info("[WALogin] sender number hidden (lid without SenderAlt)")
        return NO_NUMBER
    now = int(time.time())
    rows = (await db.execute(text("SELECT token_hash, phone, verified_at FROM wa_logins "
                                  "WHERE code = :c AND consumed_at IS NULL AND expires_at > :t"),
                             {"c": code, "t": now})).all()
    if not rows:
        return EXPIRED
    mine = next((r for r in rows if phone_digits(r.phone) == phone), None)
    if mine is None:
        logger.info("[WALogin] code from ***%s does not match the number typed on the site", phone[-4:])
        return WRONG_NUMBER
    if mine.verified_at:
        return ""  # sent twice: already answered
    await db.execute(text("UPDATE wa_logins SET verified_at = :t WHERE token_hash = :h"), {"t": now, "h": mine.token_hash})
    await db.commit()
    logger.info("[WALogin] login verified for ***%s", phone[-4:])
    return DONE
