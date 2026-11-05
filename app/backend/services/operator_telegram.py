"""DÄM ALEM operator in Telegram: every new order with the customer's contacts, and the order's later events.

Each operator links their own Telegram once with a one-time link from the site's bot («?start=op_…»). Personal chats
only: adding the bot to a new group would make that group the news workspace (news_agent.bind_channel). After that
each new DÄM ALEM order arrives as a full card — who, phone, address, what was ordered, money, payment — and every later event of the order (payment,
courier, change request, status) arrives as a short line under the order number.

Once the operator also sends their PIN (services.operator_console), the chat becomes a console: the new order arrives
as the cabinet's order card with its buttons, and each event line has a button to open the order. A broken Telegram
never blocks an order: sending runs in the background.
"""
from __future__ import annotations

import asyncio
import html
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import event, text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

START_PREFIX = "op_"
CODE_HOURS = 24
LOCAL = ZoneInfo("Asia/Almaty")
PAYMENT_LABELS = {"cash": "💵 наличные", "kaspi_qr": "📱 Kaspi", "halyk_qr": "📱 Halyk"}
PENDING_KEY = "operator_telegram_events"
# The full card is sent for a new order; its creation event is not repeated as a line.
SKIP_EVENTS = {"Заказ создан"}

_ready: set[int] = set()
_background: set[asyncio.Task] = set()


def now() -> datetime:
    return datetime.now(timezone.utc)


def enabled() -> bool:
    from core.deploy_safety import external_side_effects_allowed
    from services.news_agent import bot_token
    return bool(bot_token()) and external_side_effects_allowed()


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
        "CREATE TABLE IF NOT EXISTS operator_telegram (chat_id VARCHAR(32) PRIMARY KEY, title VARCHAR(160), "
        "linked_at VARCHAR(32))",
        "CREATE TABLE IF NOT EXISTS operator_telegram_codes (code VARCHAR(48) PRIMARY KEY, expires_at VARCHAR(32) NOT NULL)",
    ):
        await db.execute(text(stmt))
    await db.commit()


async def chats(db) -> list[str]:
    await ensure_tables(db)
    return [str(r[0]) for r in (await db.execute(text("SELECT chat_id FROM operator_telegram"))).all()]


# ---------------- linking ----------------
async def new_links(db, count: int = 1) -> dict[str, Any]:
    """One-time links for the owner to hand out: one per operator, each links that person's private chat."""
    from services.courier_telegram import bot_username
    bot = await bot_username()
    if not bot:
        return {"available": False}
    await ensure_tables(db)
    await db.execute(text("DELETE FROM operator_telegram_codes WHERE expires_at < :n"), {"n": now().isoformat()})
    links = []
    for _ in range(max(1, min(count, 10))):
        code = secrets.token_urlsafe(18)
        await db.execute(text("INSERT INTO operator_telegram_codes (code, expires_at) VALUES (:c, :e)"),
                         {"c": code, "e": (now() + timedelta(hours=CODE_HOURS)).isoformat()})
        links.append(f"https://t.me/{bot}?start={START_PREFIX}{code}")
    await db.commit()
    return {"available": True, "bot": bot, "links": links, "linked": len(await chats(db))}


async def _link(db, code: str, chat: dict) -> str:
    await ensure_tables(db)
    row = (await db.execute(text("SELECT expires_at FROM operator_telegram_codes WHERE code = :c"), {"c": code})).first()
    if not row or row.expires_at < now().isoformat():
        return "Ссылка устарела. Попросите новую ссылку для подключения операторов DÄM ALEM."
    chat_id = str(chat.get("id"))
    title = " ".join(x for x in (chat.get("first_name"), chat.get("last_name")) if x) or chat.get("username") or ""
    await db.execute(text("DELETE FROM operator_telegram WHERE chat_id = :c"), {"c": chat_id})
    await db.execute(text("INSERT INTO operator_telegram (chat_id, title, linked_at) VALUES (:c, :t, :n)"),
                     {"c": chat_id, "t": title[:160], "n": now().isoformat()})
    await db.execute(text("DELETE FROM operator_telegram_codes WHERE code = :c"), {"c": code})
    await db.commit()
    return ("✅ Этот чат подключён к заказам DÄM ALEM.\n\nСюда будут приходить новые заказы: имя и телефон клиента, "
            "адрес, состав, сумма и оплата. А под номером заказа — всё, что с ним происходит дальше: оплата, курьер, "
            "изменения.\nОтключить — команда /stop_orders.")


async def handle_message(db, client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """/start op_<code> links this private chat, /stop_orders unlinks it."""
    from services.news_agent import tg
    chat = message.get("chat") or {}
    if chat.get("type") != "private":
        return False
    words = str(message.get("text") or "").strip().split()
    if not words:
        return False
    command = words[0]
    from services import operator_console as console
    if command == "/start" and len(words) == 2 and words[1].startswith(START_PREFIX):
        answer = await _link(db, words[1][len(START_PREFIX):], chat)
        await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": answer})
        if str(chat.get("id")) in await chats(db):
            staff = await console.staff_of(db, chat.get("id"))
            await console._ask_pin(db, client, chat.get("id"), staff)
        return True
    if command == "/stop_orders" and str(chat.get("id")) in await chats(db):
        await console.ensure_tables(db)
        for table in ("operator_telegram", "operator_telegram_staff"):
            await db.execute(text(f"DELETE FROM {table} WHERE chat_id = :c"), {"c": str(chat.get("id"))})
        await db.commit()
        await tg(client, "sendMessage", {"chat_id": chat.get("id"), "reply_markup": {"remove_keyboard": True},
                                         "text": "Заказы DÄM ALEM сюда больше не приходят. Заказы по-прежнему видны в кабинете оператора."})
        return True
    return await console.handle_text(db, client, chat, message)


# ---------------- the order card ----------------
def _money(value: Any) -> str:
    return f"{round(float(value or 0)):,}".replace(",", " ") + " ₸"


def _local(iso: Optional[str]) -> str:
    try:
        moment = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(LOCAL).strftime("%d.%m %H:%M")
    except (TypeError, ValueError):
        return ""


def _items(order: Any) -> list[str]:
    try:
        rows = json.loads(order.order_items) if isinstance(order.order_items, str) else (order.order_items or [])
    except (TypeError, ValueError):
        rows = []
    out = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict) or not row.get("name"):
            continue
        qty = int(row.get("quantity") or 1)
        price = (float(row.get("price") or 0) + float(row.get("modTotal") or 0)) * qty
        extras = [str(m.get("name")) for m in row.get("modifiers") or [] if isinstance(m, dict) and m.get("name")]
        line = f"• {html.escape(str(row['name']))} × {qty} — {_money(price)}"
        if extras:
            line += f"\n   <i>{html.escape(', '.join(extras))}</i>"
        out.append(line)
    return out


