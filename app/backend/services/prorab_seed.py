"""Seed default PRORAB construction materials catalog when tables are empty."""

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from services.prorab_categories import Prorab_categoriesService
from services.prorab_products import Prorab_productsService
from services.prorab_settings import Prorab_settingsService
from services.gastronom_delivery import (
    default_zones_json,
    DEFAULT_STORE_LAT,
    DEFAULT_STORE_LNG,
)

logger = logging.getLogger(__name__)

DEFAULT_CATEGORIES = [
    ("Цемент и сухие смеси", "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=400&fit=crop", 1),
    ("Кирпич и блоки", "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=400&h=400&fit=crop", 2),
    ("Пиломатериалы", "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop", 3),
    ("Металлопрокат", "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=400&fit=crop", 4),
    ("Кровля и изоляция", "https://images.unsplash.com/photo-1595846519845-68e298c2edd8?w=400&h=400&fit=crop", 5),
    ("Инструмент и крепёж", "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&h=400&fit=crop", 6),
]

DEFAULT_PRODUCTS = [
    (1, "Цемент М400", 4200, "50 кг", "Портландцемент для общестроительных работ", True, 1),
    (1, "Штукатурка гипсовая", 2800, "30 кг", "Ровная штукатурка для внутренних работ", True, 2),
    (1, "Плиточный клей", 3500, "25 кг", "Для керамической плитки и керамогранита", False, 3),
    (2, "Кирпич красный полнотелый", 45, "1 шт", "Стандартный строительный кирпич", True, 4),
    (2, "Газоблок D500", 8500, "1 шт", "Автоклавный газобетон 600×200×300", True, 5),
    (3, "Доска обрезная 50×150", 12000, "1 м³", "Хвойная доска, естественной влажности", True, 6),
    (3, "Брус 100×100", 14500, "1 м³", "Строительный брус для каркаса", False, 7),
    (4, "Арматура А500 12 мм", 850, "1 м", "Стальная арматура для фундамента", True, 8),
    (4, "Профлист С8", 4200, "1 м²", "Оцинкованный профнастил для забора и кровли", False, 9),
    (5, "Минеральная вата 50 мм", 3200, "1 уп", "Теплоизоляция для стен и кровли", True, 10),
    (5, "Рубероид", 1800, "1 рулон", "Гидроизоляция для фундамента", False, 11),
    (6, "Перфоратор Bosch", 89000, "1 шт", "Профессиональный перфоратор 800 Вт", True, 12),
    (6, "Саморезы по дереву 4×50", 450, "100 шт", "Оцинкованные саморезы", False, 13),
]

DEFAULT_SETTINGS = {
    "default_address": "ул. Жекибаева 129",
    "delivery_time": "Доставка в день заказа или на следующий",
    "min_order": "0",
    "delivery_fee": "2000",
    "free_delivery_from": "50000",
    "store_phone": "",
    "store_lat": str(DEFAULT_STORE_LAT),
    "store_lng": str(DEFAULT_STORE_LNG),
    "delivery_city": "Караганда",
    "store_city": "Караганда",
    "delivery_area": "Сортировка, Караганда",
    "delivery_zones": default_zones_json(),
    "outside_zone_message": "Доставка по этому адресу недоступна. Выберите адрес в зоне доставки или позвоните в магазин.",
    "hero_title": "ДОСТАВКА СТРОИТЕЛЬНЫХ МАТЕРИАЛОВ ПО СОРТИРОВКЕ",
    "store_name": "PRORAB",
    "store_tagline": "магазин строительных материалов",
    "logo_url": "",
    "hero_image_url": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=500&fit=crop",
    "operator_note": "После оформления заказа оператор перезвонит для уточнения деталей и согласования доставки.",
}


async def seed_prorab_if_empty(db: AsyncSession) -> bool:
    """Return True if seeding was performed."""
    prod_svc = Prorab_productsService(db)
    existing = await prod_svc.get_list(limit=1)
    if existing["total"]:
        return False

    logger.info("Seeding default PRORAB catalog...")
    now = datetime.now().isoformat()
    cat_svc = Prorab_categoriesService(db)
    set_svc = Prorab_settingsService(db)

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

    for cat_idx, name, price, weight, description, popular, sort_order in DEFAULT_PRODUCTS:
        await prod_svc.create({
            "category_id": cat_ids.get(cat_idx),
            "name": name,
            "description": description,
            "price": price,
            "weight": weight,
            "image_url": DEFAULT_CATEGORIES[cat_idx - 1][1],
            "is_popular": popular,
            "is_active": True,
            "sort_order": sort_order,
            "created_at": now,
        })

    await set_svc.upsert_many(DEFAULT_SETTINGS)

    logger.info("PRORAB default catalog seeded")
    return True


async def ensure_prorab_location_settings(db: AsyncSession) -> bool:
    """Ensure delivery location settings exist for PRORAB."""
    set_svc = Prorab_settingsService(db)
    settings = await set_svc.get_all_as_dict()
    missing_city = not (settings.get("delivery_city") or settings.get("store_city"))
    missing_zones = not settings.get("delivery_zones")
    missing_free = not settings.get("free_delivery_from")

    if not missing_city and not missing_zones and not missing_free:
        return False

    patch: dict[str, str] = {}
    if missing_city:
        patch.update({
            "delivery_city": "Караганда",
            "store_city": "Караганда",
            "delivery_area": "Сортировка, Караганда",
        })
    if missing_zones:
        patch.update({
            "store_lat": str(DEFAULT_STORE_LAT),
            "store_lng": str(DEFAULT_STORE_LNG),
            "delivery_zones": default_zones_json(),
        })
    if missing_free:
        patch["free_delivery_from"] = "50000"

    if patch:
        await set_svc.upsert_many(patch)
        return True
    return False
