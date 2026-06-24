"""Seed default VOLNA alcohol catalog when tables are empty."""

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from services.volna_categories import Volna_categoriesService
from services.volna_products import Volna_productsService
from services.volna_settings import Volna_settingsService
from services.gastronom_delivery import (
    default_zones_json,
    LEGACY_ALMATY_STORE_LAT,
    LEGACY_ALMATY_STORE_LNG,
    DEFAULT_STORE_LAT,
    DEFAULT_STORE_LNG,
)
from services.gastronom_loyalty import default_loyalty_gifts_json

logger = logging.getLogger(__name__)

# Curated Unsplash images — alcohol-themed, consistent quality
IMG = {
    "hero": "https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=900&h=560&fit=crop",
    "wine_cat": "https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=400&h=400&fit=crop",
    "beer_cat": "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop",
    "spirits_cat": "https://images.unsplash.com/photo-1569529465841-df137b257a08?w=400&h=400&fit=crop",
    "sparkling_cat": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&h=400&fit=crop",
    "cocktail_cat": "https://images.unsplash.com/photo-1551538827-9c037cb80827?w=400&h=400&fit=crop",
    "snacks_cat": "https://images.unsplash.com/photo-1604908177521-402890a3a563?w=400&h=400&fit=crop",
    "wine_red": "https://images.unsplash.com/photo-1506377247377-2ccd4979b731?w=400&h=400&fit=crop",
    "wine_white": "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=400&h=400&fit=crop",
    "beer_lager": "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop",
    "beer_craft": "https://images.unsplash.com/photo-1618885472175-75d9a061ecb8?w=400&h=400&fit=crop",
    "vodka": "https://images.unsplash.com/photo-1569529465841-df137b257a08?w=400&h=400&fit=crop",
    "whiskey": "https://images.unsplash.com/photo-1527281400683-1aae7261f764?w=400&h=400&fit=crop",
    "champagne": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&h=400&fit=crop",
    "prosecco": "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&h=400&fit=crop",
    "gin_tonic": "https://images.unsplash.com/photo-1551538827-9c037cb80827?w=400&h=400&fit=crop",
    "cider": "https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=400&h=400&fit=crop",
    "snacks": "https://images.unsplash.com/photo-1604908177521-402890a3a563?w=400&h=400&fit=crop",
    "promo": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&h=320&fit=crop",
}

DEFAULT_CATEGORIES = [
    ("Вино", IMG["wine_cat"], 1),
    ("Пиво и сидр", IMG["beer_cat"], 2),
    ("Крепкий алкоголь", IMG["spirits_cat"], 3),
    ("Игристое", IMG["sparkling_cat"], 4),
    ("Коктейли и лимонады", IMG["cocktail_cat"], 5),
    ("Закуски", IMG["snacks_cat"], 6),
]

# (category_idx, name, price, weight, image, is_popular, sort_order)
DEFAULT_PRODUCTS = [
    (1, "Вино красное сухое", 3499, "0,75 л", IMG["wine_red"], True, 1),
    (1, "Вино белое полусухое", 3299, "0,75 л", IMG["wine_white"], True, 2),
    (2, "Пиво светлое", 899, "0,5 л", IMG["beer_lager"], True, 3),
    (2, "Крафтовое IPA", 1299, "0,5 л", IMG["beer_craft"], False, 4),
    (2, "Сидр яблочный", 1099, "0,33 л", IMG["cider"], False, 5),
    (3, "Водка premium", 5999, "0,5 л", IMG["vodka"], True, 6),
    (3, "Виски 12 лет", 12999, "0,7 л", IMG["whiskey"], True, 7),
    (4, "Шампанское brut", 7999, "0,75 л", IMG["champagne"], True, 8),
    (4, "Просекко", 4499, "0,75 л", IMG["prosecco"], False, 9),
    (5, "Джин-тоник готовый", 1499, "0,33 л", IMG["gin_tonic"], False, 10),
    (6, "Сырная тарелка", 2499, "300 г", IMG["snacks"], False, 11),
    (6, "Орехи и снеки", 999, "200 г", IMG["snacks"], False, 12),
]

