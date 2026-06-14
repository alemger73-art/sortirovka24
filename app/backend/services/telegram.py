"""
Telegram Bot API notification service with category-based routing.

Each notification category can have its own bot token and chat_id.
Configuration via environment variables:

Default (fallback):
  TELEGRAM_BOT_TOKEN      — Default bot token
  TELEGRAM_CHAT_ID        — Default chat ID

Per-category overrides (optional):
  TELEGRAM_BOT_TOKEN_COMPLAINTS     / TELEGRAM_CHAT_ID_COMPLAINTS
  TELEGRAM_BOT_TOKEN_MASTERS        / TELEGRAM_CHAT_ID_MASTERS
  TELEGRAM_BOT_TOKEN_BECOME_MASTER  / TELEGRAM_CHAT_ID_BECOME_MASTER
  TELEGRAM_BOT_TOKEN_JOBS           / TELEGRAM_CHAT_ID_JOBS
  TELEGRAM_BOT_TOKEN_ANNOUNCEMENTS  / TELEGRAM_CHAT_ID_ANNOUNCEMENTS
  TELEGRAM_BOT_TOKEN_GASTRONOM      / TELEGRAM_CHAT_ID_GASTRONOM
  TELEGRAM_BOT_TOKEN_TAXI           / TELEGRAM_CHAT_ID_TAXI

If a per-category variable is not set, the default is used.
"""

import logging
import os
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"

# Category keys for routing
CATEGORY_COMPLAINTS = "COMPLAINTS"
CATEGORY_MASTERS = "MASTERS"
CATEGORY_BECOME_MASTER = "BECOME_MASTER"
CATEGORY_JOBS = "JOBS"
CATEGORY_ANNOUNCEMENTS = "ANNOUNCEMENTS"
CATEGORY_GASTRONOM = "GASTRONOM"
CATEGORY_FOOD = "FOOD"
CATEGORY_TAXI = "TAXI"


