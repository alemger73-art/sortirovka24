import logging

from typing import Any, Dict, List, Optional



from sqlalchemy import func, select

from sqlalchemy.ext.asyncio import AsyncSession



from models.prorab_categories import Prorab_categories



logger = logging.getLogger(__name__)





class Prorab_categoriesService:

    def __init__(self, db: AsyncSession):

        self.db = db



    async def create(self, data: Dict[str, Any]) -> Optional[Prorab_categories]:

        try:

            allowed = set(Prorab_categories.__table__.columns.keys())

            obj = Prorab_categories(**{k: v for k, v in data.items() if k in allowed})

            self.db.add(obj)

            await self.db.commit()

            await self.db.refresh(obj)

            return obj

        except Exception as e:

            await self.db.rollback()

            logger.error(f"Error creating prorab category: {e}")

            raise



    async def get_by_id(self, obj_id: int) -> Optional[Prorab_categories]:

        result = await self.db.execute(select(Prorab_categories).where(Prorab_categories.id == obj_id))

        return result.scalar_one_or_none()



    async def get_list(

        self,

        skip: int = 0,

        limit: int = 200,

        query_dict: Optional[Dict[str, Any]] = None,

        sort: Optional[str] = None,

    ) -> Dict[str, Any]:

        query = select(Prorab_categories)

        count_query = select(func.count(Prorab_categories.id))

        if query_dict:

            for field, value in query_dict.items():

                if hasattr(Prorab_categories, field):

                    query = query.where(getattr(Prorab_categories, field) == value)

                    count_query = count_query.where(getattr(Prorab_categories, field) == value)

        total = (await self.db.execute(count_query)).scalar()

        if sort:

            if sort.startswith("-"):

                field_name = sort[1:]

                if hasattr(Prorab_categories, field_name):

                    query = query.order_by(getattr(Prorab_categories, field_name).desc())

            elif hasattr(Prorab_categories, sort):

                query = query.order_by(getattr(Prorab_categories, sort))

        else:

            query = query.order_by(Prorab_categories.sort_order.asc(), Prorab_categories.id.asc())

        items = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()

        return {"items": items, "total": total, "skip": skip, "limit": limit}



    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Prorab_categories]:

        try:

            obj = await self.get_by_id(obj_id)

            if not obj:

                return None

            for key, value in update_data.items():

                if hasattr(obj, key):

                    setattr(obj, key, value)

            await self.db.commit()

            await self.db.refresh(obj)

            return obj

        except Exception as e:

            await self.db.rollback()

            logger.error(f"Error updating prorab category {obj_id}: {e}")

            raise



    async def delete(self, obj_id: int) -> bool:

        try:

            obj = await self.get_by_id(obj_id)

            if not obj:

                return False

            await self.db.delete(obj)

            await self.db.commit()

            return True

        except Exception as e:

            await self.db.rollback()

            logger.error(f"Error deleting prorab category {obj_id}: {e}")

            raise

