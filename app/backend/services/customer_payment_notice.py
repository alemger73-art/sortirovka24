"""Tell the customer that the Kaspi/Halyk invoice is waiting in the bank app.

Push / cabinet notification only: our WhatsApp number never writes first (it gets restricted for that).
Best effort: a failed notice never undoes the operator's action."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


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