def _get_config(category: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
    """Get bot token and chat_id for a specific category, falling back to defaults."""
    default_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    default_chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if not category:
        return default_token, default_chat_id

    token = os.environ.get(f"TELEGRAM_BOT_TOKEN_{category}") or default_token
    chat_id = os.environ.get(f"TELEGRAM_CHAT_ID_{category}") or default_chat_id
    return token, chat_id


def _is_configured(category: Optional[str] = None) -> bool:
    token, chat_id = _get_config(category)
    return bool(token and chat_id)


def get_routing_info() -> dict:
    """Return current Telegram routing configuration for diagnostics."""
    categories = [
        CATEGORY_COMPLAINTS, CATEGORY_MASTERS, CATEGORY_BECOME_MASTER,
        CATEGORY_JOBS, CATEGORY_ANNOUNCEMENTS, CATEGORY_GASTRONOM, CATEGORY_FOOD, CATEGORY_TAXI,
    ]
    result = {"default": _is_configured(None)}
    for cat in categories:
        token, chat_id = _get_config(cat)
        has_own_token = bool(os.environ.get(f"TELEGRAM_BOT_TOKEN_{cat}"))
        has_own_chat = bool(os.environ.get(f"TELEGRAM_CHAT_ID_{cat}"))
        result[cat.lower()] = {
            "configured": bool(token and chat_id),
            "own_token": has_own_token,
            "own_chat_id": has_own_chat,
        }
    return result


async def send_telegram_message(
    text: str, parse_mode: str = "HTML", category: Optional[str] = None
) -> bool:
    token, chat_id = _get_config(category)
    if not token or not chat_id:
        logger.warning(f"Telegram not configured for category={category}. Skipping.")
        return False

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                logger.info(f"Telegram notification sent (category={category})")
                return True
            else:
                logger.error(f"Telegram API error: {resp.status_code} — {resp.text}")
                return False
    except httpx.TimeoutException:
        logger.error("Telegram API request timed out")
        return False
    except Exception as e:
        logger.error(f"Telegram send error: {e}")
        return False


def _escape_html(text: str) -> str:
    if not text:
        return ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _format_date(dt: Optional[datetime] = None) -> str:
    if dt is None:
        dt = datetime.now()
    return dt.strftime("%d.%m.%Y %H:%M")


# ─── Notification formatters ───────────────────────────────────────

async def notify_new_master_request(data: dict) -> bool:
    text = (
        "🔧 <b>Новая заявка на услугу</b>\n\n"
        f"<b>Категория:</b> {_escape_html(data.get('category', '—'))}\n"
        f"<b>Описание:</b> {_escape_html(data.get('problem_description', '—'))}\n"
        f"<b>Адрес:</b> {_escape_html(data.get('address', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('phone', '—'))}\n"
        f"<b>Имя:</b> {_escape_html(data.get('client_name', '—'))}\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_MASTERS)


async def notify_new_complaint(data: dict) -> bool:
    """Send notification about a new complaint with photo/video info."""
    photo_count = data.get('photo_count', 0)
    has_video = data.get('has_video', False)

    media_parts = []
    if photo_count:
        media_parts.append(f"📷 {photo_count} фото")
    if has_video:
        media_parts.append("🎥 видео")
    media_line = f"\n<b>Медиа:</b> {', '.join(media_parts)}" if media_parts else ""

    text = (
        "⚠️ <b>Новая жалоба жителей</b>\n\n"
        f"<b>Категория:</b> {_escape_html(data.get('category', '—'))}\n"
        f"<b>Адрес:</b> {_escape_html(data.get('address', '—'))}\n"
        f"<b>Описание:</b> {_escape_html(data.get('description', '—'))}\n"
        f"<b>Имя:</b> {_escape_html(data.get('author_name', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('phone', '—'))}"
        f"{media_line}\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_COMPLAINTS)


async def notify_new_become_master(data: dict) -> bool:
    text = (
        "👤 <b>Новая заявка мастера</b>\n\n"
        f"<b>Имя:</b> {_escape_html(data.get('name', '—'))}\n"
        f"<b>Категория:</b> {_escape_html(data.get('category', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('phone', '—'))}\n"
        f"<b>WhatsApp:</b> {_escape_html(data.get('whatsapp', '—'))}\n"
        f"<b>Район:</b> {_escape_html(data.get('district', '—'))}\n"
        f"<b>Описание:</b> {_escape_html(data.get('description', '—'))}"
    )
    return await send_telegram_message(text, category=CATEGORY_BECOME_MASTER)


async def notify_new_announcement(data: dict) -> bool:
    """Send notification about a new announcement pending moderation."""
    ann_types_map = {
        'sell': 'Продам', 'buy': 'Куплю', 'rent': 'Сдам',
        'services': 'Услуги', 'realestate': 'Недвижимость',
        'free': 'Отдам бесплатно', 'other': 'Другое',
    }
    ann_type_label = ann_types_map.get(data.get('ann_type', ''), data.get('ann_type', '—'))

    photo_count = data.get('photo_count', 0)
    photo_line = f"\n<b>Фото:</b> {photo_count} шт." if photo_count else ""

    text = (
        "📢 <b>Новое объявление на модерации</b>\n\n"
        f"<b>Категория:</b> {_escape_html(ann_type_label)}\n"
        f"<b>Заголовок:</b> {_escape_html(data.get('ann_title', '—'))}\n"
        f"<b>Цена:</b> {_escape_html(data.get('price', '—'))}\n"
        f"<b>Район:</b> {_escape_html(data.get('address', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('phone', '—'))}\n"
        f"<b>WhatsApp:</b> {_escape_html(data.get('whatsapp', '—'))}\n"
        f"<b>Описание:</b> {_escape_html(data.get('description', '—'))}"
        f"{photo_line}\n"
        f"<b>Дата:</b> {_format_date()}\n\n"
        "⏳ Ожидает одобрения в админ-панели"
    )
    return await send_telegram_message(text, category=CATEGORY_ANNOUNCEMENTS)


async def notify_gastronom_order(data: dict) -> bool:
    """Send notification about a new ГАСТРАНОМ grocery order."""
    items = data.get("items") or []
    if isinstance(items, str):
        try:
            import json
            items = json.loads(items)
        except Exception:
            items = []

    lines = []
    for idx, item in enumerate(items, 1):
        name = item.get("name", "—")
        qty = item.get("qty", 1)
        price = item.get("price", 0)
        sum_val = item.get("sum", qty * price)
        weight = item.get("weight", "")
        weight_part = f" ({weight})" if weight else ""
        if item.get("is_gift"):
            lines.append(f"🎁 {_escape_html(name)}{weight_part}")
        else:
            lines.append(f"{idx}. {_escape_html(name)}{weight_part} ×{qty} = {sum_val} ₸")

    items_text = "\n".join(lines) if lines else "—"
    payment_map = {"cash": "Наличные", "kaspi_qr": "Kaspi QR", "halyk_qr": "Halyk QR", "card": "Картой"}
    payment_label = payment_map.get(data.get("payment_method", ""), data.get("payment_method", "—"))

    comment_line = ""
    if data.get("comment"):
        comment_line = f"\n<b>Комментарий:</b> {_escape_html(data.get('comment'))}"

    gift_line = ""
    gift = data.get("loyalty_gift")
    if isinstance(gift, dict) and gift.get("title"):
        gift_line = f"\n<b>🎁 Подарок:</b> {_escape_html(gift.get('title'))} (от {int(gift.get('min_amount', 0))} ₸)"

    delivery_fee = data.get("delivery_fee") or 0
    delivery_line = ""
    try:
        if float(delivery_fee) > 0:
            zone_part = f" ({_escape_html(data.get('delivery_zone'))})" if data.get("delivery_zone") else ""
            delivery_line = f"\n<b>Доставка:</b> {delivery_fee} ₸{zone_part}"
    except (TypeError, ValueError):
        pass

    text = (
        "🛒 <b>Новый заказ ГАСТРОНОМ</b>\n\n"
        f"<b>№ заказа:</b> {data.get('order_id', '—')}\n"
        f"<b>Клиент:</b> {_escape_html(data.get('customer_name', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('customer_phone', '—'))}\n"
        f"<b>Адрес:</b> {_escape_html(data.get('customer_address', '—'))}\n"
        f"<b>Оплата:</b> {_escape_html(payment_label)}\n\n"
        f"<b>Товары:</b>\n{items_text}"
        f"{delivery_line}\n\n"
        f"<b>Итого:</b> {data.get('total_amount', 0)} ₸"
        f"{gift_line}"
        f"{comment_line}\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_GASTRONOM)


async def notify_food_order(data: dict) -> bool:
    """Notify Telegram about a new DAM ALEM / food delivery order."""
    import json

    lines: list[str] = []
    raw_items = data.get("order_items")
    try:
        items = json.loads(raw_items) if isinstance(raw_items, str) else (raw_items or [])
    except (json.JSONDecodeError, TypeError):
        items = []

    if isinstance(items, list):
        for idx, item in enumerate(items, 1):
            if not isinstance(item, dict):
                continue
            name = _escape_html(str(item.get("name", "—")))
            qty = int(item.get("quantity") or 1)
            price = float(item.get("price") or 0)
            mod_total = float(item.get("modTotal") or 0)
            mods = item.get("modifiers") or []
            mod_names = ", ".join(
                _escape_html(m.get("name", "")) for m in mods if isinstance(m, dict) and m.get("name")
            )
            mod_part = f" + {mod_names}" if mod_names else ""
            line_sum = (price + mod_total) * qty
            lines.append(f"{idx}. {name}{mod_part} ×{qty} = {line_sum:.0f} ₸")

    items_text = "\n".join(lines) if lines else "—"
    restaurant = _escape_html(data.get("restaurant_name") or "DAM ALEM")
    delivery_method = data.get("delivery_method") or "delivery"
    method_label = "🚗 Доставка" if delivery_method == "delivery" else "🏪 Самовывоз"

    address = data.get("delivery_address") or ""
    address_line = f"\n<b>Адрес:</b> {_escape_html(address)}" if address else ""

    comment_line = ""
    if data.get("comment"):
        comment_line = f"\n<b>Комментарий:</b> {_escape_html(data.get('comment'))}"

    payment_map = {"cash": "Наличные", "kaspi_qr": "Kaspi QR", "halyk_qr": "Halyk QR"}
    payment_label = payment_map.get(data.get("payment_method", ""), data.get("payment_method") or "—")
    payment_line = f"\n<b>Оплата:</b> {_escape_html(payment_label)}"

    text = (
        f"🍽 <b>Новый заказ — {restaurant}</b>\n\n"
        f"<b>№ заказа:</b> {data.get('order_id', '—')}\n"
        f"<b>Клиент:</b> {_escape_html(data.get('customer_name', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('customer_phone', '—'))}\n"
        f"<b>Способ:</b> {method_label}"
        f"{address_line}"
        f"{payment_line}\n\n"
        f"<b>Заказ:</b>\n{items_text}\n\n"
        f"<b>Итого:</b> {data.get('total_amount', 0)} ₸"
        f"{comment_line}\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    # FOOD category uses TELEGRAM_BOT_TOKEN_FOOD / TELEGRAM_CHAT_ID_FOOD or defaults
    return await send_telegram_message(text, category=CATEGORY_FOOD)


async def notify_food_order_status(data: dict) -> bool:
    """Notify Telegram when a food order status changes."""
    status_map = {
        "new": "Новый",
        "in_progress": "Готовится",
        "done": "Доставлен",
        "cancelled": "Отменён",
    }
    old_label = status_map.get(data.get("old_status", ""), data.get("old_status", "—"))
    new_label = status_map.get(data.get("new_status", ""), data.get("new_status", "—"))
    restaurant = _escape_html(data.get("restaurant_name") or "DAM ALEM")
    text = (
        f"📦 <b>Статус заказа — {restaurant}</b>\n\n"
        f"<b>№:</b> {data.get('order_id', '—')}\n"
        f"<b>Клиент:</b> {_escape_html(data.get('customer_name', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('customer_phone', '—'))}\n"
        f"<b>Было:</b> {_escape_html(old_label)}\n"
        f"<b>Стало:</b> {_escape_html(new_label)}\n"
        f"<b>Сумма:</b> {data.get('total_amount', 0)} ₸\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_FOOD)


async def notify_gastronom_status_change(data: dict) -> bool:
    """Notify Telegram when a ГАСТРАНОМ order status changes."""
    status_map = {
        "new": "Новый",
        "processing": "В работе",
        "delivered": "Доставлен",
        "cancelled": "Отменён",
    }
    old_label = status_map.get(data.get("old_status", ""), data.get("old_status", "—"))
    new_label = status_map.get(data.get("new_status", ""), data.get("new_status", "—"))
    text = (
        "📦 <b>Изменение статуса заказа ГАСТРАНОМ</b>\n\n"
        f"<b>№ заказа:</b> {data.get('order_id', '—')}\n"
        f"<b>Клиент:</b> {_escape_html(data.get('customer_name', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('customer_phone', '—'))}\n"
        f"<b>Было:</b> {_escape_html(old_label)}\n"
        f"<b>Стало:</b> {_escape_html(new_label)}\n"
        f"<b>Сумма:</b> {data.get('total_amount', 0)} ₸\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_GASTRONOM)


async def notify_new_job(data: dict) -> bool:
    """Send notification about a new job posting pending moderation."""
    has_image = data.get('has_image', False)
    image_line = "\n<b>📷 Есть фото/логотип</b>" if has_image else ""

    text = (
        "💼 <b>Новая вакансия на модерации</b>\n\n"
        f"<b>Название:</b> {_escape_html(data.get('job_title', '—'))}\n"
        f"<b>Работодатель:</b> {_escape_html(data.get('employer', '—'))}\n"
        f"<b>Категория:</b> {_escape_html(data.get('category', '—'))}\n"
        f"<b>Зарплата:</b> {_escape_html(data.get('salary', '—'))}\n"
        f"<b>График:</b> {_escape_html(data.get('schedule', '—'))}\n"
        f"<b>Район:</b> {_escape_html(data.get('district', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('phone', '—'))}\n"
        f"<b>WhatsApp:</b> {_escape_html(data.get('whatsapp', '—'))}\n"
        f"<b>Описание:</b> {_escape_html(data.get('description', '—'))}"
        f"{image_line}\n"
        f"<b>Дата:</b> {_format_date()}\n\n"
        "⏳ Ожидает одобрения в админ-панели"
    )
    return await send_telegram_message(text, category=CATEGORY_JOBS)


TAXI_STATUS_LABELS = {
    "accepted": "✅ Водитель принял заказ",
    "driver_arrived": "📍 Водитель на месте",
    "in_progress": "🚗 Поездка началась",
    "completed": "🏁 Поездка завершена",
    "cancelled": "❌ Поездка отменена",
}


async def notify_taxi_new_ride(data: dict) -> bool:
    text = (
        "🚕 <b>Новый заказ такси — Сортировка</b>\n\n"
        f"<b>Откуда:</b> {_escape_html(data.get('from_address', '—'))}\n"
        f"<b>Куда:</b> {_escape_html(data.get('to_address', '—'))}\n"
        f"<b>Расстояние:</b> {data.get('distance_km', '—')} км\n"
        f"<b>Цена:</b> {int(data.get('estimated_price') or 0)} ₸\n"
        f"<b>Пассажир:</b> {_escape_html(data.get('passenger_name', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('passenger_phone', '—'))}\n"
        f"<b>Оплата:</b> {_escape_html(data.get('payment_method', 'cash'))}\n"
        f"<b>ID:</b> #{data.get('id', '—')}\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_TAXI)


async def notify_taxi_status_change(data: dict, status: str) -> bool:
    label = TAXI_STATUS_LABELS.get(status, status)
    text = (
        f"🚕 <b>Такси #{data.get('id', '—')}</b> — {label}\n\n"
        f"<b>Откуда:</b> {_escape_html(data.get('from_address', '—'))}\n"
        f"<b>Куда:</b> {_escape_html(data.get('to_address', '—'))}\n"
        f"<b>Статус:</b> {status}\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_TAXI)


async def notify_taxi_driver_application(data: dict) -> bool:
    text = (
        "👨‍✈️ <b>Новая заявка водителя — Такси Сортировка</b>\n\n"
        f"<b>Имя:</b> {_escape_html(data.get('full_name', '—'))}\n"
        f"<b>Телефон:</b> {_escape_html(data.get('phone', '—'))}\n"
        f"<b>Авто:</b> {_escape_html(data.get('car_make', ''))} {_escape_html(data.get('car_model', ''))}\n"
        f"<b>Номер:</b> {_escape_html(data.get('car_number', '—'))}\n"
        f"<b>Цвет:</b> {_escape_html(data.get('car_color', '—'))}\n"
        f"<b>Комментарий:</b> {_escape_html(data.get('comment', '—'))}\n"
        f"<b>User ID:</b> {data.get('user_id', '—')}\n"
        f"<b>Дата:</b> {_format_date()}"
    )
    return await send_telegram_message(text, category=CATEGORY_TAXI)