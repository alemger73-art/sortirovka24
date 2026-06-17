import logging
from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.pharmacy_settings import Pharmacy_settings

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "default_address": "Жекибаева 129",
    "delivery_time": "Доставка 30-60 мин",
    "min_order": "1500",
    "hero_title": "ДОСТАВКА ЛЕКАРСТВ ПО СОРТИРОВКЕ",
    "store_name": "АПТЕКА 24",
    "store_tagline": "доставка лекарств и товаров для здоровья",
    "logo_url": "",
    "hero_image_url": "",
    "rx_banner_image": "",
}


class Pharmacy_settingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_as_dict(self) -> Dict[str, str]:
        result = await self.db.execute(select(Pharmacy_settings))
        rows = result.scalars().all()
        settings = dict(DEFAULT_SETTINGS)
        for row in rows:
            if row.key:
                settings[row.key] = row.value or ""
        return settings

    async def upsert(self, key: str, value: str) -> Pharmacy_settings:
        result = await self.db.execute(select(Pharmacy_settings).where(Pharmacy_settings.key == key))
        obj = result.scalar_one_or_none()
        try:
            if obj:
                obj.value = value
            else:
                obj = Pharmacy_settings(key=key, value=value)
                self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error upserting pharmacy setting {key}: {e}")
            raise

    async def upsert_many(self, data: Dict[str, str]) -> List[Pharmacy_settings]:
        results = []
        for key, value in data.items():
            results.append(await self.upsert(key, str(value)))
        return results
