"""Server-side validation for food delivery orders (DAM ALEM + marketplace)."""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from models.auth import User

from services.food_items import Food_itemsService
from services.food_restaurants import Food_restaurantsService
from services.food_settings import Food_settingsService
from services.gastronom_delivery import (
    geocode_address,
    haversine_km,
    parse_delivery_zones,
    resolve_delivery_quote,
)
from services.item_modifier_groups import Item_modifier_groupsService
from services.modifier_groups import Modifier_groupsService
from services.modifier_options import Modifier_optionsService

logger = logging.getLogger(__name__)

DEFAULT_SERVICE_FEE_RATE = 0.10
APARTMENT_DELIVERY_FEE = 300.0
VALID_PAYMENT_METHODS = frozenset({"cash", "kaspi_qr", "halyk_qr"})
CLIENT_OWNED_TRANSIENT = (
    "promo_code",
    "selected_gift_id",
    "apartment_delivery_fee",
    "deliver_to_apartment",
    "delivery_fee",
    "service_fee",
    "delivery_zone",
    "delivery_lat",
    "delivery_lng",
    "bonus_points_to_use",
)
_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})")
_KITCHEN_TZ = timezone(timedelta(hours=5))
SERVER_OWNED_FIELDS = (
    "id",
    "status",
    "payment_status",
    "user_id",
    "created_at",
    "frontpad_order_number",
    "bonus_points_used",
    "bonus_discount_amount",
)


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


def _parse_promo_codes(raw: str) -> List[Dict[str, Any]]:
    try:
        parsed = json.loads(raw or "[]")
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _parse_loyalty_gifts(settings: Dict[str, str]) -> List[Dict[str, Any]]:
    enabled = settings.get("loyalty_enabled", "1").strip().lower()
    if enabled in ("0", "false", "no", "off"):
        return []
    try:
        parsed = json.loads(settings.get("loyalty_gifts") or "[]")
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    gifts: List[Dict[str, Any]] = []
    for index, gift in enumerate(parsed):
        if not isinstance(gift, dict):
            continue
        active = gift.get("is_active", True)
        if active is False or str(active).strip().lower() in ("0", "false", "no", "off"):
            continue
        gift_id = str(gift.get("id") or "").strip()
        title = str(gift.get("title") or "").strip()
        try:
            min_amount = float(gift.get("min_amount") or 0)
        except (TypeError, ValueError):
            continue
        if not gift_id or not title or min_amount <= 0:
            continue
        gifts.append({
            "id": gift_id,
            "title": title,
            "description": str(gift.get("description") or "").strip(),
            "min_amount": min_amount,
            "sort_order": int(gift.get("sort_order") or index + 1),
        })
    if gifts:
        return gifts
    from services.dam_alem_marketing_defaults import LOYALTY_GIFTS
    return [
        {
            "id": str(gift.get("id") or f"gift-{index + 1}"),
            "title": str(gift.get("title") or ""),
            "description": str(gift.get("description") or ""),
            "min_amount": float(gift.get("min_amount") or 0),
            "sort_order": int(gift.get("sort_order") or index + 1),
        }
        for index, gift in enumerate(LOYALTY_GIFTS)
        if gift.get("is_active", True) and gift.get("title") and float(gift.get("min_amount") or 0) > 0
    ]


