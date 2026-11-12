"""DÄM ALEM courier in Telegram.

A courier links the site's bot once from the courier cabinet («Подключить Телеграм» → the bot opens with a one-time
code). After that every delivery the operator gives them arrives in Telegram as a card — order number, what to take,
address with a map link, the customer's name and phone, how much cash to collect, their payout — and the card's
buttons move the delivery on: «Забрал», «Еду к клиенту», «На месте», «Доставлено».

The buttons run exactly the same checks and the same code as the cabinet (verified courier, open shift, the order is
ready, the delivery is theirs), so Telegram is only another remote for the same delivery, never a second set of rules.
Money is not acknowledged here: as in the cabinet, the operator confirms cash and payments.
"""
from __future__ import annotations

import asyncio
import html
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import text

logger = logging.getLogger(__name__)

TOKEN_MINUTES = 30
START_PREFIX = "cr_"
CALLBACK_PREFIX = "cr:"

# DÄM ALEM delivery: what the courier presses next at each status (mirrors logistics_service.advance_task_status).
NEXT_STEPS: dict[str, list[tuple[str, str]]] = {
    "assigned": [("picked_up", "📦 Забрал заказ")],
    "picked_up": [("on_the_way", "🚗 Еду к клиенту")],
    "on_the_way": [("arrived", "📍 На месте"), ("delivered", "✅ Доставлено")],
    "arrived": [("delivered", "✅ Доставлено")],
}
STATUS_LABELS = {
    "assigned": "Назначен вам", "picked_up": "Забрал из кухни", "on_the_way": "Еду к клиенту",
    "arrived": "На месте у клиента", "delivered": "Доставлено", "cancelled": "Отменён",
}
KIND_TITLES = {
    "assigned": "🛵 Новая доставка", "ready": "🔔 Заказ готов — можно забирать", "reassigned": "↩️ Доставку передали другому курьеру",
    "cancelled": "⛔ Заказ отменён", "issue_resolved": "✅ Оператор ответил по проблеме", "status": "Доставка",
}
PAYMENT_LABELS = {"cash": "наличные", "kaspi_transfer": "Kaspi переводом", "kaspi_qr": "Kaspi", "halyk_qr": "Halyk"}

_ready: set[int] = set()
_bot_name: dict[str, str] = {}
_background: set[asyncio.Task] = set()


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
        "CREATE TABLE IF NOT EXISTS courier_telegram (user_id VARCHAR(64) PRIMARY KEY, chat_id VARCHAR(32) NOT NULL, "
        "tg_name VARCHAR(120), linked_at VARCHAR(32))",
        "CREATE UNIQUE INDEX IF NOT EXISTS courier_telegram_chat ON courier_telegram (chat_id)",
        "CREATE TABLE IF NOT EXISTS courier_telegram_codes (code VARCHAR(48) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, "
        "expires_at VARCHAR(32) NOT NULL)",
    ):
        await db.execute(text(stmt))
    await db.commit()


async def chat_for(db, user_id: str) -> Optional[str]:
    await ensure_tables(db)
    return await db.scalar(text("SELECT chat_id FROM courier_telegram WHERE user_id = :u"), {"u": str(user_id)})


async def courier_for_chat(db, chat_id: Any) -> Optional[str]:
    await ensure_tables(db)
    return await db.scalar(text("SELECT user_id FROM courier_telegram WHERE chat_id = :c"), {"c": str(chat_id)})


# ---------------- linking ----------------
async def bot_username() -> Optional[str]:
    from services.news_agent import bot_token, tg
    token = bot_token()
    if not token:
        return None
    if token not in _bot_name:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                _bot_name[token] = (await tg(client, "getMe", {}))["result"]["username"]
        except Exception as exc:
            logger.warning("[CourierTG] getMe failed: %s", exc)
            return None
    return _bot_name[token]


