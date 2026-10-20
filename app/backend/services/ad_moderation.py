"""Announcements: owner moderation in Telegram (one tap) and author notifications.

New ad → card with photo and buttons to the owner's Telegram chat (the news bot).
«✅ Опубликовать» → approved for 30 days; «❌ …» → rejected with a reason.
The author gets a cabinet/push notice and a WhatsApp message from the S24 number.
"""

from __future__ import annotations

import html
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.announcements import Announcements

logger = logging.getLogger(__name__)
SITE = os.getenv("PUBLIC_SITE_URL", "https://www.sortirovka24.kz").rstrip("/")
LIFETIME_DAYS = 30
CALLBACK_RE = re.compile(r"^ad:(p|r):(\d+)(?::([a-z]+))?$")
REJECT_REASONS = {
    "photo": "нет нормального фото или описания",
    "banned": "товар или услуга запрещены правилами",
    "dup": "такое объявление уже есть",
    "spam": "похоже на спам или рекламу без сути",
    "other": "не подходит под правила раздела",
}
TYPE_LABELS = {"sell": "Продам", "buy": "Куплю", "rent": "Сдам", "services": "Услуги", "free": "Отдам бесплатно",
               "job": "Вакансия", "seek": "Ищу работу", "lost": "Потерял / нашёл", "other": "Объявление"}
MAX_PER_DAY = int(os.getenv("ADS_MAX_PER_DAY", "5"))
MAX_ACTIVE = int(os.getenv("ADS_MAX_ACTIVE", "15"))


def now() -> datetime:
    return datetime.now(timezone.utc)


async def check_limits(db: AsyncSession, user_id: str) -> None:
    """Simple anti-spam: a few ads per day and a cap on live ads per person."""
    from fastapi import HTTPException
    since = (now() - timedelta(days=1)).isoformat()
    today = await db.scalar(select(func.count()).select_from(Announcements).where(
        Announcements.user_id == user_id, Announcements.created_at >= since))
    if (today or 0) >= MAX_PER_DAY:
        raise HTTPException(429, f"Можно подать не больше {MAX_PER_DAY} объявлений в сутки. Попробуйте завтра.")
    live = await db.scalar(select(func.count()).select_from(Announcements).where(
        Announcements.user_id == user_id, Announcements.active.is_(True),
        Announcements.status.in_(["pending", "approved", "published"])))
    if (live or 0) >= MAX_ACTIVE:
        raise HTTPException(429, f"У вас уже {MAX_ACTIVE} активных объявлений. Снимите старые в личном кабинете.")


def _photo(ann: Announcements) -> Optional[str]:
    for key in [ann.image_url or ""] + (ann.gallery_images or "").split(","):
        key = key.strip()
        if key.startswith("https://"):
            return key
    return None


def card_text(ann: Announcements) -> str:
    esc = lambda v: html.escape(str(v or ""))  # noqa: E731
    lines = [f"📢 <b>Объявление на проверку</b> · {esc(TYPE_LABELS.get(ann.ann_type or '', 'Объявление'))}",
             "", f"<b>{esc(ann.title)}</b>"]
    if ann.price:
        lines.append(f"Цена: {esc(ann.price)}")
    lines += ["", esc((ann.description or "")[:700])]
    if ann.address:
        lines.append(f"\n📍 {esc(ann.address)}")
    lines.append(f"👤 {esc(ann.author_name or '—')} · {esc(ann.phone or '—')}")
    photos = len([k for k in (ann.gallery_images or "").split(",") if k.strip()])
    lines.append(f"📷 Фото: {photos}" if photos else "📷 Без фото")
    return "\n".join(lines)[:1000]


def keyboard(ann_id: int) -> dict[str, Any]:
    return {"inline_keyboard": [
        [{"text": "✅ Опубликовать", "callback_data": f"ad:p:{ann_id}"}],
        [{"text": "❌ Нет фото/описания", "callback_data": f"ad:r:{ann_id}:photo"},
         {"text": "❌ Запрещено", "callback_data": f"ad:r:{ann_id}:banned"}],
        [{"text": "❌ Дубль", "callback_data": f"ad:r:{ann_id}:dup"},
         {"text": "❌ Спам", "callback_data": f"ad:r:{ann_id}:spam"},
         {"text": "❌ Другое", "callback_data": f"ad:r:{ann_id}:other"}],
    ]}


async def send_for_moderation(ann: Announcements) -> bool:
    from services.news_agent import approval_chat, bot_token, tg
    if not (bot_token() and approval_chat()):
        return False
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            photo = _photo(ann)
            if photo:
                try:
                    await tg(client, "sendPhoto", {"chat_id": approval_chat(), "photo": photo, "caption": card_text(ann),
                                                   "parse_mode": "HTML", "reply_markup": keyboard(ann.id)}, timeout=25)
                    return True
                except Exception as exc:
                    logger.info("[Ads] photo card failed, sending text: %s", exc)
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": card_text(ann), "parse_mode": "HTML",
                                             "reply_markup": keyboard(ann.id), "disable_web_page_preview": True})
        return True
    except Exception as exc:
        logger.warning("[Ads] moderation card failed: %s", exc)
        return False