DEFAULT_SETTINGS = {
    "default_address": "ул. Жекибаева 129",
    "delivery_time": "Доставка 30–60 мин",
    "min_order": "3000",
    "delivery_fee": "0",
    "store_phone": "",
    "store_lat": str(DEFAULT_STORE_LAT),
    "store_lng": str(DEFAULT_STORE_LNG),
    "delivery_city": "Караганда",
    "store_city": "Караганда",
    "delivery_area": "Сортировка, Караганда",
    "delivery_zones": default_zones_json(),
    "loyalty_enabled": "1",
    "loyalty_gifts": default_loyalty_gifts_json(),
    "outside_zone_message": "Доставка по этому адресу недоступна. Выберите адрес в зоне доставки или позвоните в магазин.",
    "hero_title": "VOLNA — алкоголь с доставкой по Сортировке",
    "store_name": "VOLNA",
    "store_tagline": "магазин алкогольных напитков · 21+",
    "logo_url": "",
    "hero_image_url": IMG["hero"],
    "promo_title": "Волна выходного",
    "promo_subtitle": "−10% на игристое в пятницу и субботу",
    "promo_image_url": IMG["promo"],
    "promo2_title": "Бесплатная доставка",
    "promo2_subtitle": "При заказе от 15 000 ₸ по району",
}


async def seed_volna_if_empty(db: AsyncSession) -> bool:
    """Return True if seeding was performed."""
    prod_svc = Volna_productsService(db)
    existing = await prod_svc.get_list(limit=1)
    if existing["total"]:
        return False

    logger.info("Seeding default VOLNA catalog...")
    now = datetime.now().isoformat()
    cat_svc = Volna_categoriesService(db)
    set_svc = Volna_settingsService(db)

    cat_ids: dict[int, int] = {}
    for idx, (name, image, sort_order) in enumerate(DEFAULT_CATEGORIES, start=1):
        obj = await cat_svc.create({
            "name": name,
            "image_url": image,
            "sort_order": sort_order,
            "is_active": True,
            "created_at": now,
        })
        if obj:
            cat_ids[idx] = obj.id

    for cat_idx, name, price, weight, image, popular, sort_order in DEFAULT_PRODUCTS:
        await prod_svc.create({
            "category_id": cat_ids.get(cat_idx),
            "name": name,
            "price": price,
            "weight": weight,
            "image_url": image,
            "is_popular": popular,
            "is_active": True,
            "sort_order": sort_order,
            "created_at": now,
        })

    await set_svc.upsert_many(DEFAULT_SETTINGS)

    logger.info("VOLNA default catalog seeded")
    return True


def _is_legacy_almaty_coords(lat: float, lng: float) -> bool:
    return (
        abs(lat - LEGACY_ALMATY_STORE_LAT) < 0.01
        and abs(lng - LEGACY_ALMATY_STORE_LNG) < 0.01
    )


async def ensure_volna_location_settings(db: AsyncSession) -> bool:
    """Fix store coordinates left from early templates."""
    set_svc = Volna_settingsService(db)
    settings = await set_svc.get_all_as_dict()
    try:
        lat = float(settings.get("store_lat") or 0)
        lng = float(settings.get("store_lng") or 0)
    except ValueError:
        lat, lng = 0.0, 0.0

    legacy = _is_legacy_almaty_coords(lat, lng)
    missing_city = not (settings.get("delivery_city") or settings.get("store_city"))

    if not legacy and not missing_city:
        return False

    patch: dict[str, str] = {}
    if legacy:
        patch.update({
            "store_lat": str(DEFAULT_STORE_LAT),
            "store_lng": str(DEFAULT_STORE_LNG),
            "delivery_zones": default_zones_json(),
        })
        logger.info("Migrated VOLNA store location to Sortirovka/Karaganda")
    if missing_city or legacy:
        patch.update({
            "delivery_city": "Караганда",
            "store_city": "Караганда",
            "delivery_area": "Сортировка, Караганда",
        })

    if patch:
        await set_svc.upsert_many(patch)
        return True
    return False


async def ensure_volna_loyalty_settings(db: AsyncSession) -> bool:
    """Add default loyalty gifts when missing."""
    set_svc = Volna_settingsService(db)
    settings = await set_svc.get_all_as_dict()
    if settings.get("loyalty_gifts"):
        return False
    await set_svc.upsert_many({
        "loyalty_enabled": settings.get("loyalty_enabled") or "1",
        "loyalty_gifts": default_loyalty_gifts_json(),
    })
    logger.info("Added default loyalty gifts to VOLNA settings")
    return True
