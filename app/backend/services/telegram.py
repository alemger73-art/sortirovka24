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
        CATEGORY_JOBS, CATEGORY_ANNOUNCEMENTS,
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