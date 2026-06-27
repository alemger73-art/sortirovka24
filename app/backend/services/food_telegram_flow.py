"""DAM ALEM food order flow — operator & courier Telegram messages + callbacks."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

from models.food_orders import Food_orders
from services.logistics_service import create_task_from_food_order, get_task_by_source, mark_task_ready
from datetime import datetime, timezone

from services.telegram import (
    CATEGORY_FOOD,
    CATEGORY_FOOD_COURIER,
    _escape_html,
    _format_date,
    send_telegram_message,
    send_telegram_photo,
)
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

PAYMENT_LABELS = {
    "cash": "💵 Наличные",
    "kaspi_qr": "📱 Kaspi QR",
    "halyk_qr": "📱 Halyk QR",
}


def _admin_order_url(order_id: int) -> str:
    base = (os.environ.get("PUBLIC_FRONTEND_URL") or os.environ.get("FRONTEND_URL") or "").rstrip("/")
    if not base:
        return f"Заказ #{order_id} — откройте админку DAM ALEM → Заказы"
    return f"{base}/admin?section=food-orders&order={order_id}"


def _qr_image_url(order_id: int, total: float, payment_method: str) -> str:
    payload = f"DAMALEM:{order_id};TOTAL:{int(total)};PAY:{payment_method}"
    from urllib.parse import quote

    return f"https://api.qrserver.com/v1/create-qr-code/?size=512x512&data={quote(payload)}"


def _format_items(order_items: Optional[str]) -> str:
    try:
        items = json.loads(order_items) if isinstance(order_items, str) else (order_items or [])
    except (json.JSONDecodeError, TypeError):
        items = []
    lines: list[str] = []
    if isinstance(items, list):
        for idx, item in enumerate(items, 1):
            if not isinstance(item, dict):
                continue
            name = _escape_html(str(item.get("name", "—")))
            qty = int(item.get("quantity") or 1)
            price = float(item.get("price") or 0)
            mod_total = float(item.get("modTotal") or 0)
            lines.append(f"{idx}. {name} ×{qty} = {(price + mod_total) * qty:.0f} ₸")
    return "\n".join(lines) if lines else "—"


def operator_keyboard(order_id: int) -> dict:
    return {
        "inline_keyboard": [
            [
                {"text": "✅ Подтверждён", "callback_data": f"fo_confirm:{order_id}"},
                {"text": "❌ Отмена", "callback_data": f"fo_cancel:{order_id}"},
            ],
            [
                {"text": "🚴 Отправить курьеру", "callback_data": f"fo_dispatch:{order_id}"},
            ],
        ]
    }


def courier_keyboard(task_id: int, payment_method: str) -> dict:
    rows = [
        [
            {"text": "📦 Забрал", "callback_data": f"fcd_pick:{task_id}"},
            {"text": "🚗 В пути", "callback_data": f"fcd_way:{task_id}"},
        ],
        [
            {"text": "✅ Доставлено", "callback_data": f"fcd_done:{task_id}"},
            {"text": "💵 Наличные принял", "callback_data": f"fcd_cash:{task_id}"},
        ],
    ]
    if payment_method in ("kaspi_qr", "halyk_qr"):
        rows.append([{"text": "📲 Показать QR клиенту", "callback_data": f"fcd_qr:{task_id}"}])
    return {"inline_keyboard": rows}


async def notify_operator_new_order(order: Food_orders) -> bool:
    """Новый заказ → чат операторов с кнопками."""
    delivery_method = order.delivery_method or "delivery"
    method_label = "🚗 Доставка" if delivery_method == "delivery" else "🏪 Самовывоз"
    payment = PAYMENT_LABELS.get(order.payment_method or "", order.payment_method or "—")
    items_text = _format_items(order.order_items)
    address = order.delivery_address or ""
    address_line = f"\n<b>Адрес:</b> {_escape_html(address)}" if address else ""
    comment_line = f"\n<b>Комментарий:</b> {_escape_html(order.comment)}" if order.comment else ""
    admin_link = _admin_order_url(order.id)

    text = (
        f"🍽 <b>НОВЫЙ ЗАКАЗ #{order.id}</b>\n"
        f"<i>Позвоните клиенту и подтвердите</i>\n\n"
        f"<b>Клиент:</b> {_escape_html(order.customer_name or '—')}\n"
        f"<b>Телефон:</b> <a href=\"tel:{_escape_html(order.customer_phone or '')}\">"
        f"{_escape_html(order.customer_phone or '—')}</a>\n"
        f"<b>Способ:</b> {method_label}"
        f"{address_line}\n"
        f"<b>Оплата:</b> {payment}\n\n"
        f"<b>Состав:</b>\n{items_text}\n\n"
        f"<b>Итого:</b> {order.total_amount or 0:.0f} ₸"
        f"{comment_line}\n\n"
        f"✏️ Редактировать: {admin_link}\n"
        f"<b>Время:</b> {_format_date()}"
    )
    return await send_telegram_message(
        text,
        category=CATEGORY_FOOD,
        reply_markup=operator_keyboard(order.id),
        disable_web_page_preview=True,
    )


async def dispatch_order_to_couriers(db: AsyncSession, order: Food_orders, *, delivery_fee: float = 0) -> bool:
    """После подтверждения оператором — задача курьерам в Telegram."""
    if (order.delivery_method or "").lower() not in ("delivery", "доставка"):
        return False
    if (order.status or "") in ("cancelled", "done"):
        return False

    task = await get_task_by_source(db, "food_orders", order.id)
    if not task:
        task = await create_task_from_food_order(db, order, delivery_fee=delivery_fee)
    if not task:
        return False
    if task.status == "pending":
        task = await mark_task_ready(db, task)

    payment = order.payment_method or "cash"
    payment_label = PAYMENT_LABELS.get(payment, payment)
    items_text = _format_items(order.order_items)

    text = (
        f"🚴 <b>ДОСТАВКА #{order.id}</b>\n\n"
        f"<b>Забрать:</b> {_escape_html(task.pickup_address or order.restaurant_name or 'DAM ALEM')}\n"
        f"<b>Отвезти:</b> {_escape_html(task.dropoff_address or order.delivery_address or '—')}\n\n"
        f"<b>Клиент:</b> {_escape_html(order.customer_name or '—')}\n"
        f"<b>Телефон:</b> <a href=\"tel:{_escape_html(order.customer_phone or '')}\">"
        f"{_escape_html(order.customer_phone or '—')}</a>\n"
        f"<b>Оплата:</b> {payment_label}\n"
        f"<b>Сумма:</b> {order.total_amount or 0:.0f} ₸\n\n"
        f"<b>Заказ:</b>\n{items_text}"
    )
    if order.comment:
        text += f"\n\n<b>Комментарий:</b> {_escape_html(order.comment)}"

    sent = await send_telegram_message(
        text,
        category=CATEGORY_FOOD_COURIER,
        reply_markup=courier_keyboard(task.id, payment),
    )
    return sent


async def send_courier_qr(order: Food_orders, task_id: int) -> bool:
    payment = order.payment_method or "kaspi_qr"
    caption = (
        f"📲 QR для оплаты · заказ #{order.id}\n"
        f"Сумма: {order.total_amount or 0:.0f} ₸ · {PAYMENT_LABELS.get(payment, payment)}"
    )
    return await send_telegram_photo(
        _qr_image_url(order.id, float(order.total_amount or 0), payment),
        caption=caption,
        category=CATEGORY_FOOD_COURIER,
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def handle_food_callback(db: AsyncSession, data: str) -> Optional[str]:
    """Process inline button callback_data. Returns answer text for Telegram."""
    from services.food_orders import Food_ordersService
    from services.logistics_service import get_task_by_id

    if ":" not in data:
        return None
    action, raw_id = data.split(":", 1)
    try:
        oid = int(raw_id)
    except ValueError:
        return "Неверный ID"

    svc = Food_ordersService(db)

    if action == "fo_confirm":
        order = await svc.update(oid, {"status": "confirmed"})
        if not order:
            return "Заказ не найден"
        return f"✅ Заказ #{oid} подтверждён. Отредактируйте в админке при необходимости."

    if action == "fo_cancel":
        order = await svc.update(oid, {"status": "cancelled"})
        if not order:
            return "Заказ не найден"
        return f"❌ Заказ #{oid} отменён"

    if action == "fo_dispatch":
        order = await svc.get_by_id(oid)
        if not order:
            return "Заказ не найден"
        if order.status in ("cancelled", "done"):
            return "Заказ уже закрыт"
        # Переход в in_progress автоматически шлёт сообщение курьерам (food_orders.update)
        await svc.update(oid, {"status": "in_progress"})
        return f"🚴 Заказ #{oid} отправлен курьерам"

    task = await get_task_by_id(db, oid)
    if not task or task.source_type != "food_orders":
        return "Задача не найдена"

    order = await svc.get_by_id(task.source_id)
    if not order:
        return "Заказ не найден"

    if action == "fcd_qr":
        ok = await send_courier_qr(order, task.id)
        return "QR отправлен в чат" if ok else "Не удалось отправить QR"

    try:
        if action == "fcd_pick":
            if task.status in ("pending", "ready", "assigned"):
                old_status = task.status
                task.status = "picked_up"
                task.picked_up_at = _now_iso()
            else:
                return f"Уже: {task.status}"
        elif action == "fcd_way":
            if task.status in ("pending", "ready", "assigned", "picked_up"):
                old_status = task.status
                task.status = "on_the_way"
            else:
                return f"Уже: {task.status}"
        elif action in ("fcd_done", "fcd_cash"):
            old_status = task.status
            task.status = "delivered"
            task.delivered_at = _now_iso()
            payment_status = "paid"
            await db.commit()
            await db.refresh(task)
            try:
                from services.user_notifications import notify_logistics_task_status

                await notify_logistics_task_status(db, task, old_status, "delivered")
            except Exception as exc:
                logger.warning("[Notify] logistics delivered notify skipped: %s", exc)
            await svc.update(order.id, {"status": "done", "payment_status": payment_status})
            label = "💵 Наличные приняты" if action == "fcd_cash" else "✅ Доставлено"
            return label
        else:
            return None

        await db.commit()
        await db.refresh(task)
        try:
            from services.user_notifications import notify_logistics_task_status

            await notify_logistics_task_status(db, task, old_status, task.status)
        except Exception as exc:
            logger.warning("[Notify] logistics callback notify skipped: %s", exc)
    except Exception as exc:
        logger.warning("Courier callback failed: %s", exc)
        await db.rollback()
        return "Ошибка обновления статуса"

    labels = {
        "fcd_pick": "📦 Забрал заказ",
        "fcd_way": "🚗 В пути к клиенту",
    }
    return labels.get(action, "Статус обновлён")
