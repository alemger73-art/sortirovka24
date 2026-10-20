"""Tell the customer that the Kaspi/Halyk invoice is waiting in the bank app.

Push / cabinet notification always; WhatsApp from our own number when it is connected.
Best effort: a failed notice never undoes the operator's action."""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)
SERVICE_PREFIX = "🔔 Сортировка 24"  # the support bot ignores these when they echo back


def _masked(phone: str | None) -> str:
    digits = "".join(c for c in (phone or "") if c.isdigit())
    return f"+7 {digits[1:4]} ••• •• {digits[-2:]}" if len(digits) == 11 else (phone or "")


def invoice_text(order, row) -> tuple[str, str]:
    from services.dam_payment_flow import BANK_LABELS
    bank = BANK_LABELS.get(order.payment_method, "банк")
    amount = f"{int(row.amount):,}".replace(",", " ")
    phone = (row.metadata_json or {}).get("invoice_phone")
    title = f"Счёт в {bank}: {amount} ₸"
    body = (f"Заказ №{order.id}: счёт выставлен на номер {_masked(phone)}. "
            f"Откройте приложение {bank} и оплатите — после оплаты начнём готовить.")
    return title, body


async def _whatsapp(phone: str, text: str) -> None:
    from services import sms
    if not (os.getenv("WAHA_URL", "").strip() and os.getenv("WAHA_API_KEY", "").strip()):
        return
    if not await sms.refresh_waha_status():
        return
    base = os.getenv("WAHA_URL", "").rstrip("/")
    headers = {"X-Api-Key": os.getenv("WAHA_API_KEY", "").strip()}
    session = os.getenv("WAHA_SESSION", "default").strip() or "default"
    digits = "".join(c for c in phone if c.isdigit())
    async with httpx.AsyncClient(timeout=20.0) as client:
        check = await client.get(f"{base}/api/contacts/check-exists",
                                 params={"phone": digits, "session": session}, headers=headers)
        info = check.json() if check.status_code == 200 else {}
        if info.get("numberExists") is False:
            return
        r = await client.post(f"{base}/api/sendText", headers=headers,
                              json={"session": session, "chatId": info.get("chatId") or f"{digits}@c.us", "text": text})
        r.raise_for_status()


async def invoice_notice(db, order, row, *, repeat: bool = False) -> None:
    title, body = invoice_text(order, row)
    sent_at = (row.metadata_json or {}).get("invoice_sent_at") or ""
    try:
        from services.user_notifications import notify_food_order_customer
        await notify_food_order_customer(db, order_id=order.id, phone=order.customer_phone, category="food",
            event_key=f"food:invoice:{order.id}:{sent_at}", title=title, body=body,
            path=f"/cabinet/orders/food/{order.id}", entity_type="food_order", entity_id=str(order.id))
    except Exception as exc:
        logger.warning("[Invoice] push for order %s skipped: %s", order.id, exc)
    phone = (row.metadata_json or {}).get("invoice_phone") or order.customer_phone
    if phone:
        try:
            await _whatsapp(phone, f"{SERVICE_PREFIX} · {title}\n\n{body}")
        except Exception as exc:
            logger.info("[Invoice] WhatsApp for order %s skipped: %s", order.id, exc)
