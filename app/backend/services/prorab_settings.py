import logging

from typing import Any, Dict, List, Optional



from sqlalchemy import select

from sqlalchemy.ext.asyncio import AsyncSession



from models.prorab_settings import Prorab_settings



logger = logging.getLogger(__name__)



DEFAULT_SETTINGS = {

    "default_address": "ул. Жекибаева 129",

    "delivery_time": "Доставка в день заказа или на следующий",

    "min_order": "0",

    "delivery_fee": "2000",

    "free_delivery_from": "50000",

    "store_phone": "",

    "hero_title": "ДОСТАВКА СТРОИТЕЛЬНЫХ МАТЕРИАЛОВ ПО СОРТИРОВКЕ",

    "store_name": "PRORAB",

    "store_tagline": "магазин строительных материалов",

    "logo_url": "",

    "hero_image_url": "",

}





class Prorab_settingsService:

    def __init__(self, db: AsyncSession):

        self.db = db



    async def get_all_as_dict(self) -> Dict[str, str]:

        result = await self.db.execute(select(Prorab_settings))

        rows = result.scalars().all()

        settings = dict(DEFAULT_SETTINGS)

        for row in rows:

            if row.key:

                settings[row.key] = row.value or ""

        return settings



    async def upsert(self, key: str, value: str) -> Prorab_settings:

        result = await self.db.execute(select(Prorab_settings).where(Prorab_settings.key == key))

        obj = result.scalar_one_or_none()

        try:

            if obj:

                obj.value = value

            else:

                obj = Prorab_settings(key=key, value=value)

                self.db.add(obj)

            await self.db.commit()

            await self.db.refresh(obj)

            return obj

        except Exception as e:

            await self.db.rollback()

            logger.error(f"Error upserting prorab setting {key}: {e}")

            raise



    async def upsert_many(self, data: Dict[str, str]) -> List[Prorab_settings]:

        results = []

        for key, value in data.items():

            results.append(await self.upsert(key, str(value)))

        return results