def _cabinet_url() -> str:
    base = (os.getenv("PUBLIC_FRONTEND_URL") or os.getenv("FRONTEND_URL") or "https://www.sortirovka24.kz").rstrip("/")
    return f"{base}/partner/dam-alem/operator"


def card(order: Any) -> str:
    e = html.escape
    delivery = (order.delivery_method or "delivery") in ("delivery", "доставка")
    lines = [f"🍽 <b>НОВЫЙ ЗАКАЗ №{order.id}</b> · DÄM ALEM", "<i>Позвоните клиенту и примите заказ в кабинете</i>", ""]
    lines.append(f"👤 {e(order.customer_name or 'Клиент')}")
    if order.customer_phone:
        lines.append(f"📞 {e(order.customer_phone)}")
    lines.append(f"{'🚗 Доставка' if delivery else '🏪 Самовывоз'}")
    if delivery and order.delivery_address:
        lines.append(f"📍 <b>{e(order.delivery_address)}</b>")
    if order.scheduled_for:
        lines.append(f"⏰ Предзаказ на {_local(order.scheduled_for)}")
    if order.comment:
        lines.append(f"💬 {e(str(order.comment))[:500]}")
    items = _items(order)
    if items:
        lines += ["", "<b>Состав:</b>", *items[:30]]
    lines.append("")
    lines.append(f"💰 <b>Итого: {_money(order.total_amount)}</b>")
    if order.bonus_points_used:
        lines.append(f"🎁 Списано бонусов: {round(float(order.bonus_points_used))}")
    payment = PAYMENT_LABELS.get(order.payment_method or "", order.payment_method or "—")
    paid = (order.payment_status or "") == "paid"
    lines.append(f"Оплата: {payment}" + (" · оплачено" if paid else ""))
    if order.payment_method == "cash" and order.cash_given_amount and float(order.cash_given_amount) > float(order.total_amount or 0):
        lines.append(f"Клиент даст {_money(order.cash_given_amount)}, сдача {_money(order.change_amount)}")
    lines += ["", f'<a href="{_cabinet_url()}">Открыть кабинет оператора</a>']
    return "\n".join(lines)


# ---------------- sending ----------------
def _schedule(coro) -> None:
    try:
        job = asyncio.get_running_loop().create_task(coro)
    except RuntimeError:  # no running loop (sync tooling): nothing to send from here
        coro.close()
        return
    _background.add(job)
    job.add_done_callback(_background.discard)


def notify_new_order(order: Any) -> None:
    """Called after the new order is saved; the card is built now, sent in the background."""
    if enabled():
        _schedule(_send_all(card(order), [order.id], new=True))


async def _send_all(message: str, order_ids: list[int], *, new: bool = False) -> None:
    """Plain chats get the text; console chats get the order card with buttons (new) or «open» buttons (events)."""
    from core.database import db_manager
    from services import operator_console as console
    try:
        async with db_manager.async_session_maker() as db:
            targets = await chats(db)
            if not targets:
                return
            async with httpx.AsyncClient(timeout=20) as client:
                for chat_id in targets:
                    try:
                        staff = await console.staff_of(db, chat_id)
                        if staff and staff.staff_id and new:
                            await console.send_card(db, client, staff, chat_id, order_ids[0], f"🍽 <b>НОВЫЙ ЗАКАЗ №{order_ids[0]}</b>")
                            continue
                        keyboard = None
                        if staff and staff.staff_id:
                            keyboard = {"inline_keyboard": [[{"text": f"Открыть №{oid}", "callback_data": f"{console.CB}o:{oid}"}
                                                             for oid in list(dict.fromkeys(order_ids))[:4]]]}
                        await console._send(client, chat_id, message, keyboard)
                    except Exception as exc:
                        logger.warning("[OperatorTG] chat %s not reached: %s", chat_id, exc)
    except Exception as exc:
        logger.warning("[OperatorTG] not sent: %s", exc)


def remember_event(db, order: Any, message: str, actor: str) -> None:
    """Order events are relayed only once their transaction has committed (a rolled back change never goes out)."""
    if message in SKIP_EVENTS or not enabled():
        return
    info = getattr(db, "info", None)
    if info is None:
        return
    line = f"📋 <b>Заказ №{order.id}</b>: {html.escape(str(message))[:600]}"
    if actor and actor not in ("Система",):
        line += f"\n<i>{html.escape(str(actor))[:80]}</i>"
    info.setdefault(PENDING_KEY, []).append((int(order.id), line))


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    pending = session.info.pop(PENDING_KEY, None)
    if pending:
        _schedule(_send_all("\n\n".join(line for _, line in pending), [oid for oid, _ in pending]))


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(PENDING_KEY, None)