async def status(db, user_id: str) -> dict[str, Any]:
    """For the cabinet: is Telegram linked, and a fresh one-time link to link it."""
    linked = await chat_for(db, user_id)
    bot = await bot_username()
    out: dict[str, Any] = {"linked": bool(linked), "available": bool(bot), "bot": bot, "url": None}
    if bot and not linked:
        code = secrets.token_urlsafe(18)
        await db.execute(text("DELETE FROM courier_telegram_codes WHERE user_id = :u OR expires_at < :n"),
                         {"u": str(user_id), "n": now().isoformat()})
        await db.execute(text("INSERT INTO courier_telegram_codes (code, user_id, expires_at) VALUES (:c, :u, :e)"),
                         {"c": code, "u": str(user_id), "e": (now() + timedelta(minutes=TOKEN_MINUTES)).isoformat()})
        out["url"] = f"https://t.me/{bot}?start={START_PREFIX}{code}"
    await db.commit()
    return out


async def unlink(db, user_id: str) -> None:
    await ensure_tables(db)
    await db.execute(text("DELETE FROM courier_telegram WHERE user_id = :u"), {"u": str(user_id)})
    await db.commit()


async def _link(db, code: str, chat: dict, sender: dict) -> str:
    await ensure_tables(db)
    row = (await db.execute(text("SELECT user_id, expires_at FROM courier_telegram_codes WHERE code = :c"), {"c": code})).first()
    if not row or row.expires_at < now().isoformat():
        return "Ссылка устарела. Откройте кабинет курьера и нажмите «Подключить Телеграм» ещё раз."
    from models.logistics import CourierProfile
    profile = await db.get(CourierProfile, row.user_id)
    if not profile or not profile.is_verified:
        return "Курьер не подтверждён. Обратитесь к оператору DÄM ALEM."
    chat_id = str(chat.get("id"))
    name = " ".join(x for x in (sender.get("first_name"), sender.get("last_name")) if x) or sender.get("username") or ""
    # One Telegram chat belongs to one courier; relinking moves it.
    await db.execute(text("DELETE FROM courier_telegram WHERE user_id = :u OR chat_id = :c"), {"u": row.user_id, "c": chat_id})
    await db.execute(text("INSERT INTO courier_telegram (user_id, chat_id, tg_name, linked_at) VALUES (:u, :c, :n, :t)"),
                     {"u": row.user_id, "c": chat_id, "n": name[:120], "t": now().isoformat()})
    await db.execute(text("DELETE FROM courier_telegram_codes WHERE code = :c"), {"c": code})
    await db.commit()
    return ("✅ Телеграм подключён к кабинету курьера DÄM ALEM.\n\nСюда будут приходить доставки, которые вам назначит "
            "оператор: адрес, что везти, телефон клиента и сколько взять денег. Кнопками под заказом отмечайте "
            "«Забрал», «Еду к клиенту», «Доставлено».\n\nСмену открывайте и закрывайте в кабинете, как обычно.\n"
            "Отключить — команда /stop.")


