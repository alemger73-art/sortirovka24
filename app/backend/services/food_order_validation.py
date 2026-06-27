"""Server-side validation for food delivery orders (DAM ALEM + marketplace)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from models.auth import User

from services.food_items import Food_itemsService
from services.food_restaurants import Food_restaurantsService
from services.food_settings import Food_settingsService
from services.modifier_options import Modifier_optionsService

logger = logging.getLogger(__name__)

DEFAULT_SERVICE_FEE_RATE = 0.10
APARTMENT_DELIVERY_FEE = 300.0
VALID_PAYMENT_METHODS = frozenset({"cash", "kaspi_qr", "halyk_qr"})


def _normalize_phone(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def _parse_settings(rows: list) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for row in rows:
        key = getattr(row, "setting_key", None)
        val = getattr(row, "setting_value", None)
        if key:
            out[str(key)] = str(val) if val is not None else ""
    return out


def _service_fee_rate(settings: Dict[str, str]) -> float:
    raw = settings.get("service_fee_rate", "").strip()
    if not raw:
        return DEFAULT_SERVICE_FEE_RATE
    try:
        val = float(raw)
        if val > 1:
            return val / 100.0
        return max(0.0, min(val, 1.0))
    except ValueError:
        return DEFAULT_SERVICE_FEE_RATE


def _parse_zones(settings: Dict[str, str]) -> List[Dict[str, Any]]:
    try:
        parsed = json.loads(settings.get("delivery_zones") or "[]")
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def _parse_promo_codes(raw: str) -> List[Dict[str, Any]]:
    try:
        parsed = json.loads(raw or "[]")
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _apply_free_delivery_threshold(
    subtotal: float,
    delivery_fee: float,
    settings: Dict[str, str],
) -> float:
    try:
        free_from = float(settings.get("free_delivery_from") or 0)
    except (TypeError, ValueError):
        free_from = 0.0
    if free_from > 0 and subtotal >= free_from:
        return 0.0
    return delivery_fee


def _resolve_promo(
    code: str,
    subtotal: float,
    settings: Dict[str, str],
) -> Tuple[float, bool]:
    """Return (discount, free_delivery) for a promo code."""
    promos = _parse_promo_codes(settings.get("promo_codes") or "[]")
    matched = None
    for promo in promos:
        if not promo or not isinstance(promo, dict):
            continue
        if str(promo.get("code", "")).strip().upper() != code:
            continue
        if promo.get("active") is False or str(promo.get("active", "")).lower() in ("0", "false"):
            continue
        matched = promo
        break
    if not matched:
        raise HTTPException(status_code=400, detail="Промокод не найден или недействителен")

    min_order = float(matched.get("min_order") or 0)
    if min_order > 0 and subtotal < min_order:
        raise HTTPException(
            status_code=400,
            detail=f"Промокод действует от {int(min_order):,} ₸".replace(",", " "),
        )

    ptype = str(matched.get("type") or "percent")
    value = float(matched.get("value") or 0)
    if ptype == "free_delivery":
        return 0.0, True
    if ptype == "fixed":
        return min(subtotal, value), False
    pct = max(0.0, min(100.0, value))
    return round(subtotal * (pct / 100.0)), False


def _resolve_delivery_fee(
    delivery_method: str,
    settings: Dict[str, str],
    delivery_fee_hint: Optional[float],
    zone_name: Optional[str],
) -> float:
    if (delivery_method or "delivery") != "delivery":
        return 0.0
    zones = _parse_zones(settings)
    if zone_name and zones:
        for z in zones:
            if isinstance(z, dict) and z.get("name") == zone_name:
                try:
                    return float(z.get("price") or 0)
                except (TypeError, ValueError):
                    pass
    if delivery_fee_hint is not None:
        try:
            fee = float(delivery_fee_hint)
            if fee >= 0:
                if zones:
                    allowed = {float(z.get("price", 0)) for z in zones if isinstance(z, dict)}
                    base = float(settings.get("delivery_price") or 0)
                    if fee in allowed or (base and fee == base):
                        return fee
                else:
                    return fee
        except (TypeError, ValueError):
            pass
    try:
        return float(settings.get("delivery_price") or 0)
    except ValueError:
        return 0.0


async def validate_food_order(
    db: AsyncSession,
    data: Dict[str, Any],
    *,
    delivery_fee_hint: Optional[float] = None,
    service_fee_hint: Optional[float] = None,
    zone_name: Optional[str] = None,
    account_user: Optional["User"] = None,
    bonus_points_to_use: Optional[float] = None,
) -> Tuple[Dict[str, Any], List[dict], float]:
    """
    Validate order payload against catalog and settings.
    Returns (sanitized_data, validated_items, expected_total).
    """
    customer_name = (data.get("customer_name") or "").strip()
    customer_phone = (data.get("customer_phone") or "").strip()
    delivery_method = (data.get("delivery_method") or "delivery").strip()
    delivery_address = (data.get("delivery_address") or "").strip()

    if not customer_name:
        raise HTTPException(status_code=400, detail="Укажите имя")
    if len(_normalize_phone(customer_phone)) < 10:
        raise HTTPException(status_code=400, detail="Некорректный номер телефона")
    if delivery_method == "delivery" and not delivery_address:
        raise HTTPException(status_code=400, detail="Укажите адрес доставки")

    try:
        raw_items = json.loads(data.get("order_items") or "[]")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Некорректный состав заказа")
    if not isinstance(raw_items, list) or len(raw_items) == 0:
        raise HTTPException(status_code=400, detail="Корзина пуста")

    items_svc = Food_itemsService(db)
    items_res = await items_svc.get_list(skip=0, limit=3000, query_dict=None, sort="sort_order")
    products_by_id: Dict[int, Any] = {
        int(p.id): p for p in items_res["items"] if p.id is not None
    }

    mod_svc = Modifier_optionsService(db)
    mod_res = await mod_svc.get_list(skip=0, limit=2000, query_dict=None, sort="sort_order")
    options_by_id = {int(o.id): o for o in mod_res["items"] if o.id is not None}
    options_by_name: Dict[str, Any] = {}
    for o in mod_res["items"]:
        name = (o.name or "").strip().lower()
        if name:
            options_by_name[name] = o

    set_svc = Food_settingsService(db)
    set_res = await set_svc.get_list(skip=0, limit=100, query_dict=None, sort="id")
    settings = _parse_settings(set_res["items"])

    restaurant_id = data.get("restaurant_id")
    min_order = 0.0
    if restaurant_id:
        rest_svc = Food_restaurantsService(db)
        rest = await rest_svc.get_by_id(int(restaurant_id))
        if rest and rest.min_order is not None:
            min_order = float(rest.min_order)
    if min_order <= 0:
        try:
            min_order = float(settings.get("min_order_amount") or 0)
        except ValueError:
            min_order = 0.0

    validated_items: List[dict] = []
    subtotal = 0.0

    for raw in raw_items:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="Некорректный товар в заказе")

        qty = raw.get("quantity")
        if qty is None:
            qty = raw.get("qty")
        try:
            qty_int = int(qty)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Некорректное количество")
        if qty_int <= 0:
            raise HTTPException(status_code=400, detail="Некорректное количество")

        product = None
        prod_id = raw.get("id")
        if prod_id is not None:
            product = products_by_id.get(int(prod_id))
        if not product:
            name_key = (raw.get("name") or "").strip().lower()
            for p in products_by_id.values():
                if (p.name or "").strip().lower() == name_key:
                    product = p
                    break
        if not product or product.is_active is False or getattr(product, "available", None) is False:
            label = raw.get("name") or prod_id or "?"
            raise HTTPException(status_code=400, detail=f"Блюдо «{label}» недоступно")

        if restaurant_id and getattr(product, "restaurant_id", None) not in (None, int(restaurant_id)):
            raise HTTPException(status_code=400, detail=f"Блюдо «{product.name}» не относится к выбранному ресторану")

        base_price = float(product.price or 0)
        client_price = float(raw.get("price") or base_price)
        if abs(client_price - base_price) > 0.01:
            raise HTTPException(status_code=400, detail=f"Цена «{product.name}» изменилась. Обновите страницу")

        mod_total = 0.0
        validated_mods: List[dict] = []
        for mod in raw.get("modifiers") or []:
            if not isinstance(mod, dict):
                continue
            opt_id = mod.get("option_id") or mod.get("id")
            opt = options_by_id.get(int(opt_id)) if opt_id is not None else None
            if not opt:
                name = (mod.get("name") or "").strip().lower()
                opt = options_by_name.get(name)
            if opt and opt.is_active is not False:
                price = float(opt.price or 0)
            else:
                price = float(mod.get("price") or 0)
            mod_total += price
            validated_mods.append({
                "name": (opt.name if opt else mod.get("name")) or "",
                "price": price,
                "option_id": opt.id if opt else opt_id,
            })

        client_mod_total = float(raw.get("modTotal") or raw.get("mod_total") or 0)
        if abs(client_mod_total - mod_total) > 0.02:
            raise HTTPException(status_code=400, detail=f"Доплата за опции «{product.name}» не совпадает")

        line_sum = round((base_price + mod_total) * qty_int, 2)
        subtotal += line_sum
        validated_items.append({
            "id": product.id,
            "name": product.name,
            "price": base_price,
            "quantity": qty_int,
            "modifiers": validated_mods,
            "modTotal": mod_total,
            "sum": line_sum,
        })

    subtotal = round(subtotal, 2)
    if min_order > 0 and subtotal < min_order:
        raise HTTPException(status_code=400, detail=f"Минимальный заказ {int(min_order)} ₸")

    fee_rate = _service_fee_rate(settings)
    expected_service = round(subtotal * fee_rate) if service_fee_hint is not None else 0
    if service_fee_hint is not None and abs(float(service_fee_hint) - round(subtotal * fee_rate)) > 1:
        raise HTTPException(status_code=400, detail="Сервисный сбор не совпадает. Обновите страницу")
    if service_fee_hint is not None:
        expected_service = round(subtotal * fee_rate)

    delivery_fee = _resolve_delivery_fee(
        delivery_method, settings, delivery_fee_hint, zone_name
    )
    delivery_fee = _apply_free_delivery_threshold(subtotal, delivery_fee, settings)

    promo_code = (data.get("promo_code") or "").strip().upper()
    promo_discount = 0.0
    if promo_code:
        promo_discount, promo_free_delivery = _resolve_promo(promo_code, subtotal, settings)
        if promo_free_delivery:
            delivery_fee = 0.0

    apartment_fee = 0.0
    if delivery_method == "delivery":
        apt_hint = data.get("apartment_delivery_fee")
        if apt_hint is not None:
            try:
                apartment_fee = float(apt_hint)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Некорректная доплата за доставку до квартиры")
            if apartment_fee not in (0.0, APARTMENT_DELIVERY_FEE):
                raise HTTPException(status_code=400, detail="Некорректная доплата за доставку до квартиры")

    if delivery_fee_hint is not None and delivery_method == "delivery":
        if abs(float(delivery_fee_hint) - delivery_fee) > 1:
            raise HTTPException(status_code=400, detail="Стоимость доставки не совпадает")

    expected_total = round(subtotal + expected_service + delivery_fee + apartment_fee - promo_discount, 2)
    expected_total = max(0.0, expected_total)
    client_total = round(float(data.get("total_amount") or 0), 2)

    # Marketplace checkout: total may equal subtotal only (no service/delivery line items sent).
    if service_fee_hint is None and delivery_fee_hint is None and abs(client_total - subtotal) <= 1:
        expected_total = subtotal
        expected_service = 0
        delivery_fee = 0

    if abs(expected_total - client_total) > 1:
        logger.warning(
            "Order total mismatch: expected=%s client=%s subtotal=%s service=%s delivery=%s",
            expected_total, client_total, subtotal, expected_service, delivery_fee,
        )
        raise HTTPException(status_code=400, detail="Сумма заказа не совпадает с каталогом")

    bonus_points_used = 0.0
    bonus_discount = 0.0
    requested_bonus = float(bonus_points_to_use or 0)
    if requested_bonus > 0:
        from services.bonus_spending import _phones_match, calculate_bonus_discount

        if not account_user:
            raise HTTPException(status_code=401, detail="Войдите в аккаунт, чтобы списать бонусы")
        if not _phones_match(account_user.phone, customer_phone):
            raise HTTPException(status_code=400, detail="Телефон заказа должен совпадать с аккаунтом")
        bonus_points_used, bonus_discount = calculate_bonus_discount(
            user=account_user,
            subtotal=subtotal,
            total_before_bonus=expected_total,
            bonus_points_requested=requested_bonus,
            has_promo=bool(promo_code),
        )
        expected_total = round(max(0.0, expected_total - bonus_discount), 2)
        if abs(expected_total - client_total) > 1:
            raise HTTPException(status_code=400, detail="Сумма заказа с бонусами не совпадает")

    payment_method = (data.get("payment_method") or "cash").strip()
    if payment_method not in VALID_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Некорректный способ оплаты")

    sanitized = dict(data)
    for transient_key in (
        "promo_code",
        "apartment_delivery_fee",
        "delivery_fee",
        "service_fee",
        "delivery_zone",
        "bonus_points_to_use",
    ):
        sanitized.pop(transient_key, None)
    sanitized["payment_method"] = payment_method
    if not sanitized.get("payment_status"):
        sanitized["payment_status"] = "pending" if payment_method == "cash" else "awaiting_qr_payment"
    sanitized["order_items"] = json.dumps(validated_items, ensure_ascii=False)
    sanitized["total_amount"] = expected_total
    if bonus_points_used > 0:
        sanitized["bonus_points_used"] = bonus_points_used
        sanitized["bonus_discount_amount"] = bonus_discount
    return sanitized, validated_items, expected_total