def _resolve_selected_gift(
    selected_gift_id: str,
    subtotal: float,
    settings: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    reached = [gift for gift in _parse_loyalty_gifts(settings) if subtotal >= gift["min_amount"]]
    if not reached:
        if selected_gift_id:
            raise HTTPException(status_code=400, detail="Подарок недоступен для этой суммы заказа")
        return None
    best_threshold = max(gift["min_amount"] for gift in reached)
    choices = [gift for gift in reached if gift["min_amount"] == best_threshold]
    if not selected_gift_id:
        if len(choices) > 1:
            raise HTTPException(status_code=400, detail="Выберите один бесплатный подарок")
        return choices[0]
    selected = next((gift for gift in choices if gift["id"] == selected_gift_id), None)
    if not selected:
        raise HTTPException(status_code=400, detail="Выбранный подарок недоступен")
    return selected


def _nonnegative_setting(settings: Dict[str, str], key: str, default: float) -> float:
    try:
        return max(0.0, float(settings.get(key) or default))
    except (TypeError, ValueError):
        return default


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


def _hm_to_minutes(value: str) -> Optional[int]:
    match = _TIME_RE.search(value or "")
    if not match:
        return None
    hours, minutes = int(match.group(1)), int(match.group(2))
    if hours > 23 or minutes > 59:
        return None
    return hours * 60 + minutes


def parse_kitchen_hours(settings: Dict[str, str]) -> Optional[Tuple[int, int, str, str]]:
    """Return (open_min, close_min, open_label, close_label) when hours are configured."""
    combined = (settings.get("working_hours") or "").strip()
    open_raw = (settings.get("kitchen_open") or "").strip()
    close_raw = (settings.get("kitchen_close") or "").strip()
    matches = _TIME_RE.findall(combined) if combined else []
    if len(matches) >= 2:
        open_raw = f"{int(matches[0][0]):02d}:{matches[0][1]}"
        close_raw = f"{int(matches[-1][0]):02d}:{matches[-1][1]}"
    if not open_raw or not close_raw:
        return None
    open_min = _hm_to_minutes(open_raw)
    close_min = _hm_to_minutes(close_raw)
    if open_min is None or close_min is None:
        return None
    open_label = f"{open_min // 60:02d}:{open_min % 60:02d}"
    close_label = f"{close_min // 60:02d}:{close_min % 60:02d}"
    return open_min, close_min, open_label, close_label


def kitchen_is_open(
    settings: Dict[str, str],
    now: Optional[datetime] = None,
) -> Tuple[bool, str, str]:
    parsed = parse_kitchen_hours(settings)
    if parsed is None:
        return True, "", ""
    open_min, close_min, open_label, close_label = parsed
    current = now or datetime.now(_KITCHEN_TZ)
    if current.tzinfo is None:
        current = current.replace(tzinfo=_KITCHEN_TZ)
    else:
        current = current.astimezone(_KITCHEN_TZ)
    cur = current.hour * 60 + current.minute
    if close_min > open_min:
        open_now = open_min <= cur < close_min
    else:
        open_now = cur >= open_min or cur < close_min
    return open_now, open_label, close_label


def assert_kitchen_open(settings: Dict[str, str], now: Optional[datetime] = None) -> None:
    open_now, opens_at, closes_at = kitchen_is_open(settings, now)
    if not open_now:
        raise HTTPException(
            status_code=400,
            detail=f"Приём заказов с {opens_at} до {closes_at}",
        )


def _truthy_flag(value: Any) -> bool:
    if value is True:
        return True
    if value is False or value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def requests_apartment_delivery(data: Dict[str, Any], delivery_address: str) -> bool:
    if _truthy_flag(data.get("deliver_to_apartment")):
        return True
    if data.get("apartment_delivery_fee") is not None:
        return True
    return "до квартиры" in (delivery_address or "").lower()


def expected_apartment_fee(
    *,
    delivery_method: str,
    subtotal: float,
    settings: Dict[str, str],
    promo_free_delivery: bool,
    requested: bool,
) -> float:
    if (delivery_method or "delivery") != "delivery" or not requested:
        return 0.0
    apartment_price = _nonnegative_setting(settings, "apartment_delivery_price", APARTMENT_DELIVERY_FEE)
    apartment_free_from = _nonnegative_setting(
        settings,
        "apartment_free_from",
        _nonnegative_setting(settings, "free_delivery_from", 0.0),
    )
    if promo_free_delivery or (apartment_free_from > 0 and subtotal >= apartment_free_from):
        return 0.0
    return apartment_price


def _resolve_promo(
    code: str,
    subtotal: float,
    settings: Dict[str, str],
) -> Tuple[float, bool]:
    """Return (discount, free_delivery) for a promo code."""
    promos = _parse_promo_codes(settings.get("promo_codes") or "[]")
    if not promos:
        from services.dam_alem_marketing_defaults import PROMO_CODES
        promos = list(PROMO_CODES)
    matched = None
    for promo in promos:
        if not promo or not isinstance(promo, dict):
            continue
        if str(promo.get("code", "")).strip().upper() != code.strip().upper():
            continue
        if promo.get("active") is False or str(promo.get("active", "")).lower() in ("0", "false"):
            continue
        matched = promo
        break
    if not matched:
        raise HTTPException(status_code=400, detail="Промокод не найден или недействителен")

    today = date.today().isoformat()
    valid_from = str(matched.get("valid_from") or "").strip()
    valid_until = str(matched.get("valid_until") or "").strip()
    if valid_from and today < valid_from:
        raise HTTPException(status_code=400, detail=f"Промокод начнёт действовать {valid_from}")
    if valid_until and today > valid_until:
        raise HTTPException(status_code=400, detail="Срок действия промокода закончился")

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
    discount = round(subtotal * (pct / 100.0))
    try:
        max_discount = max(0.0, float(matched.get("max_discount") or 0))
    except (TypeError, ValueError):
        max_discount = 0.0
    if max_discount > 0:
        discount = min(discount, max_discount)
    return discount, False


def _parse_coord(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fallback_delivery_price(settings: Dict[str, str]) -> float:
    try:
        return float(settings.get("delivery_price") or settings.get("delivery_fee") or 0)
    except (TypeError, ValueError):
        return 0.0


_DELIVERY_NOTE_RE = re.compile(r"\s*\((?:до квартиры|до подъезда)\)\s*$", re.IGNORECASE)
_APT_SUFFIX_RE = re.compile(r",?\s*кв\.?\s*.*$", re.IGNORECASE)
_CLIENT_GEOCODE_MAX_KM = 2.0


def _address_for_geocode(address: str) -> str:
    """Strip apartment / handoff notes so Nominatim can resolve the street point."""
    q = (address or "").strip()
    q = _DELIVERY_NOTE_RE.sub("", q)
    q = _APT_SUFFIX_RE.sub("", q)
    return q.strip(" ,")


def _requires_priced_food_checkout(settings: Dict[str, str]) -> bool:
    """True when food settings imply zone/service/delivery pricing (DAM ALEM path).

    Legacy marketplace carts omit fee hints and pay only catalog subtotal.
    They must not inherit this path when priced food settings are configured.
    """
    if parse_delivery_zones(settings):
        return True
    if _service_fee_rate(settings) > 0:
        return True
    if _fallback_delivery_price(settings) > 0:
        return True
    return False


async def _resolve_trusted_delivery_coords(
    settings: Dict[str, str],
    delivery_address: str,
    client_lat: Optional[float],
    client_lng: Optional[float],
    *,
    require_server_geocode: bool,
) -> Tuple[Optional[float], Optional[float]]:
    """Prefer server geocode of the address over client-supplied lat/lng."""
    cleaned = _address_for_geocode(delivery_address)
    geocoded: Optional[Tuple[float, float]] = None
    if len(cleaned) >= 5:
        geocoded = await geocode_address(cleaned, settings=settings)

    if geocoded:
        g_lat, g_lng = geocoded
        if client_lat is not None and client_lng is not None:
            drift = haversine_km(g_lat, g_lng, client_lat, client_lng)
            if drift > _CLIENT_GEOCODE_MAX_KM:
                logger.warning(
                    "Client delivery coords diverge from geocoded address by %.1f km; using geocode",
                    drift,
                )
        return g_lat, g_lng

    if require_server_geocode:
        raise HTTPException(
            status_code=400,
            detail=(
                "Не удалось проверить адрес доставки. "
                "Укажите адрес через «Найти на карте» или «Я здесь сейчас»."
            ),
        )
    return client_lat, client_lng


def _server_delivery_fee(
    delivery_method: str,
    settings: Dict[str, str],
    lat: Optional[float],
    lng: Optional[float],
    *,
    marketplace_no_fee_hints: bool,
) -> float:
    """Price delivery from server settings / polygons. Never from client zone name."""
    if (delivery_method or "delivery") != "delivery":
        return 0.0

    polygon_zones = parse_delivery_zones(settings)
    if polygon_zones:
        if lat is None or lng is None:
            raise HTTPException(
                status_code=400,
                detail="Не удалось определить зону доставки. Укажите адрес на карте или «Я здесь сейчас».",
            )
        quote = resolve_delivery_quote(settings, lat, lng)
        if not quote.get("available"):
            raise HTTPException(
                status_code=400,
                detail=str(quote.get("message") or "Доставка по этому адресу недоступна"),
            )
        try:
            return float(quote.get("delivery_fee") or 0)
        except (TypeError, ValueError):
            return 0.0

    if marketplace_no_fee_hints:
        return 0.0
    return _fallback_delivery_price(settings)


def _account_user_id(account_user: Optional["User"]) -> Optional[int]:
    if account_user is None:
        return None
    raw = getattr(account_user, "id", None)
    if raw is None:
        return None
    text = str(raw).strip()
    if text.isdigit():
        return int(text)
    return None


def _server_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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
    _ = zone_name
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

    group_svc = Modifier_groupsService(db)
    group_res = await group_svc.get_list(skip=0, limit=1000, query_dict=None, sort="sort_order")
    modifier_groups_by_id = {
        int(group.id): group
        for group in group_res["items"]
        if group.id is not None and group.is_active is not False
    }

    links_svc = Item_modifier_groupsService(db)
    links_res = await links_svc.get_list(skip=0, limit=5000, query_dict=None, sort="id")
    groups_by_item: Dict[int, set[int]] = {}
    for link in links_res["items"]:
        item_id = getattr(link, "food_item_id", None)
        group_id = getattr(link, "modifier_group_id", None)
        if item_id is None or group_id is None:
            continue
        groups_by_item.setdefault(int(item_id), set()).add(int(group_id))

    set_svc = Food_settingsService(db)
    set_res = await set_svc.get_list(skip=0, limit=100, query_dict=None, sort="id")
    settings = _parse_settings(set_res["items"])
    assert_kitchen_open(settings)

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
            qty_number = float(qty)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Некорректное количество")
        if not qty_number.is_integer():
            raise HTTPException(status_code=400, detail="Количество должно быть целым числом")
        qty_int = int(qty_number)
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
        allowed_groups = groups_by_item.get(int(product.id), set())
        selected_by_group: Dict[int, int] = {}
        seen_option_ids: set[int] = set()
        for mod in raw.get("modifiers") or []:
            if not isinstance(mod, dict):
                raise HTTPException(status_code=400, detail=f"Некорректная опция для «{product.name}»")
            opt_id = mod.get("option_id") if mod.get("option_id") is not None else mod.get("id")
            if opt_id is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Некорректная опция для «{product.name}»",
                )
            try:
                option_id = int(opt_id)
                opt = options_by_id.get(option_id)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail=f"Некорректная опция для «{product.name}»",
                )
            if not opt or opt.is_active is False:
                raise HTTPException(
                    status_code=400,
                    detail=f"Опция недоступна для «{product.name}»",
                )
            if option_id in seen_option_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Опция «{opt.name}» выбрана повторно",
                )
            seen_option_ids.add(option_id)
            group_id = getattr(opt, "group_id", None)
            if group_id is None or int(group_id) not in allowed_groups:
                raise HTTPException(
                    status_code=400,
                    detail=f"Опция не относится к блюду «{product.name}»",
                )
            selected_by_group[int(group_id)] = selected_by_group.get(int(group_id), 0) + 1
            price = float(opt.price or 0)
            mod_total += price
            validated_mods.append({
                "name": opt.name or "",
                "price": price,
                "option_id": opt.id,
            })

        for group_id in allowed_groups:
            group = modifier_groups_by_id.get(group_id)
            if not group:
                continue
            selected_count = selected_by_group.get(group_id, 0)
            min_select = max(
                int(getattr(group, "min_select", 0) or 0),
                1 if getattr(group, "is_required", False) else 0,
            )
            max_select = int(getattr(group, "max_select", 0) or 0)
            if str(getattr(group, "type", "") or "").strip().lower() in ("single", "radio"):
                max_select = 1
            if selected_count < min_select:
                raise HTTPException(
                    status_code=400,
                    detail=f"Для «{product.name}» выберите: {group.name}",
                )
            if max_select > 0 and selected_count > max_select:
                raise HTTPException(
                    status_code=400,
                    detail=f"Для «{product.name}» можно выбрать максимум {max_select}: {group.name}",
                )

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
    selected_gift = _resolve_selected_gift(
        str(data.get("selected_gift_id") or "").strip(),
        subtotal,
        settings,
    )

    requires_priced_checkout = _requires_priced_food_checkout(settings)
    # Legacy marketplace: no fee hints AND no priced food settings.
    # Omitting fee hints must NOT zero delivery when DAM ALEM / zone pricing is on.
    marketplace_no_fee_hints = (
        delivery_fee_hint is None
        and service_fee_hint is None
        and not requires_priced_checkout
    )

    fee_rate = _service_fee_rate(settings)
    if service_fee_hint is not None or requires_priced_checkout:
        expected_service = round(subtotal * fee_rate)
        if service_fee_hint is not None and abs(float(service_fee_hint) - expected_service) > 1:
            raise HTTPException(status_code=400, detail="Сервисный сбор не совпадает. Обновите страницу")
    else:
        expected_service = 0

    client_lat = _parse_coord(data.get("delivery_lat"))
    client_lng = _parse_coord(data.get("delivery_lng"))
    lat, lng = client_lat, client_lng
    if delivery_method == "delivery" and parse_delivery_zones(settings):
        lat, lng = await _resolve_trusted_delivery_coords(
            settings,
            delivery_address,
            client_lat,
            client_lng,
            require_server_geocode=not marketplace_no_fee_hints,
        )

    delivery_fee = _server_delivery_fee(
        delivery_method,
        settings,
        lat,
        lng,
        marketplace_no_fee_hints=marketplace_no_fee_hints,
    )
    delivery_fee = _apply_free_delivery_threshold(subtotal, delivery_fee, settings)

    promo_code = (data.get("promo_code") or "").strip().upper()
    promo_discount = 0.0
    promo_free_delivery = False
    if promo_code:
        promo_discount, promo_free_delivery = _resolve_promo(promo_code, subtotal, settings)
        if promo_free_delivery:
            delivery_fee = 0.0

    requested_apartment = requests_apartment_delivery(data, delivery_address)
    apartment_fee = expected_apartment_fee(
        delivery_method=delivery_method,
        subtotal=subtotal,
        settings=settings,
        promo_free_delivery=promo_free_delivery,
        requested=requested_apartment,
    )
    if requested_apartment and delivery_method == "delivery":
        apt_hint = data.get("apartment_delivery_fee")
        if apt_hint is not None:
            try:
                hinted_apartment = float(apt_hint)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Некорректная доплата за доставку до квартиры")
            if abs(hinted_apartment - apartment_fee) > 1:
                raise HTTPException(status_code=400, detail="Доплата до квартиры изменилась. Обновите страницу")

    if delivery_fee_hint is not None and delivery_method == "delivery":
        if abs(float(delivery_fee_hint) - delivery_fee) > 1:
            raise HTTPException(status_code=400, detail="Стоимость доставки не совпадает")

    expected_total = round(subtotal + expected_service + delivery_fee + apartment_fee - promo_discount, 2)
    expected_total = max(0.0, expected_total)
    client_total = round(float(data.get("total_amount") or 0), 2)

    # Legacy marketplace checkout omits service/delivery line items (total == subtotal).
    if marketplace_no_fee_hints and abs(client_total - subtotal) <= 1:
        expected_total = subtotal
        expected_service = 0
        delivery_fee = 0

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
        logger.warning(
            "Order total mismatch: expected=%s client=%s subtotal=%s service=%s delivery=%s bonus=%s",
            expected_total,
            client_total,
            subtotal,
            expected_service,
            delivery_fee,
            bonus_discount,
        )
        if bonus_discount > 0:
            raise HTTPException(status_code=400, detail="Сумма заказа с бонусами не совпадает")
        raise HTTPException(status_code=400, detail="Сумма заказа не совпадает с каталогом")

    payment_method = (data.get("payment_method") or "cash").strip()
    if payment_method not in VALID_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Некорректный способ оплаты")

    sanitized = dict(data)
    for transient_key in CLIENT_OWNED_TRANSIENT:
        sanitized.pop(transient_key, None)
    for owned_key in SERVER_OWNED_FIELDS:
        sanitized.pop(owned_key, None)
    sanitized["payment_method"] = payment_method
    sanitized["payment_status"] = "pending" if payment_method == "cash" else "awaiting_qr_payment"
    sanitized["status"] = "new"
    sanitized["user_id"] = _account_user_id(account_user)
    sanitized["created_at"] = _server_now()
    if selected_gift:
        validated_items.append({
            "id": f"gift:{selected_gift['id']}",
            "name": selected_gift["title"],
            "price": 0,
            "quantity": 1,
            "modifiers": [],
            "modTotal": 0,
            "sum": 0,
            "is_gift": True,
            "gift_id": selected_gift["id"],
            "gift_threshold": selected_gift["min_amount"],
        })
    sanitized["order_items"] = json.dumps(validated_items, ensure_ascii=False)
    sanitized["total_amount"] = expected_total
    sanitized["promo_discount_amount"] = promo_discount
    if bonus_points_used > 0:
        sanitized["bonus_points_used"] = bonus_points_used
        sanitized["bonus_discount_amount"] = bonus_discount
    return sanitized, validated_items, expected_total
