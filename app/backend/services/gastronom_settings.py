import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.gastronom_settings import Gastronom_settings

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "default_address": "Жекибаева 129",
    "delivery_time": "Доставка 30-60 мин",
    "min_order": "2000",
    "hero_title": "ДОСТАВКА ПРОДУКТОВ ПИТАНИЯ ПО СОРТИРОВКЕ",
    "store_name": "ГАСТРОНОМ",
    "store_tagline": "доставка продуктов питания",
    "logo_url": "",
    "hero_image_url": "",
    "alcohol_banner_image": "",
}


class Gastronom_settingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_as_dict(self) -> Dict[str, str]:
        result = await self.db.execute(select(Gastronom_settings))
        rows = result.scalars().all()
        settings = dict(DEFAULT_SETTINGS)
        for row in rows:
            if row.key:
                settings[row.key] = row.value or ""
        return settings

    async def upsert(self, key: str, value: str) -> Gastronom_settings:
        result = await self.db.execute(select(Gastronom_settings).where(Gastronom_settings.key == key))
        obj = result.scalar_one_or_none()
        try:
            if obj:
                obj.value = value
            else:
                obj = Gastronom_settings(key=key, value=value)
                self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error upserting gastronom setting {key}: {e}")
            raise

    async def upsert_many(self, data: Dict[str, str]) -> List[Gastronom_settings]:
        results = []
        for key, value in data.items():
            results.append(await self.upsert(key, str(value)))
        return results