async def decide(db: AsyncSession, ann_id: int, publish: bool, reason_code: str = "other") -> tuple[str, Optional[Announcements]]:
    ann = await db.get(Announcements, ann_id)
    if not ann:
        return "Объявление уже удалено", None
    if ann.status in ("approved", "published") and publish:
        return "Уже опубликовано", ann
    if ann.status == "rejected" and not publish:
        return "Уже отклонено", ann
    was_live = ann.status in ("approved", "published")
    if publish:
        ann.status, ann.active = "approved", True
        ann.expires_at = (now() + timedelta(days=LIFETIME_DAYS)).isoformat()
        answer = "Опубликовано на сайте"
    else:
        ann.status = "rejected"
        answer = f"Отклонено: {REJECT_REASONS.get(reason_code, REJECT_REASONS['other'])}"
    await db.commit()
    await notify_author(db, ann, publish, reason_code, removed=was_live and not publish)
    return answer, ann


async def notify_author(db: AsyncSession, ann: Announcements, published: bool, reason_code: str = "other",
                        removed: bool = False) -> None:
    ann_id, user_id, phone, status = ann.id, ann.user_id, ann.phone, ann.status
    if removed:
        title = "Объявление снято с сайта"
        body = f"«{ann.title}»: {REJECT_REASONS.get(reason_code, REJECT_REASONS['other'])}. Вопросы — в WhatsApp +7 700 428 02 80."
    elif published:
        title = "Объявление опубликовано"
        body = f"«{ann.title}» уже на сайте и будет показываться {LIFETIME_DAYS} дней."
    else:
        title = "Объявление не прошло проверку"
        body = (f"«{ann.title}»: {REJECT_REASONS.get(reason_code, REJECT_REASONS['other'])}. "
                "Исправьте его в личном кабинете или подайте заново.")
    path = f"/announcements/{ann_id}" if published else "/cabinet?tab=announcements"
    try:
        if user_id:
            from services.user_notifications import notify_user_by_id
            await notify_user_by_id(db, user_id=str(user_id), category="announcements",
                                    event_key=f"ad:{ann_id}:{'ok' if published else 'no'}:{status}",
                                    title=title, body=body, path=path, entity_type="announcement", entity_id=str(ann_id))
    except Exception as exc:
        logger.info("[Ads] cabinet notice skipped: %s", exc)
    if phone:
        try:
            from services.customer_payment_notice import SERVICE_PREFIX, _whatsapp
            await _whatsapp(phone, f"{SERVICE_PREFIX} · {title}\n\n{body}\n{SITE}{path}")
        except Exception as exc:
            logger.info("[Ads] WhatsApp notice skipped: %s", exc)


async def handle_callback(db: AsyncSession, client: httpx.AsyncClient, data: str, chat_id: Any, message: dict) -> Optional[str]:
    """Telegram button tap from the owner. Returns the short answer, or None if not ours."""
    from services.news_agent import tg
    match = CALLBACK_RE.match(data or "")
    if not match:
        return None
    ann_id = int(match.group(2))
    answer, ann = await decide(db, ann_id, match.group(1) == "p", match.group(3) or "other")
    live = answer in ("Опубликовано на сайте", "Уже опубликовано")
    button = ({"text": "✅ Опубликовано — открыть", "url": f"{SITE}/announcements/{ann_id}"}
              if live
              else {"text": f"• {answer}", "callback_data": "ad:x"})
    try:
        await tg(client, "editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message.get("message_id"),
                                                    "reply_markup": {"inline_keyboard": [[button]]}})
    except Exception as exc:
        logger.info("[Ads] could not update buttons: %s", exc)
    return answer


async def report_to_owner(ann: Announcements, reason: str) -> bool:
    """A visitor complained about an ad: the owner sees it with the same buttons."""
    from services.news_agent import approval_chat, bot_token, tg
    if not (bot_token() and approval_chat()):
        return False
    text = (f"⚠️ <b>Жалоба на объявление</b>\nПричина: {html.escape(reason[:300])}\n\n" + card_text(ann)
            + f"\n\n{SITE}/announcements/{ann.id}")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": text[:4000], "parse_mode": "HTML",
                                             "disable_web_page_preview": True, "reply_markup": {"inline_keyboard": [
                                                 [{"text": "Снять с сайта", "callback_data": f"ad:r:{ann.id}:other"}]]}})
        return True
    except Exception as exc:
        logger.warning("[Ads] report failed: %s", exc)
        return False
