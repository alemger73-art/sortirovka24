"""Public DAM ALEM / food delivery API — zones on map, geocoding, free delivery threshold."""

from __future__ import annotations

from typing import Optional

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.food_settings import Food_settingsService
from services.gastronom_delivery import (
    DEFAULT_STORE_LAT,
    DEFAULT_STORE_LNG,
    enrich_quote_with_location,
    geocode_address,
    resolve_delivery_quote,
    reverse_geocode,
)
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/food", tags=["food-store"])


class DeliveryQuoteRequest(BaseModel):
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    cart_subtotal: Optional[float] = None


def _normalize_food_delivery_settings(raw: dict[str, str]) -> dict[str, str]:
    """Map food_settings keys to the shape expected by gastronom_delivery helpers."""
    return {
        **raw,
        "delivery_fee": raw.get("delivery_fee") or raw.get("delivery_price") or "0",
        "min_order": raw.get("min_order") or raw.get("min_order_amount") or "0",
        "store_lat": raw.get("store_lat") or str(DEFAULT_STORE_LAT),
        "store_lng": raw.get("store_lng") or str(DEFAULT_STORE_LNG),
        "delivery_city": raw.get("delivery_city") or "Караганда",
        "delivery_area": raw.get("delivery_area") or "Сортировка, Караганда",
        "delivery_zones": raw.get("delivery_zones") or "[]",
        "outside_zone_message": raw.get("outside_zone_message")
        or "Доставка по этому адресу недоступна. Выберите другой адрес.",
    }


def _apply_free_delivery(subtotal: float, delivery_fee: float, settings: dict[str, str]) -> float:
    try:
        free_from = float(settings.get("free_delivery_from") or 0)
    except (TypeError, ValueError):
        free_from = 0
    if free_from > 0 and subtotal >= free_from:
        return 0.0
    return delivery_fee


@router.post("/delivery-quote")
async def delivery_quote(data: DeliveryQuoteRequest, db: AsyncSession = Depends(get_db)):
    svc = Food_settingsService(db)
    settings = _normalize_food_delivery_settings(await svc.get_all_as_dict())
    subtotal = float(data.cart_subtotal or 0)
    try:
        free_from = float(settings.get("free_delivery_from") or 15000)
    except (TypeError, ValueError):
        free_from = 15000

    def finalize(quote: dict) -> dict:
        base_fee = float(quote.get("delivery_fee") or 0)
        quote["base_delivery_fee"] = base_fee
        quote["free_delivery_from"] = free_from
        quote["delivery_fee"] = _apply_free_delivery(subtotal, base_fee, settings)
        quote["free_delivery_applied"] = base_fee > 0 and quote["delivery_fee"] == 0
        if free_from > 0:
            quote["amount_to_free_delivery"] = max(0.0, free_from - subtotal)
        return quote

    lat, lng = data.lat, data.lng
    if lat is not None and lng is not None:
        lat_f, lng_f = float(lat), float(lng)
        quote = resolve_delivery_quote(settings, lat_f, lng_f)
        display, city = await reverse_geocode(lat_f, lng_f)
        if display:
            quote["display_address"] = display
        enrich_quote_with_location(quote, settings, lat_f, lng_f, detected_city=city, via_gps=True)
        return finalize(quote)

    if data.address and data.address.strip():
        coords = await geocode_address(data.address.strip(), settings=settings)
        if not coords:
            raise HTTPException(
                status_code=404,
                detail="Не нашли этот адрес. Попробуйте GPS или напишите короче: «пер. Урановый 10»",
            )
        lat, lng = coords
        quote = resolve_delivery_quote(settings, lat, lng)
        quote["geocoded_address"] = data.address.strip()
        display, city = await reverse_geocode(lat, lng)
        quote["display_address"] = display or data.address.strip()
        enrich_quote_with_location(quote, settings, lat, lng, detected_city=city, via_gps=False)
        return finalize(quote)

    raise HTTPException(status_code=400, detail="Укажите адрес или координаты")


def _parse_promo_codes(raw: str) -> list[dict]:
    import json

    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except (TypeError, ValueError):
        return []


class PromoValidateRequest(BaseModel):
    code: str
    cart_subtotal: Optional[float] = None


@router.post("/validate-promo")
async def validate_promo(data: PromoValidateRequest, db: AsyncSession = Depends(get_db)):
    code = (data.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Введите промокод")
    subtotal = float(data.cart_subtotal or 0)
    svc = Food_settingsService(db)
    settings = await svc.get_all_as_dict()
    promos = _parse_promo_codes(settings.get("promo_codes") or "[]")
    matched = None
    for p in promos:
        if not p or not isinstance(p, dict):
            continue
        if str(p.get("code", "")).strip().upper() != code:
            continue
        if p.get("active") is False or str(p.get("active", "")).lower() in ("0", "false"):
            continue
        matched = p
        break
    if not matched:
        raise HTTPException(status_code=404, detail="Промокод не найден или недействителен")
    min_order = float(matched.get("min_order") or 0)
    if min_order > 0 and subtotal < min_order:
        raise HTTPException(
            status_code=400,
            detail=f"Промокод действует от {int(min_order):,} ₸".replace(",", " "),
        )
    ptype = str(matched.get("type") or "percent")
    value = float(matched.get("value") or 0)
    discount = 0.0
    free_delivery = False
    pct = 0.0
    if ptype == "free_delivery":
        free_delivery = True
    elif ptype == "fixed":
        discount = min(subtotal, value)
    else:
        pct = max(0.0, min(100.0, value))
        discount = round(subtotal * (pct / 100.0))

    label = str(matched.get("label") or "").strip()
    if not label:
        if free_delivery:
            label = "Бесплатная доставка"
        elif ptype == "fixed":
            label = f"−{int(value):,} ₸".replace(",", " ")
        else:
            label = f"−{int(pct)}%"

    return {
        "valid": True,
        "code": code,
        "type": ptype,
        "value": value,
        "label": label,
        "discount": discount,
        "free_delivery": free_delivery,
    }


@router.post("/admin/seed-marketing")
async def admin_seed_dam_alem_marketing(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(require_panel_admin),
):
    """Загрузить промокоды, подарки, слайды и баннеры DAM ALEM."""
    from services.dam_alem_marketing_seed import ensure_dam_alem_marketing

    stats = await ensure_dam_alem_marketing(force=True)
    return {"ok": True, "stats": stats or {"message": "already configured"}}


@router.post("/admin/seed-catalog")
async def admin_seed_dam_alem_catalog(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(require_panel_admin),
):
    """Полная загрузка меню DAM ALEM (категории, блюда, модификаторы)."""
    from services.dam_alem_catalog_data import verify_catalog
    from services.dam_alem_catalog_seed import seed_dam_alem_catalog

    stats = await seed_dam_alem_catalog(db, replace=True)
    check = verify_catalog()
    return {"ok": True, "stats": stats, "verify": check}


@router.get("/admin/catalog-verify")
async def admin_verify_dam_alem_catalog(_admin: dict = Depends(require_panel_admin)):
    from services.dam_alem_catalog_data import verify_catalog

    return verify_catalog()
