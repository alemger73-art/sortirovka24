"""A few days before an ad's 30 days run out, its author is told once — in the cabinet and by push
(never WhatsApp: our number does not write first) — and can extend it with one tap in the cabinet. Extending moves the end date, so the next
period gets its own reminder. Reminders go out in the daytime only."""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from models.announcements import Announcements

logger = logging.getLogger(__name__)
REMIND_DAYS = 3
TZ = ZoneInfo("Asia/Almaty")
DAY_HOURS = range(10, 21)  # WhatsApp to people only between 10:00 and 21:00
PATH = "/cabinet?tab=announcements"


def _parse(value: Optional[str]) -> Optional[datetime]:
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


async def ensure_table(db) -> None:
    await db.execute(text("CREATE TABLE IF NOT EXISTS ad_expiry_reminders (ad_id INTEGER NOT NULL, "
                          "expires_at VARCHAR(40) NOT NULL, sent_at VARCHAR(40) NOT NULL, PRIMARY KEY (ad_id, expires_at))"))
    await db.commit()


def reminder_text(title: str, ends: datetime) -> tuple[str, str]:
    day = ends.astimezone(TZ).strftime("%d.%m")
    return ("Объявление скоро снимется",
            f"«{title}» будет на сайте до {day}. Продлить ещё на 30 дней можно одной кнопкой в личном кабинете.")


async def remind_expiring(db, now: Optional[datetime] = None) -> int:
    """Remind authors whose published ads end within REMIND_DAYS. Returns how many were reminded."""
    from services.user_notifications import notify_user_by_id, notify_user_by_phone
    now = now or datetime.now(timezone.utc)
    await ensure_table(db)
    rows = (await db.execute(select(Announcements).where(
        Announcements.status.in_(("approved", "published")), Announcements.active.is_not(False)))).scalars().all()
    sent = 0
    for ad in rows:
        ends = _parse(ad.expires_at)
        if not ends or not now < ends <= now + timedelta(days=REMIND_DAYS) or not (ad.user_id or ad.phone):
            continue
        claimed = await db.execute(text(
            "INSERT INTO ad_expiry_reminders (ad_id, expires_at, sent_at) VALUES (:a, :e, :t) ON CONFLICT DO NOTHING"),
            {"a": ad.id, "e": str(ad.expires_at), "t": now.isoformat()})
        await db.commit()
        if not claimed.rowcount:  # already reminded for this end date
            continue
        title, body = reminder_text(ad.title or "Объявление", ends)
        notice = dict(category="announcements", event_key=f"ad:{ad.id}:expiring:{ad.expires_at}",
                      title=title, body=body, path=PATH, entity_type="announcement", entity_id=str(ad.id))
        if ad.user_id:  # cabinet + push only: our WhatsApp number never writes first
            await notify_user_by_id(db, user_id=ad.user_id, **notice)
        else:
            await notify_user_by_phone(db, phone=ad.phone, **notice)
        sent += 1
    return sent


async def run_forever(session_maker) -> None:
    """Every hour in the daytime."""
    if os.getenv("AD_EXPIRY_REMINDERS", "1").strip().lower() in {"0", "false", "no", "off"}:
        return
    await asyncio.sleep(60)
    while True:
        try:
            if datetime.now(TZ).hour in DAY_HOURS:
                async with session_maker() as db:
                    count = await remind_expiring(db)
                    if count:
                        logger.info("[Ads] expiry reminders sent: %s", count)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("[Ads] expiry reminders failed: %s", exc)
        await asyncio.sleep(3600)
