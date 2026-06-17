"""Seed default АПТЕКА catalog when tables are empty."""

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from services.pharmacy_categories import Pharmacy_categoriesService
from services.pharmacy_products import Pharmacy_productsService
from services.pharmacy_settings import Pharmacy_settingsService
from services.gastronom_delivery import (
    default_zones_json,
    LEGACY_ALMATY_STORE_LAT,
    LEGACY_ALMATY_STORE_LNG,
    DEFAULT_STORE_LAT,
    DEFAULT_STORE_LNG,
)
from services.gastronom_loyalty import default_loyalty_gifts_json

logger = logging.getLogger(__name__)

# (name, image_url, sort_order, is_rx)
DEFAULT_CATEGORIES = [
    ("Простуда и грипп", "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&h=400&fit=crop", 1, False),
    ("Обезболивающие", "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop", 2, False),
    ("Витамины и БАД", "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&h=400&fit=crop", 3, False),
    ("ЖКТ и пищеварение", "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&h=400&fit=crop", 4, False),
    ("Первая помощь", "https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=400&h=400&fit=crop", 5, False),
    ("Мама и малыш", "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400&h=400&fit=crop", 6, False),
    ("Красота и гигиена", "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=400&fit=crop", 7, False),
    ("Антисептики и маски", "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=400&h=400&fit=crop", 8, False),
    ("Рецептурные препараты", "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&h=400&fit=crop", 9, True),
]

# (cat_idx, name, price, old_price, weight, image, popular, requires_rx,
#  manufacturer, country, active_ingredient, dosage_form, sort_order)
DEFAULT_PRODUCTS = [
    (1, "Парацетамол 500 мг", 320, 0, "20 таблеток",
     "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop",
     True, False, "Химфарм", "Казахстан", "Парацетамол", "Таблетки", 1),
    (1, "ТераФлю порошок", 1990, 2350, "10 пакетиков",
     "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&h=400&fit=crop",
     True, False, "GSK", "Швейцария", "Парацетамол, фенирамин", "Порошок", 2),
    (1, "Спрей для горла", 1450, 0, "30 мл",
     "https://images.unsplash.com/photo-1576602976047-174e57a47881?w=400&h=400&fit=crop",
     False, False, "Доктор Тайсс", "Германия", "Гексэтидин", "Спрей", 3),
    (2, "Ибупрофен 400 мг", 690, 0, "20 таблеток",
     "https://images.unsplash.com/photo-1550572017-edd951aa8f7f?w=400&h=400&fit=crop",
     True, False, "Озон", "Россия", "Ибупрофен", "Таблетки", 4),
    (2, "Но-шпа 40 мг", 1290, 0, "24 таблетки",
     "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&h=400&fit=crop",
     False, False, "Sanofi", "Венгрия", "Дротаверин", "Таблетки", 5),
    (3, "Витамин C 1000 мг", 1850, 2200, "30 шипучих таблеток",
     "https://images.unsplash.com/photo-1577174881658-0f30ed549adc?w=400&h=400&fit=crop",
     True, False, "Эвалар", "Россия", "Аскорбиновая кислота", "Шипучие таблетки", 6),
    (3, "Витамин D3 2000 МЕ", 2490, 0, "60 капсул",
     "https://images.unsplash.com/photo-1607620842042-eaba93e10d3e?w=400&h=400&fit=crop",
     True, False, "Now Foods", "США", "Холекальциферол", "Капли/капсулы", 7),
    (3, "Магний B6", 2150, 0, "50 таблеток",
     "https://images.unsplash.com/photo-1626716493137-b67fe9501e76?w=400&h=400&fit=crop",
     False, False, "Sanofi", "Франция", "Магний, пиридоксин", "Таблетки", 8),
    (4, "Смекта", 1190, 0, "10 пакетиков",
     "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&h=400&fit=crop",
     False, False, "Ipsen", "Франция", "Смектит диоктаэдрический", "Порошок", 9),
    (4, "Активированный уголь", 180, 0, "10 таблеток",
     "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop",
     False, False, "Химфарм", "Казахстан", "Уголь активированный", "Таблетки", 10),
    (5, "Пластырь бактерицидный", 450, 0, "20 шт",
     "https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=400&h=400&fit=crop",
     False, False, "Hartmann", "Германия", "—", "Пластырь", 11),
    (5, "Бинт стерильный", 290, 0, "5 м x 10 см",
     "https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=400&h=400&fit=crop",
     False, False, "Медтекс", "Казахстан", "—", "Перевязочное", 12),
    (6, "Детский сироп от кашля", 1690, 0, "100 мл",
     "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400&h=400&fit=crop",
     True, False, "Гербион", "Словения", "Экстракт подорожника", "Сироп", 13),
    (6, "Подгузники, размер 3", 4990, 5790, "58 шт",
     "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400&h=400&fit=crop",
     False, False, "Pampers", "Польша", "—", "Подгузники", 14),
    (7, "Антисептик для рук", 890, 0, "100 мл",
     "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=400&h=400&fit=crop",
     False, False, "Sanitelle", "Россия", "Этанол 70%", "Гель", 15),
    (8, "Маски медицинские", 690, 990, "50 шт",
     "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=400&h=400&fit=crop",
     True, False, "Медиком", "Казахстан", "—", "Маски трёхслойные", 16),
]

