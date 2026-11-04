"""Paid «Поднять»: an ad goes to the top for 7 days after the author pays a Kaspi invoice.

While ApiPay keys are not set on the server, «Поднять» stays free as before. With keys:
1. the author taps «Поднять» → a Kaspi invoice for AD_BOOST_PRICE goes to the account's phone;
2. the author pays in Kaspi → ApiPay's signed webhook marks the payment paid → the ad is lifted
   (from now, or added to a lift still running) and the author is notified;
3. an invoice that fails (no Kaspi on that number, expired, cancelled) is reported to the author.
One open invoice per ad at a time; a repeated webhook changes nothing."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import text

from services import apipay

logger = logging.getLogger(__name__)
BOOST_DAYS = 7
OPEN = ("new", "processing", "pending")
KINDS = {"announcement": ("announcements", "/cabinet?tab=announcements"), "real_estate": ("real_estate", "/cabinet?tab=realEstate")}
_ready = False


def price() -> int:
    try:
        return max(1, int(os.getenv("AD_BOOST_PRICE", "500")))
    except ValueError:
        return 500


def paid() -> bool:
    return apipay.enabled()


def sandbox_allowed() -> bool:
    """Test payments from the ApiPay sandbox lift ads only while the server is set to test them."""
    return os.getenv("APIPAY_SANDBOX", "").strip().lower() in {"1", "true", "yes"}


def now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_table(db) -> None:
    global _ready
    if _ready:
        return
    await db.execute(text(
        "CREATE TABLE IF NOT EXISTS ad_boost_payments (id SERIAL PRIMARY KEY, kind VARCHAR(20) NOT NULL, "
        "item_id INTEGER NOT NULL, user_id VARCHAR(255) NOT NULL, phone VARCHAR(20) NOT NULL, amount INTEGER NOT NULL, "
        "status VARCHAR(20) NOT NULL DEFAULT 'new', invoice_id VARCHAR(40), error TEXT, "
        "created_at VARCHAR(40) NOT NULL, paid_at VARCHAR(40), applied_until VARCHAR(40))"))
    await db.execute(text("CREATE INDEX IF NOT EXISTS ix_ad_boost_payments_item ON ad_boost_payments (kind, item_id)"))
    await db.commit()
    _ready = True


def _order_id(payment_id: int) -> str:
    return f"boost-{payment_id}"


async def request(db, kind: str, item_id: int, user) -> dict[str, Any]:
    """Send (or repeat the reminder about) a Kaspi invoice for lifting this ad."""
    await ensure_table(db)
    if not user.phone:
        raise HTTPException(400, "Добавьте номер телефона в профиле — на него придёт счёт Kaspi")
    since = (now() - timedelta(hours=24)).isoformat()
    open_one = (await db.execute(text(
        "SELECT id, phone, amount, status FROM ad_boost_payments WHERE kind = :k AND item_id = :i "
        "AND status = ANY(:open) AND created_at > :since ORDER BY id DESC LIMIT 1"),
        {"k": kind, "i": item_id, "open": list(OPEN), "since": since})).mappings().first()
    if open_one:
        return {"status": "sent", "amount": open_one["amount"], "phone": open_one["phone"], "again": True}
    amount = price()
    payment_id = await db.scalar(text(
        "INSERT INTO ad_boost_payments (kind, item_id, user_id, phone, amount, created_at) "
        "VALUES (:k, :i, :u, :p, :a, :t) RETURNING id"),
        {"k": kind, "i": item_id, "u": str(user.id), "p": user.phone, "a": amount, "t": now().isoformat()})
    await db.commit()
    try:
        invoice = await apipay.create_invoice(phone=user.phone, amount=amount, order_id=_order_id(payment_id),
                                              description=f"Поднять объявление №{item_id} на {BOOST_DAYS} дней")
    except apipay.ApiPayError as exc:
        await db.execute(text("UPDATE ad_boost_payments SET status = 'failed', error = :e WHERE id = :id"),
                         {"e": exc.code or str(exc), "id": payment_id})
        await db.commit()
        raise HTTPException(502, str(exc)) from exc
    await db.execute(text("UPDATE ad_boost_payments SET status = :s, invoice_id = :v WHERE id = :id"),
                     {"s": str(invoice.get("status") or "processing"), "v": str(invoice.get("id") or ""), "id": payment_id})
    await db.commit()
    return {"status": "sent", "amount": amount, "phone": user.phone, "again": False}


async def _lift(db, kind: str, item_id: int) -> Optional[str]:
    table, _ = KINDS[kind]
    row = (await db.execute(text(f"SELECT promoted_until, promotion_tier FROM {table} WHERE id = :i"), {"i": item_id})).first()
    if not row:
        return None
    start = now()
    try:
        current = datetime.fromisoformat(str(row.promoted_until).replace("Z", "+00:00"))
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        if row.promotion_tier and current > start:
            start = current  # a lift still running is extended, not cut short
    except (TypeError, ValueError):
        pass
    until = (start + timedelta(days=BOOST_DAYS)).isoformat()
    tier = "vip" if row.promotion_tier == "vip" else "boost"
    await db.execute(text(f"UPDATE {table} SET promoted_until = :u, promotion_tier = :t WHERE id = :i"),
                     {"u": until, "t": tier, "i": item_id})
    return until


async def handle_webhook(db, payload: dict[str, Any]) -> str:
    """ApiPay `invoice.status_changed`. Returns what happened (for the log)."""
    if payload.get("event") != "invoice.status_changed":
        return "ignored"
    invoice = payload.get("invoice") or {}
    order_id = str(invoice.get("external_order_id") or "")
    if not order_id.startswith("boost-") or not order_id[6:].isdigit():
        return "not ours"
    await ensure_table(db)
    payment = (await db.execute(text("SELECT * FROM ad_boost_payments WHERE id = :id"), {"id": int(order_id[6:])})).mappings().first()
    if not payment:
        return "unknown"
    status = str(invoice.get("status") or "")
    if payment["status"] == "paid":
        return "already paid"
    if status == "paid":
        if int(float(invoice.get("amount") or 0)) < payment["amount"]:
            logger.warning("[Boost] payment %s: paid %s, expected %s", payment["id"], invoice.get("amount"), payment["amount"])
            return "amount mismatch"
        claimed = await db.execute(text(
            "UPDATE ad_boost_payments SET status = 'paid', paid_at = :t WHERE id = :id AND status <> 'paid'"),
            {"t": str(invoice.get("paid_at") or now().isoformat()), "id": payment["id"]})
        if not claimed.rowcount:
            return "already paid"
        until = await _lift(db, payment["kind"], payment["item_id"])
        await db.execute(text("UPDATE ad_boost_payments SET applied_until = :u WHERE id = :id"), {"u": until, "id": payment["id"]})
        await db.commit()
        day = datetime.fromisoformat(until).astimezone(timezone(timedelta(hours=5))).strftime("%d.%m") if until else ""
        await _tell(db, payment, "Оплата получена — объявление поднято",
                    f"Спасибо! Объявление №{payment['item_id']} в топе до {day}.")
        return "lifted"
    if status in ("error", "expired", "cancelled"):
        await db.execute(text("UPDATE ad_boost_payments SET status = :s, error = :e WHERE id = :id"),
                         {"s": status, "e": str(invoice.get("error_message") or "")[:300], "id": payment["id"]})
        await db.commit()
        reason = str(invoice.get("error_message") or "") if status == "error" else (
            "Счёт истёк." if status == "expired" else "Счёт отменён.")
        await _tell(db, payment, "Счёт Kaspi не оплачен",
                    f"{reason} Нажмите «Поднять» ещё раз, чтобы получить новый счёт.".strip())
        return status
    if status in OPEN:
        await db.execute(text("UPDATE ad_boost_payments SET status = :s WHERE id = :id"), {"s": status, "id": payment["id"]})
        await db.commit()
    return status or "no status"


async def _tell(db, payment, title: str, body: str) -> None:
    from services.user_notifications import notify_user_by_id
    _, path = KINDS[payment["kind"]]
    try:
        await notify_user_by_id(db, user_id=payment["user_id"], category="announcements",
                                event_key=f"boost:{payment['id']}:{title}", title=title, body=body, path=path,
                                entity_type=payment["kind"], entity_id=str(payment["item_id"]))
    except Exception as exc:
        logger.warning("[Boost] notice for payment %s failed: %s", payment["id"], exc)