async def handle_message(db, client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """/start cr_<code> links the chat, /stop unlinks it. True when the message was ours."""
    from services.news_agent import tg
    chat = message.get("chat") or {}
    if chat.get("type") != "private":
        return False
    words = str(message.get("text") or "").strip().split()
    if not words:
        return False
    if words[0] == "/start" and len(words) == 2 and words[1].startswith(START_PREFIX):
        answer = await _link(db, words[1][len(START_PREFIX):], chat, message.get("from") or {})
    elif words[0] == "/stop" and await courier_for_chat(db, chat.get("id")):
        await db.execute(text("DELETE FROM courier_telegram WHERE chat_id = :c"), {"c": str(chat.get("id"))})
        await db.commit()
        answer = "Телеграм отключён. Доставки будут только в кабинете курьера. Подключить снова — в кабинете."
    else:
        return False
    await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": answer})
    return True


# ---------------- the delivery card ----------------
def _money(value: Any) -> str:
    return f"{round(float(value or 0)):,}".replace(",", " ") + " ₸"


def _items(order_items: Any) -> list[str]:
    try:
        items = json.loads(order_items) if isinstance(order_items, str) else (order_items or [])
    except (TypeError, ValueError):
        items = []
    out = []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and item.get("name"):
            out.append(f"• {html.escape(str(item['name']))} × {int(item.get('quantity') or 1)}")
    return out


def card(task: Any, order: Any, kind: str = "status") -> str:
    """The text of the delivery card. Money comes from the order — the same numbers as the cabinet."""
    from services.dam_order_workflow import money, paid
    status = task.status if kind not in ("cancelled", "reassigned") else kind
    lines = [f"<b>{KIND_TITLES.get(kind, 'Доставка')}</b> · заказ №{task.source_id}"]
    if kind not in ("cancelled", "reassigned"):
        lines.append(f"Статус: {STATUS_LABELS.get(status, status)}")
    if kind in ("cancelled", "reassigned"):
        lines.append("Эту доставку везти не нужно." if kind == "cancelled" else "Эту доставку теперь везёт другой курьер.")
        return "\n".join(lines)
    if order is not None and order.status == "preparing" and task.status == "assigned":
        lines.append("⏳ Кухня ещё готовит — заберёте, когда будет готово.")
    lines.append("")
    lines.append(f"📍 <b>{html.escape(task.dropoff_address or '—')}</b>")
    if task.dropoff_lat and task.dropoff_lng:
        lines.append(f'<a href="https://www.google.com/maps/search/?api=1&query={task.dropoff_lat},{task.dropoff_lng}">Открыть на карте</a>')
    who = html.escape(task.customer_name or "Клиент")
    lines.append(f"👤 {who}" + (f" · {html.escape(task.customer_phone)}" if task.customer_phone else ""))
    comment = getattr(task, "comment", None)
    if comment:
        lines.append(f"💬 {html.escape(str(comment))[:400]}")
    items = _items(task.order_items)
    if items:
        lines.append("")
        lines.append("<b>Что везти:</b>")
        lines.extend(items[:25])
    if order is not None:
        total, due = money(order.total_amount), max(money(0), money(order.total_amount) - paid(order))
        lines.append("")
        if due <= 0:
            lines.append(f"💳 Оплачено ({PAYMENT_LABELS.get(order.payment_method, order.payment_method or 'онлайн')}) — деньги не брать")
        elif order.payment_method == "cash":
            lines.append(f"💵 <b>Взять наличными: {_money(due)}</b>")
            if order.cash_given_amount and float(order.cash_given_amount) > float(due):
                lines.append(f"Клиент даст {_money(order.cash_given_amount)}, сдача {_money(order.change_amount or float(order.cash_given_amount) - float(due))}")
        else:
            lines.append(f"📲 К оплате {_money(due)} — {PAYMENT_LABELS.get(order.payment_method, order.payment_method or '')}, клиент оплачивает переводом")
        if total != due and due > 0:
            lines.append(f"Сумма заказа {_money(total)}, уже оплачено {_money(total - due)}")
    if task.courier_payout is not None:
        lines.append(f"🪙 Ваша выплата за доставку: {_money(task.courier_payout)}")
    return "\n".join(lines)


def keyboard(task: Any) -> dict:
    rows = [[{"text": label, "callback_data": f"{CALLBACK_PREFIX}{step}:{task.id}"}] for step, label in NEXT_STEPS.get(task.status, [])]
    rows.append([{"text": "🔄 Обновить", "callback_data": f"{CALLBACK_PREFIX}r:{task.id}"}])
    return {"inline_keyboard": rows}


async def _load(db, task_id: int):
    from models.food_orders import Food_orders
    from models.logistics import LogisticsTask
    task = await db.get(LogisticsTask, task_id, populate_existing=True)
    order = await db.get(Food_orders, task.source_id, populate_existing=True) if task and task.source_type == "food_orders" else None
    return task, order


# ---------------- sending ----------------
def notify(task_id: int, kind: str, courier_id: Optional[str]) -> None:
    """Called right after the delivery change is saved; sends in the background so the operator never waits."""
    from services.news_agent import bot_token
    if not bot_token() or not courier_id:
        return
    job = asyncio.get_running_loop().create_task(_send(task_id, kind, str(courier_id)))
    _background.add(job)
    job.add_done_callback(_background.discard)


async def _send(task_id: int, kind: str, courier_id: str) -> None:
    from core.database import db_manager
    from services.news_agent import tg
    try:
        async with db_manager.async_session_maker() as db:
            chat_id = await chat_for(db, courier_id)
            if not chat_id:
                return
            task, order = await _load(db, task_id)
            if not task:
                return
            final = kind in ("cancelled", "reassigned")
            payload: dict[str, Any] = {"chat_id": chat_id, "text": card(task, order, kind), "parse_mode": "HTML",
                                       "disable_web_page_preview": True}
            if not final and str(task.courier_id) == courier_id:
                payload["reply_markup"] = keyboard(task)
            async with httpx.AsyncClient(timeout=20) as client:
                await tg(client, "sendMessage", payload)
    except Exception as exc:
        logger.warning("[CourierTG] delivery %s (%s) not sent: %s", task_id, kind, exc)


# ---------------- buttons ----------------
async def handle_callback(db, client: httpx.AsyncClient, data: str, chat_id: Any, message: dict[str, Any]) -> Optional[str]:
    """«Забрал» / «Еду к клиенту» / «На месте» / «Доставлено» / «Обновить» under a delivery card."""
    from services.news_agent import tg
    parts = data[len(CALLBACK_PREFIX):].split(":")
    if len(parts) != 2 or not parts[1].isdigit():
        return None
    action, task_id = parts[0], int(parts[1])
    user_id = await courier_for_chat(db, chat_id)
    if not user_id:
        return "Телеграм не подключён к кабинету курьера"
    task, order = await _load(db, task_id)
    if not task or str(task.courier_id) != user_id:
        answer = "Эта доставка уже не ваша"
    elif action == "r":
        answer = "Обновлено"
    elif action not in {step for steps in NEXT_STEPS.values() for step, _ in steps}:
        return None
    else:
        answer = await _advance(db, user_id, task, action)
        task, order = await _load(db, task_id)
    try:
        own = task is not None and str(task.courier_id) == user_id
        await tg(client, "editMessageText", {
            "chat_id": chat_id, "message_id": message.get("message_id"), "parse_mode": "HTML", "disable_web_page_preview": True,
            "text": card(task, order, "status") if own else card(task, order, "reassigned") if task else "Доставка не найдена",
            **({"reply_markup": keyboard(task)} if own and task.status in NEXT_STEPS else {})})
    except Exception as exc:  # «message is not modified» after «Обновить» is normal
        logger.info("[CourierTG] card not updated: %s", exc)
    return answer


async def _advance(db, user_id: str, task: Any, new_status: str) -> str:
    """The cabinet's own path: courier access → open shift → audit → the shared status machine."""
    from models.auth import User
    from services.food_shifts import record_action, require_courier_shift
    from services.logistics_courier import assert_courier_cabinet_access
    from services.logistics_service import advance_task_status
    try:
        user = await db.get(User, user_id)
        if not user:
            return "Аккаунт курьера не найден"
        profile = await assert_courier_cabinet_access(db, user)
        shift = await require_courier_shift(db, profile)
        record_action(db, shift, "delivery_status_changed", staff_type="courier", staff_id=user_id,
                      staff_name=user.name or profile.phone or "Курьер", role="courier", entity_type="delivery_task",
                      entity_id=task.id, details={"status": new_status, "via": "telegram"})
        await advance_task_status(db, task, user, new_status)
    except HTTPException as exc:
        await db.rollback()
        return str(exc.detail)[:190]
    except ValueError as exc:
        await db.rollback()
        return str(exc)[:190]
    return {"picked_up": "Отмечено: забрал заказ", "on_the_way": "Отмечено: еду к клиенту",
            "arrived": "Отмечено: на месте", "delivered": "Доставлено! Спасибо"}.get(new_status, "Готово")