DEFAULT_RX_PRODUCTS = [
    ("Антибиотик Амоксициллин 500 мг", 1490, "16 капсул",
     "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&h=400&fit=crop",
     "Озон", "Россия", "Амоксициллин", "Капсулы", 1),
    ("Препарат для давления", 2290, "30 таблеток",
     "https://images.unsplash.com/photo-1550572017-edd951aa8f7f?w=400&h=400&fit=crop",
     "Berlin-Chemie", "Германия", "Эналаприл", "Таблетки", 2),
]

DEFAULT_SETTINGS = {
    "default_address": "ул. Жекибаева 129",
    "delivery_time": "Доставка 30-60 мин",
    "min_order": "1500",
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
    "outside_zone_message": "Доставка по этому адресу недоступна. Выберите адрес в зоне доставки или позвоните в аптеку.",
    "hero_title": "ДОСТАВКА ЛЕКАРСТВ ПО СОРТИРОВКЕ ЗА 30 МИНУТ",
    "store_name": "АПТЕКА 24",
    "store_tagline": "доставка лекарств и товаров для здоровья",
    "logo_url": "",
    "hero_image_url": "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&h=500&fit=crop",
    "rx_banner_image": "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=600&h=300&fit=crop",
}


async def _create_rx_products(prod_svc: Pharmacy_productsService, cat_id: int, now: str) -> None:
    for name, price, weight, image, manufacturer, country, ingredient, form, sort_order in DEFAULT_RX_PRODUCTS:
        await prod_svc.create({
            "category_id": cat_id,
            "name": name,
            "price": price,
            "weight": weight,
            "image_url": image,
            "is_popular": False,
            "is_active": True,
            "in_stock": True,
            "requires_prescription": True,
            "manufacturer": manufacturer,
            "country": country,
            "active_ingredient": ingredient,
            "dosage_form": form,
            "sort_order": sort_order,
            "created_at": now,
        })


async def seed_pharmacy_if_empty(db: AsyncSession) -> bool:
    """Return True if seeding was performed."""
    prod_svc = Pharmacy_productsService(db)
    existing = await prod_svc.get_list(limit=1)
    if existing["total"]:
        return False

    logger.info("Seeding default АПТЕКА catalog...")
    now = datetime.now().isoformat()
    cat_svc = Pharmacy_categoriesService(db)
    set_svc = Pharmacy_settingsService(db)

    cat_ids: dict[int, int] = {}
    for idx, (name, image, sort_order, is_rx) in enumerate(DEFAULT_CATEGORIES, start=1):
        obj = await cat_svc.create({
            "name": name,
            "image_url": image,
            "sort_order": sort_order,
            "is_active": True,
            "is_rx": is_rx,
            "created_at": now,
        })
        if obj:
            cat_ids[idx] = obj.id

    for (cat_idx, name, price, old_price, weight, image, popular, requires_rx,
         manufacturer, country, ingredient, form, sort_order) in DEFAULT_PRODUCTS:
        await prod_svc.create({
            "category_id": cat_ids.get(cat_idx),
            "name": name,
            "price": price,
            "old_price": old_price or None,
            "weight": weight,
            "image_url": image,
            "is_popular": popular,
            "is_active": True,
            "in_stock": True,
            "requires_prescription": requires_rx,
            "manufacturer": manufacturer,
            "country": country,
            "active_ingredient": ingredient,
            "dosage_form": form,
            "sort_order": sort_order,
            "created_at": now,
        })

    rx_cat_id = cat_ids.get(9)
    if rx_cat_id:
        await _create_rx_products(prod_svc, rx_cat_id, now)

    await set_svc.upsert_many(DEFAULT_SETTINGS)

    logger.info("АПТЕКА default catalog seeded")
    return True


def _is_legacy_almaty_coords(lat: float, lng: float) -> bool:
    return (
        abs(lat - LEGACY_ALMATY_STORE_LAT) < 0.01
        and abs(lng - LEGACY_ALMATY_STORE_LNG) < 0.01
    )


async def ensure_pharmacy_location_settings(db: AsyncSession) -> bool:
    """Fix store coordinates / city left from early templates. Returns True if updated."""
    set_svc = Pharmacy_settingsService(db)
    settings = await set_svc.get_all_as_dict()
    try:
        lat = float(settings.get("store_lat") or 0)
        lng = float(settings.get("store_lng") or 0)
    except ValueError:
        lat, lng = 0.0, 0.0

    legacy = _is_legacy_almaty_coords(lat, lng)
    missing_city = not (settings.get("delivery_city") or settings.get("store_city"))
    missing_coords = lat == 0.0 and lng == 0.0

    if not legacy and not missing_city and not missing_coords:
        return False

    patch: dict[str, str] = {}
    if legacy or missing_coords:
        patch.update({
            "store_lat": str(DEFAULT_STORE_LAT),
            "store_lng": str(DEFAULT_STORE_LNG),
            "delivery_zones": settings.get("delivery_zones") or default_zones_json(),
        })
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


async def ensure_pharmacy_loyalty_settings(db: AsyncSession) -> bool:
    """Add default loyalty gifts when missing (existing catalogs)."""
    set_svc = Pharmacy_settingsService(db)
    settings = await set_svc.get_all_as_dict()
    if settings.get("loyalty_gifts"):
        return False
    await set_svc.upsert_many({
        "loyalty_enabled": settings.get("loyalty_enabled") or "1",
        "loyalty_gifts": default_loyalty_gifts_json(),
    })
    logger.info("Added default loyalty gifts to АПТЕКА settings")
    return True
