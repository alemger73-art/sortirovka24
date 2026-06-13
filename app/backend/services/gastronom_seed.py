"""Seed default ГАСТРАНОМ catalog when tables are empty."""

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from services.gastronom_categories import Gastronom_categoriesService
from services.gastronom_products import Gastronom_productsService
from services.gastronom_settings import Gastronom_settingsService

logger = logging.getLogger(__name__)

ALCOHOL_CAT_NAME = "Алкогольная продукция (21+)"

DEFAULT_CATEGORIES = [
    ("Овощи и фрукты", "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&h=400&fit=crop", 1, False),
    ("Мясо и птица", "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&h=400&fit=crop", 2, False),
    ("Рыба и морепродукты", "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop", 3, False),
    ("Молочные продукты", "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&h=400&fit=crop", 4, False),
    ("Хлеб и выпечка", "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop", 5, False),
    (ALCOHOL_CAT_NAME, "https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=400&h=400&fit=crop", 6, True),
]

DEFAULT_PRODUCTS = [
    (1, "Томаты", 599, "1 кг", "https://images.unsplash.com/photo-1592920330159-e2821a0f2d4a?w=400&h=400&fit=crop", True, 1),
    (1, "Огурцы", 499, "1 кг", "https://images.unsplash.com/photo-1449300079323-02e209d9ebd3?w=400&h=400&fit=crop", True, 2),
    (2, "Филе куриное", 2499, "1 кг", "https://images.unsplash.com/photo-1604503468506-a8da456d774a?w=400&h=400&fit=crop", True, 3),
    (4, "Молоко 2,5%", 599, "1 л", "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=400&fit=crop", True, 4),
    (5, "Батон нарезной", 299, "400 г", "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=400&h=400&fit=crop", False, 5),
    (3, "Форель свежая", 3999, "1 кг", "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=400&fit=crop", False, 6),
]

DEFAULT_ALCOHOL_PRODUCTS = [
    ("Вино красное сухое", 3499, "0,75 л", "https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=400&h=400&fit=crop", True, 1),
    ("Пиво светлое", 899, "0,5 л", "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop", True, 2),
    ("Водка premium", 5999, "0,5 л", "https://images.unsplash.com/photo-1569529465841-df137b257a08?w=400&h=400&fit=crop", False, 3),
]

DEFAULT_SETTINGS = {
    "default_address": "Жекибаева 129",
    "delivery_time": "Доставка 30-60 мин",
    "min_order": "2000",
    "delivery_fee": "0",
    "store_phone": "",
    "hero_title": "ДОСТАВКА ПРОДУКТОВ ПИТАНИЯ ПО СОРТИРОВКЕ",
    "store_name": "ГАСТРОНОМ",
    "store_tagline": "доставка продуктов питания",
    "logo_url": "",
    "hero_image_url": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=500&fit=crop",
    "alcohol_banner_image": "https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=600&h=300&fit=crop",
}


async def _create_alcohol_products(prod_svc: Gastronom_productsService, cat_id: int, now: str) -> None:
    for name, price, weight, image, popular, sort_order in DEFAULT_ALCOHOL_PRODUCTS:
        await prod_svc.create({
            "category_id": cat_id,
            "name": name,
            "price": price,
            "weight": weight,
            "image_url": image,
            "is_popular": popular,
            "is_active": True,
            "sort_order": sort_order,
            "created_at": now,
        })


async def ensure_alcohol_category(db: AsyncSession) -> bool:
    """Add alcohol category + products if missing (for existing catalogs)."""
    cat_svc = Gastronom_categoriesService(db)
    prod_svc = Gastronom_productsService(db)
    cats = await cat_svc.get_list(limit=200)
    alcohol_cat = next((c for c in cats["items"] if c.is_alcohol), None)
    if alcohol_cat:
        return False

    now = datetime.now().isoformat()
    obj = await cat_svc.create({
        "name": ALCOHOL_CAT_NAME,
        "image_url": "https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=400&h=400&fit=crop",
        "sort_order": 6,
        "is_active": True,
        "is_alcohol": True,
        "created_at": now,
    })
    if obj:
        await _create_alcohol_products(prod_svc, obj.id, now)
        logger.info("Added missing alcohol category to ГАСТРОНОМ catalog")
        return True
    return False


async def seed_gastronom_if_empty(db: AsyncSession) -> bool:
    """Return True if seeding was performed."""
    prod_svc = Gastronom_productsService(db)
    existing = await prod_svc.get_list(limit=1)
    if existing["total"]:
        return False

    logger.info("Seeding default ГАСТРОНОМ catalog...")
    now = datetime.now().isoformat()
    cat_svc = Gastronom_categoriesService(db)
    set_svc = Gastronom_settingsService(db)

    cat_ids: dict[int, int] = {}
    for idx, (name, image, sort_order, is_alcohol) in enumerate(DEFAULT_CATEGORIES, start=1):
        obj = await cat_svc.create({
            "name": name,
            "image_url": image,
            "sort_order": sort_order,
            "is_active": True,
            "is_alcohol": is_alcohol,
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

    alcohol_id = cat_ids.get(6)
    if alcohol_id:
        await _create_alcohol_products(prod_svc, alcohol_id, now)

    await set_svc.upsert_many(DEFAULT_SETTINGS)

    logger.info("ГАСТРОНОМ default catalog seeded")
    return True
