"""Loyalty gifts for ГАСТРАНОМ — free gifts by order subtotal tiers."""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional


def _parse_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def is_loyalty_enabled(settings: Dict[str, str]) -> bool:
    raw = (settings.get("loyalty_enabled") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def parse_loyalty_gifts(settings: Dict[str, str]) -> List[Dict[str, Any]]:
    raw = settings.get("loyalty_gifts") or "[]"
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []

    gifts: List[Dict[str, Any]] = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        min_amount = _parse_float(item.get("min_amount"), 0)
        if min_amount <= 0:
            continue
        gifts.append({
            "id": str(item.get("id") or f"gift-{idx + 1}"),
            "min_amount": min_amount,
            "title": title,
            "description": str(item.get("description") or "").strip(),
            "image_url": str(item.get("image_url") or "").strip(),
            "is_active": item.get("is_active") is not False,
            "sort_order": int(item.get("sort_order") or idx + 1),
        })

    gifts.sort(key=lambda g: (g["min_amount"], g["sort_order"]))
    return gifts


def resolve_loyalty_gift(
    subtotal: float,
    settings: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    """Best active gift tier reached by cart subtotal (products only, no delivery)."""
    if not is_loyalty_enabled(settings):
        return None
    gifts = [g for g in parse_loyalty_gifts(settings) if g.get("is_active")]
    if not gifts:
        return None
    matched: Optional[Dict[str, Any]] = None
    for gift in gifts:
        if subtotal >= gift["min_amount"]:
            matched = gift
    return matched


def next_loyalty_gift(
    subtotal: float,
    settings: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    if not is_loyalty_enabled(settings):
        return None
    gifts = [g for g in parse_loyalty_gifts(settings) if g.get("is_active")]
    for gift in gifts:
        if subtotal < gift["min_amount"]:
            return gift
    return None


def gift_order_line(gift: Dict[str, Any]) -> Dict[str, Any]:
    min_amount = int(gift["min_amount"])
    title = gift["title"]
    return {
        "id": None,
        "name": f"🎁 Подарок: {title}",
        "weight": "",
        "qty": 1,
        "price": 0,
        "sum": 0,
        "is_gift": True,
        "gift_id": gift.get("id"),
        "gift_min_amount": min_amount,
    }


def gift_comment_line(gift: Dict[str, Any]) -> str:
    min_amount = int(gift["min_amount"])
    return f"Подарок: {gift['title']} (от {min_amount:,} ₸)".replace(",", " ")


def default_loyalty_gifts_json() -> str:
    gifts = [
        {
            "id": str(uuid.uuid4()),
            "min_amount": 5000,
            "title": "Ручка с логотипом",
            "description": "Фирменная ручка в подарок",
            "image_url": "",
            "is_active": True,
            "sort_order": 1,
        },
        {
            "id": str(uuid.uuid4()),
            "min_amount": 10000,
            "title": "Чупа-чупс",
            "description": "Сладкий подарок к заказу",
            "image_url": "",
            "is_active": True,
            "sort_order": 2,
        },
        {
            "id": str(uuid.uuid4()),
            "min_amount": 15000,
            "title": "Набор сладостей",
            "description": "Несколько сладостей в подарок",
            "image_url": "",
            "is_active": True,
            "sort_order": 3,
        },
    ]
    return json.dumps(gifts, ensure_ascii=False)
