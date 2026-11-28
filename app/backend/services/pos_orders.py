"""DAM ALEM site orders at the café's own till («Касса Dam Alem»).

The till pulls the site's new orders and the changes to the ones it holds (the client cancelled, an online payment came),
and pushes back what the operator did: accepted, ready, on its way, delivered, cancelled. Every push goes through the
site's own order workflow (Food_ordersService.update), so the client gets the same notices, the courier task, the
payment record and the cashback as when the order is handled in the site's own panel.
"""
from __future__ import annotations

import json
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select

from models.food_orders import Food_orders
from services.food_operations import scope
from services.food_orders import Food_ordersService
from services.pos_menu_sync import ensure_tables, item_links

ACTOR = "Касса Dam Alem"
WINDOW = timedelta(days=2)          # older open orders are not offered to the till
FINAL = ("done", "cancelled")
FLOW = ("new", "confirmed", "preparing", "ready", "in_progress", "done")
TILL_TO_SITE = {"cooking": "preparing", "ready": "ready", "on_way": "in_progress", "done": "done", "cancelled": "cancelled"}


def _number(value) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _json(value, default):
    try:
        data = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        return default
    return data if isinstance(data, type(default)) else default


def _extras(line: dict) -> str:
    """«соус сырный, без лука» — choices and modifiers the client picked, for the kitchen."""
    names = []
    for key in ("choices", "modifiers", "combo_components"):
        for part in line.get(key) or []:
            if isinstance(part, dict) and part.get("name"):
                names.append(str(part["name"]) + (f" ×{part['quantity']}" if key == "combo_components" and (part.get("quantity") or 1) > 1 else ""))
    return ", ".join(names)[:200]


def paid(order: Food_orders) -> int:
    if order.paid_amount is not None:
        return _number(order.paid_amount)
    return _number(order.total_amount) if order.payment_status == "paid" else 0


async def card(db, order: Food_orders, links: dict[int, int]) -> dict:
    """Everything the till needs to cook, deliver and charge the order — the site's own sums, unchanged."""
    lines = []
    for raw in _json(order.order_items, []):
        if not isinstance(raw, dict):
            continue
        qty = max(1, _number(raw.get("quantity")))
        line_sum = _number(raw.get("sum")) or (_number(raw.get("price")) + _number(raw.get("modTotal")) + _number(raw.get("choiceTotal"))) * qty
        lines.append({"food_item_id": raw.get("id"), "pos_item_id": links.get(raw.get("id")), "name": str(raw.get("name") or "Блюдо")[:120],
                      "qty": qty, "unit_price": line_sum // qty, "note": _extras(raw) or None,
                      "department": raw.get("department")})
    pricing = _json(order.pricing_snapshot, {})
    breakdown = pricing.get("breakdown") or {}
    tariff = pricing.get("delivery_tariff") or {}
    food = sum(l["unit_price"] * l["qty"] for l in lines)
    fee = _number(breakdown.get("delivery_fee")) + _number(breakdown.get("service_fee"))
    total = _number(order.total_amount)
    discount = food + fee - total
    if discount < 0:            # the site charged something the lines do not show: keep the total exact
        fee, discount = fee - discount, 0
    labels = [x for x in (f"промокод {pricing['promo_code']}" if pricing.get("promo_code") else "",
                          f"бонусы {_number(order.bonus_discount_amount)} ₸" if _number(order.bonus_discount_amount) else "") if x]
    return {"id": order.id, "status": order.status, "created_at": order.created_at, "scheduled_for": order.scheduled_for,
            "name": order.customer_name, "phone": order.customer_phone, "address": order.delivery_address, "comment": order.comment,
            "kind": "delivery" if order.delivery_method in ("delivery", "доставка") else "hall" if order.delivery_method == "dine_in" else "takeaway",
            "zone": (tariff.get("zone_name") or "").strip() or None, "to_door": bool(pricing.get("requested_apartment")),
            "payment_method": order.payment_method, "payment_status": order.payment_status, "paid": paid(order),
            "cash_given": _number(order.cash_given_amount) or None, "lines": lines, "delivery_fee": fee, "discount": discount,
            "discount_note": "Скидка на сайте: " + ", ".join(labels) if discount and labels else "Скидка на сайте" if discount else None,
            "total": total, "cancellation_reason": order.cancellation_reason}


async def pull(db, after_id: int, open_ids: list[int]) -> dict:
    """New site orders after the till's last one, and the current state of the site orders the till still holds."""
    from datetime import datetime, timezone
    since = (datetime.now(timezone.utc) - WINDOW).isoformat()
    dam = await scope(db)
    fresh = (await db.scalars(select(Food_orders).where(dam, Food_orders.id > after_id, Food_orders.created_at >= since,
                                                       Food_orders.status.not_in(FINAL)).order_by(Food_orders.id).limit(50))).all()
    await ensure_tables(db)
    links = {food: pos for pos, food in (await db.execute(select(item_links.c.pos_item_id, item_links.c.food_item_id))).all()}
    held = (await db.scalars(select(Food_orders).where(dam, Food_orders.id.in_(open_ids or [0])))).all()
    return {"new": [await card(db, o, links) for o in fresh],
            "changed": [{"id": o.id, "status": o.status, "payment_status": o.payment_status, "paid": paid(o),
                         "cancellation_reason": o.cancellation_reason} for o in held]}


def _path(order: Food_orders, target: str) -> list[str]:
    """The site's own steps from where the order is to where the till has it, skipping what does not apply."""
    if target == "cancelled":
        return [] if order.status in FINAL else ["cancelled"]
    here, there = FLOW.index(order.status) if order.status in FLOW else 0, FLOW.index(target)
    steps = [s for s in FLOW[here + 1:there + 1] if s != "confirmed"]
    if order.delivery_method not in ("delivery", "доставка"):
        steps = [s for s in steps if s != "in_progress"]
    return steps


async def push(db, order_id: int, till_status: str, reason: str | None = None) -> dict:
    """Moves the site order to where the till has it. Repeating the same push changes nothing."""
    target = TILL_TO_SITE.get(till_status)
    if target is None:
        raise HTTPException(422, "Неизвестный статус кассы")
    order = await db.scalar(select(Food_orders).where(Food_orders.id == order_id, await scope(db)))
    if order is None:
        raise HTTPException(404, "Заказ с сайта не найден")
    service = Food_ordersService(db)
    for step in _path(order, target):
        change = {"status": step}
        if step == "cancelled":
            change["cancellation_reason"] = (reason or "Отменён в кассе")[:500]
        order = await service.update(order.id, change, expected_version=order.version or 0, actor=ACTOR)
    return {"id": order.id, "status": order.status, "payment_status": order.payment_status}
