"""Free login codes through our own Telegram bot.

The site creates the usual one-time code row for the phone, but does not send
anything; it shows a link to the bot. In the bot the person taps «Поделиться
номером». Telegram vouches the number belongs to that account (contact.user_id
== sender), so the bot replaces the stored code with a fresh one and sends it in
the chat. The person types it on the site and the normal check runs.

Nothing new is stored: the code lives in phone_verifications as always.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

START_PAYLOAD = "code"
LINKS_KEY = "telegram_login_links"  # module_settings row: {"+7700…": telegram_user_id}
_username: dict[str, Any] = {"value": None, "at": 0.0}


def enabled() -> bool:
    """Bot codes need the bot token and the bot loop (news agent) running."""
    if os.getenv("TELEGRAM_LOGIN_BOT", "1").strip().lower() in {"0", "false", "no", "off"}:
        return False
    from services.news_agent import approval_chat, bot_token
    return bool(bot_token() and approval_chat())


async def bot_username() -> Optional[str]:
    configured = os.getenv("TELEGRAM_LOGIN_BOT_USERNAME", "").strip().lstrip("@")
    if configured:
        return configured
    if _username["value"] and time.time() - _username["at"] < 3600:
        return _username["value"]
    from services.news_agent import tg
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            data = await tg(client, "getMe", {}, timeout=10)
        _username.update(value=(data.get("result") or {}).get("username"), at=time.time())
    except Exception as exc:
        logger.warning("[TelegramLogin] getMe failed: %s", exc)
    return _username["value"]


async def bot_link() -> Optional[str]:
    name = await bot_username()
    return f"https://t.me/{name}?start={START_PAYLOAD}" if name else None


ASK_TEXT = ("Здравствуйте! Это бот «Сортировка 24».\n\n"
            "Чтобы получить код для входа на сайт, нажмите кнопку «📱 Поделиться номером» внизу.\n"
            "Сначала введите этот же номер на сайте и выберите «Telegram».")


def contact_keyboard() -> dict[str, Any]:
    return {"keyboard": [[{"text": "📱 Поделиться номером", "request_contact": True}]],
            "resize_keyboard": True, "one_time_keyboard": True}


async def handle_message(db: AsyncSession, client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """Handles login messages in a private chat. Returns True when the message was ours."""
    from services.news_agent import tg

    chat = message.get("chat") or {}
    if chat.get("type") != "private" or not enabled():
        return False
    text = str(message.get("text") or "").strip()
    contact = message.get("contact")
    if text in (f"/start {START_PAYLOAD}", "/code", "/kod", "/код"):
        await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": ASK_TEXT, "reply_markup": contact_keyboard()})
        return True
    if not isinstance(contact, dict):
        return False
    sender = (message.get("from") or {}).get("id")
    if not sender or contact.get("user_id") != sender:
        await tg(client, "sendMessage", {"chat_id": chat.get("id"),
                 "text": "Нужно поделиться своим номером — кнопкой «📱 Поделиться номером».",
                 "reply_markup": contact_keyboard()})
        return True
    answer = await issue_code(db, str(contact.get("phone_number") or ""), sender)
    await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": answer, "parse_mode": "HTML",
             "reply_markup": {"remove_keyboard": True}})
    return True


async def _links(db: AsyncSession, lock: bool = False):
    import json
    from models.module_settings import ModuleSettings
    query = select(ModuleSettings).where(ModuleSettings.key == LINKS_KEY)
    row = await db.scalar(query.with_for_update() if lock else query)
    try:
        data = json.loads(row.value or "{}") if row else {}
    except ValueError:
        data = {}
    return row, data if isinstance(data, dict) else {}


async def remember(db: AsyncSession, phone: str, telegram_user: Any) -> None:
    """After a verified contact share the bot may send this number's codes by itself."""
    import json
    from models.module_settings import ModuleSettings
    row, data = await _links(db, lock=True)
    if not row:
        row = ModuleSettings(key=LINKS_KEY, value="{}")
        db.add(row)
    for other in [p for p, uid in data.items() if uid == telegram_user and p != phone]:
        data.pop(other)  # one Telegram account ↔ one number
    data[phone] = telegram_user
    row.value = json.dumps(data)


async def linked_chat(db: AsyncSession, phone: str) -> Optional[Any]:
    _, data = await _links(db)
    return data.get(phone)


async def send_code_directly(db: AsyncSession, phone: str, code: str) -> bool:
    """Known number: the bot sends the code right away. False when it cannot (unknown or blocked bot)."""
    from services.news_agent import tg
    chat = await linked_chat(db, phone)
    if not chat:
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await tg(client, "sendMessage", {"chat_id": chat, "parse_mode": "HTML", "text": code_text(code)}, timeout=15)
        return True
    except Exception as exc:
        logger.info("[TelegramLogin] direct send failed for ***%s: %s", phone[-4:], exc)
        return False


def code_text(code: str) -> str:
    return (f"Ваш код для входа на «Сортировка 24»: <b>{code}</b>\n\n"
            "Введите его на сайте. Никому не сообщайте этот код — сотрудники его никогда не спрашивают.")


async def issue_code(db: AsyncSession, raw_phone: str, telegram_user: Any) -> str:
    from models.user_management import PhoneVerification
    from routers.account_v2 import MAX_SMS_VERIFY_ATTEMPTS, _as_aware_utc, _hash_sms_code
    from utils.phone import normalize_phone
    from utils.rate_limit import check_keyed_rate_limit

    phone = normalize_phone(raw_phone if raw_phone.startswith("+") else "+" + raw_phone)
    try:
        check_keyed_rate_limit(f"tglogin:{telegram_user}", window_seconds=900, max_hits=5)
    except HTTPException:
        return "Слишком много запросов. Подождите 15 минут."
    now = datetime.now(timezone.utc)
    row = (await db.execute(
        select(PhoneVerification)
        .where(PhoneVerification.phone == phone, PhoneVerification.is_verified == False)  # noqa: E712
        .order_by(desc(PhoneVerification.id)).limit(1).with_for_update()
    )).scalar_one_or_none()
    if not row or _as_aware_utc(row.expires_at) < now:
        return ("Для номера " + phone + " код на сайте не запрошен или устарел.\n\n"
                "Откройте сайт sortirovka24.kz, введите этот номер, выберите «Telegram» — и снова нажмите "
                "«Поделиться номером» здесь.")
    if row.attempts >= MAX_SMS_VERIFY_ATTEMPTS:
        return "Слишком много неверных попыток. Запросите новый код на сайте."
    code = f"{secrets.randbelow(1_000_000):06d}"
    prefix = row.code_hash.split(":", 1)[0] + ":" if ":" in row.code_hash else ""
    row.code_hash = prefix + _hash_sms_code(phone, code)
    await remember(db, phone, telegram_user)
    await db.commit()
    logger.info("[TelegramLogin] code issued for ***%s", phone[-4:])
    return code_text(code) + "\n\nВ следующий раз код придёт сюда сам — делиться номером больше не нужно."
