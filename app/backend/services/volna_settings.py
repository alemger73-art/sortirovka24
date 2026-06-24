import logging
from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.volna_settings import Volna_settings

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "default_address": "ул. Жекибаева 129",
    "delivery_time": "Доставка 30–60 мин",
    "min_order": "3000",
    "hero_title": "VOLNA — алкоголь с доставкой по Сортировке",
    "store_name": "VOLNA",
    "store_tagline": "магазин алкогольных напитков",
    "logo_url": "",
    "hero_image_url": "",
    "promo_title": "Волна выходного",
    "promo_subtitle": "−10% на игристое в пятницу и субботу",
    "promo_image_url": "",
    "promo2_title": "Бесплатная доставка",
    "promo2_subtitle": "При заказе от 15 000 ₸ по району",
}


class Volna_settingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_as_dict(self) -> Dict[str, str]:
        result = await self.db.execute(select(Volna_settings))
        rows = result.scalars().all()
        settings = dict(DEFAULT_SETTINGS)
        for row in rows:
            if row.key:
                settings[row.key] = row.value or ""
        return settings

    async def upsert(self, key: str, value: str) -> Volna_settings:
        result = await self.db.execute(select(Volna_settings).where(Volna_settings.key == key))
        obj = result.scalar_one_or_none()
        try:
            if obj:
                obj.value = value
            else:
                obj = Volna_settings(key=key, value=value)
                self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error upserting volna setting {key}: {e}")
            raise

    async def upsert_many(self, data: Dict[str, str]) -> List[Volna_settings]:
        results = []
        for key, value in data.items():
            results.append(await self.upsert(key, str(value)))
        return results
