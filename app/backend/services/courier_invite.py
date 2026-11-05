"""DÄM ALEM courier invite: the owner hands out a one-time link; whoever opens it becomes a courier.

The person opens the link in Telegram («?start=ci_…»), shares their phone with Telegram's own contact button (so the
number is the one verified by Telegram, never typed), and gets a verified courier profile with that name and phone,
linked to this chat. From then on deliveries the operator assigns arrive here, and the operator may assign them
without a PIN shift (services.food_shifts.courier_shift_for_assignment).

Same rules as adding a courier in the owner's cabinet: a phone that already belongs to an account is attached to it
(a blocked or staff account is refused), one profile per account, and the action is recorded.
"""
from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import select, text

logger = logging.getLogger(__name__)

START_PREFIX = "ci_"
CODE_HOURS = 24
_ready: set[int] = set()


def now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    await db.execute(text("CREATE TABLE IF NOT EXISTS courier_invites (code VARCHAR(48) PRIMARY KEY, "
                          "expires_at VARCHAR(32) NOT NULL, chat_id VARCHAR(32), used_by VARCHAR(255))"))
    await db.commit()
    _ready.add(key)


async def new_link(db) -> Optional[str]:
    from services.courier_telegram import bot_username
    bot = await bot_username()
    if not bot:
        return None
    await ensure_tables(db)
    code = secrets.token_urlsafe(18)
    await db.execute(text("INSERT INTO courier_invites (code, expires_at) VALUES (:c, :e)"),
                     {"c": code, "e": (now() + timedelta(hours=CODE_HOURS)).isoformat()})
    await db.commit()
    return f"https://t.me/{bot}?start={START_PREFIX}{code}"


async def _pending(db, chat_id: Any) -> Optional[str]:
    await ensure_tables(db)
    return await db.scalar(text("SELECT code FROM courier_invites WHERE chat_id = :c AND used_by IS NULL AND expires_at > :n"),
                           {"c": str(chat_id), "n": now().isoformat()})


async def handle_message(db, client, message: dict[str, Any]) -> bool:
    """/start ci_<code> asks for the phone; the shared contact makes the courier. True when the message was ours."""
    from services.news_agent import tg
    from services.telegram_login import contact_keyboard
    chat = message.get("chat") or {}
    if chat.get("type") != "private":
        return False
    words = str(message.get("text") or "").strip().split()
    if len(words) == 2 and words[0] == "/start" and words[1].startswith(START_PREFIX):
        await ensure_tables(db)
        code = words[1][len(START_PREFIX):]
        row = (await db.execute(text("SELECT expires_at, used_by FROM courier_invites WHERE code = :c"), {"c": code})).first()
        if not row or row.used_by or row.expires_at < now().isoformat():
            await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": "Ссылка устарела. Попросите у владельца новую ссылку курьера."})
            return True
        await db.execute(text("UPDATE courier_invites SET chat_id = :ch WHERE code = :c"), {"ch": str(chat.get("id")), "c": code})
        await db.commit()
        await tg(client, "sendMessage", {"chat_id": chat.get("id"), "reply_markup": contact_keyboard(),
                 "text": "🛵 Подключение курьера DÄM ALEM.\n\nНажмите кнопку «📱 Поделиться номером» внизу — номер возьмётся из Telegram."})
        return True
    contact = message.get("contact")
    if not isinstance(contact, dict):
        return False
    code = await _pending(db, chat.get("id"))
    if not code:
        return False
    sender = message.get("from") or {}
    if contact.get("user_id") != sender.get("id"):
        await tg(client, "sendMessage", {"chat_id": chat.get("id"), "reply_markup": contact_keyboard(),
                 "text": "Нужен ваш собственный номер — нажмите кнопку «📱 Поделиться номером»."})
        return True
    name = " ".join(x for x in (sender.get("first_name"), sender.get("last_name")) if x) or "Курьер"
    answer = await make_courier(db, code, str(contact.get("phone_number") or ""), name, chat.get("id"))
    await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": answer, "reply_markup": {"remove_keyboard": True}})
    return True


async def make_courier(db, code: str, raw_phone: str, name: str, chat_id: Any) -> str:
    from models.auth import User
    from models.logistics import CourierProfile
    from services.food_preorders import lock_dam_operations
    from services.food_shifts import record_action
    from utils.phone import phone_suffix_expression
    digits = re.sub(r"\D", "", raw_phone)
    if len(digits) < 10:
        return "Не получилось прочитать номер. Нажмите кнопку «📱 Поделиться номером» ещё раз."
    phone = "+7" + digits[-10:]
    await lock_dam_operations(db)
    users = (await db.scalars(select(User).where(phone_suffix_expression(User.phone) == digits[-10:]).limit(2))).all()
    if len(users) > 1:
        return "С этим номером несколько аккаунтов. Владелец должен добавить курьера в кабинете."
    user = users[0] if users else None
    profile = await db.get(CourierProfile, user.id) if user else None
    if user and not profile and (not user.is_active or user.status != "active" or user.role not in ("user", "customer", "courier")):
        return "Этот номер принадлежит служебному или заблокированному аккаунту. Владелец добавит курьера в кабинете."
    if user and user.status != "active":
        return "Аккаунт с этим номером заблокирован. Обратитесь к владельцу."
    if not user:
        user = User(id=str(uuid4()), name=name[:255], phone=phone, role="courier", status="active", is_active=True)
        db.add(user)
        await db.flush()
    if not profile:
        db.add(CourierProfile(user_id=user.id, phone=phone, is_verified=True, is_online=False))
    else:
        profile.is_verified = True
    await db.flush()
    record_action(db, None, "staff_created", staff_type="courier", staff_id=str(user.id), staff_name=user.name or name,
                  role="courier", entity_type="courier", entity_id=str(user.id), details={"via": "telegram_invite"})
    from services.courier_telegram import ensure_tables as courier_tables
    await courier_tables(db)
    await db.execute(text("DELETE FROM courier_telegram WHERE user_id = :u OR chat_id = :c"), {"u": str(user.id), "c": str(chat_id)})
    await db.execute(text("INSERT INTO courier_telegram (user_id, chat_id, tg_name, linked_at) VALUES (:u, :c, :n, :t)"),
                     {"u": str(user.id), "c": str(chat_id), "n": name[:120], "t": now().isoformat()})
    await db.execute(text("UPDATE courier_invites SET used_by = :u WHERE code = :c"), {"u": str(user.id), "c": code})
    await db.commit()
    return (f"✅ {user.name or name}, вы курьер DÄM ALEM.\n\nДоставки, которые назначит оператор, будут приходить сюда: "
            "адрес, телефон клиента, что везти и сколько взять денег. Кнопками под заказом отмечайте «Забрал», "
            "«Еду к клиенту», «Доставлено».\n\nКабинет курьера: sortirovka24.kz/food/courier (вход по этому номеру).")
