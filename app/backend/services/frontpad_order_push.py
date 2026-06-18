"""Push DAM ALEM food orders to FrontPad after checkout."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models.food_orders import Food_orders
from services.food_items import Food_itemsService
from services.frontpad_client import api_error_message, call_frontpad, get_order_secret, get_setting
from services.frontpad_settings import Frontpad_settingsService

logger = logging.getLogger(__name__)


def _auto_push_enabled() -> bool:
    raw = (os.getenv("FRONTPAD_AUTO_PUSH_ORDERS") or "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


async def push_food_order_to_frontpad(
    db: AsyncSession,
    order: Food_orders,
) -> Optional[str]:
    """Send order to FrontPad. Returns FrontPad order number or None."""
    if not _auto_push_enabled():
        return None

    settings_service = Frontpad_settingsService(db)
    order_secret = await get_order_secret(settings_service)
    if not order_secret:
        logger.info("[FrontPad] Order push skipped: no order secret")
        return None

    try:
        raw_items = order.order_items
        items = json.loads(raw_items) if isinstance(raw_items, str) else (raw_items or [])
    except (json.JSONDecodeError, TypeError):
        logger.warning("[FrontPad] Order #%s: invalid order_items JSON", order.id)
        return None

    if not isinstance(items, list) or not items:
        return None

    food_items_service = Food_itemsService(db)
    order_params: Dict[str, Any] = {
        "name": order.customer_name or "Клиент",
        "phone": order.customer_phone or "",
    }
    if order.delivery_address:
        order_params["street"] = order.delivery_address
    if order.comment:
        order_params["descr"] = order.comment

    line_idx = 0
    for raw in items:
        if not isinstance(raw, dict):
            continue
        qty = int(raw.get("quantity") or raw.get("qty") or 1)
        if qty <= 0:
            continue

        fp_product_id: Optional[str] = None
        item_id = raw.get("id")
        if item_id is not None:
            food_item = await food_items_service.get_by_id(int(item_id))
            if food_item and getattr(food_item, "frontpad_id", None):
                fp_product_id = str(food_item.frontpad_id)

        if not fp_product_id:
            fp_product_id = str(item_id) if item_id is not None else None
        if not fp_product_id:
            continue

        order_params[f"product[{line_idx}]"] = fp_product_id
        order_params[f"product_kol[{line_idx}]"] = str(qty)
        line_idx += 1

    if line_idx == 0:
        logger.warning("[FrontPad] Order #%s: no mappable products", order.id)
        return None

    affiliate_id = await get_setting(settings_service, "affiliate_id")
    if not affiliate_id:
        affiliate_id = (os.getenv("FRONTPAD_AFFILIATE_ID") or "").strip()
    if affiliate_id:
        order_params["affiliate"] = affiliate_id

    delivery_product_id = await get_setting(settings_service, "delivery_product_id")
    if not delivery_product_id:
        delivery_product_id = (os.getenv("FRONTPAD_DELIVERY_PRODUCT_ID") or "").strip()
    if delivery_product_id and (order.delivery_method or "") == "delivery":
        order_params[f"product[{line_idx}]"] = delivery_product_id
        order_params[f"product_kol[{line_idx}]"] = "1"

    try:
        result = await call_frontpad(order_secret, "new_order", order_params)
    except Exception as exc:
        logger.warning("[FrontPad] Order #%s push failed: %s", order.id, exc)
        return None

    err = api_error_message(result)
    if err:
        logger.warning("[FrontPad] Order #%s: %s", order.id, err)
        return None

    if isinstance(result, dict):
        fp_num = result.get("order_number") or result.get("order_id") or ""
        if fp_num:
            logger.info("[FrontPad] Order #%s → FrontPad #%s", order.id, fp_num)
            return str(fp_num)
    return None
