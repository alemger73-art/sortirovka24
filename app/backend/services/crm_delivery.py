"""Transactional outbox: site database -> dedicated Sheets tab -> Telegram.

No network calls in request transactions. External effects require two explicit
flags. One row per source ID, fixed Sheets row, durable independent checkpoints.
"""
import os
import time
from datetime import datetime, timezone
from urllib.parse import quote

from sqlalchemy import select
from models.crm_delivery import CrmDelivery
from core.deploy_safety import external_side_effects_allowed
from utils.phone import phone_digits

HEADERS = ["ID С24", "Источник", "Дата", "Имя", "Телефон", "WhatsApp",
           "Категория", "Описание", "Адрес", "Статус сайта", "Исполнитель ID",
           "Позвонить", "Написать WhatsApp", "2ГИС"]
CATEGORIES = {"master": "MASTERS", "become_master": "BECOME_MASTER",
              "business": "BUSINESS", "feedback": "SUPPORT"}


def enabled():
    return os.getenv("S24_CRM_ENABLED", "").lower() == "true"


def delivery_allowed():
    return enabled() and os.getenv("S24_CRM_SEND_ENABLED", "").lower() == "true" and external_side_effects_allowed()


async def enqueue(db, source, row):
    """Caller must commit source and delivery together; disabled needs no new table."""
    if not enabled():
        return
    await db.flush()
    payload = {c.name: getattr(row, c.name) for c in row.__table__.columns}
    # Store creation time for legacy models that do not supply one.
    payload["created_at"] = payload.get("created_at") or datetime.now(timezone.utc).isoformat()
    db.add(CrmDelivery(source=source, source_id=row.id, payload=payload))


def cells(event):
    p = event.payload
    phone = p.get("phone") or p.get("contact_phone") or ""
    digits = phone_digits(phone)
    wa = phone_digits(p.get("whatsapp") or phone)
    address = p.get("address") or p.get("district") or ""
    return [f"{event.source}:{event.source_id}", event.source, p.get("created_at", ""),
            p.get("name") or p.get("client_name") or p.get("contact_name") or "",
            phone, p.get("whatsapp") or phone,
            p.get("category") or p.get("activity") or p.get("section") or "",
            p.get("problem_description") or p.get("description") or "", address,
            p.get("status") or "new", str(p.get("master_id") or ""),
            f"tel:+{digits}" if digits else "", f"https://wa.me/{wa}" if wa else "",
            "https://2gis.kz/karaganda/search/" + quote(address, safe="") if address else ""]


def telegram_text(event, crm_url):
    values = cells(event)
    # Plain text avoids HTML injection; bounded fields fit Telegram's limit.
    lines = [f"Заявка С24 #{values[0]}"]
    for index in (3, 4, 6, 7, 8, 9, 10):
        if values[index]:
            lines.append(f"{HEADERS[index]}: {str(values[index])[:350]}")
    lines.extend(value for value in values[11:] if value)
    lines.append("CRM: " + crm_url)
    return "\n".join(lines)


async def deliver_one(db, sheets, telegram, now=None):
    """One checkpoint per transaction. PostgreSQL locks exclude parallel consumers."""
    now = time.time() if now is None else now
    if not delivery_allowed():
        return False
    event = (await db.execute(select(CrmDelivery).where(
        CrmDelivery.telegram_done.is_(False), CrmDelivery.dead.is_(False),
        CrmDelivery.next_attempt_at <= now,
    ).order_by(CrmDelivery.id).limit(1).with_for_update(skip_locked=True))).scalar_one_or_none()
    if event is None:
        await db.rollback()
        return False
    try:
        if not event.sheets_done:
            await sheets.write(event.id + 1, cells(event))
            event.sheets_done = True
        else:
            await telegram.send(CATEGORIES[event.source], telegram_text(event, sheets.crm_url))
            event.telegram_done = True
        event.attempts = 0
        event.last_error = None
        event.next_attempt_at = 0
    except Exception as exc:
        # Never persist/log raw exception text (tokens, URL, client data).
        event.attempts += 1
        event.last_error = type(exc).__name__[:80]
        event.dead = event.attempts >= 10
        event.next_attempt_at = now + min(3600, 30 * 2 ** min(event.attempts - 1, 7))
    await db.commit()
    return True
