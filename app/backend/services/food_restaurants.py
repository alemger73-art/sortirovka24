import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.food_restaurants import Food_restaurants

logger = logging.getLogger(__name__)


class Food_restaurantsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Food_restaurants]:
        try:
            obj = Food_restaurants(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            return obj
        except Exception:
            await self.db.rollback()
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Food_restaurants]:
        result = await self.db.execute(select(Food_restaurants).where(Food_restaurants.id == obj_id))
        return result.scalar_one_or_none()

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        query = select(Food_restaurants)
        count_query = select(func.count(Food_restaurants.id))
        if query_dict:
            for field, value in query_dict.items():
                if hasattr(Food_restaurants, field):
                    query = query.where(getattr(Food_restaurants, field) == value)
                    count_query = count_query.where(getattr(Food_restaurants, field) == value)

        count_result = await self.db.execute(count_query)
        total = count_result.scalar()

        if sort:
            if sort.startswith("-"):
                field_name = sort[1:]
                if hasattr(Food_restaurants, field_name):
                    query = query.order_by(getattr(Food_restaurants, field_name).desc())
            elif hasattr(Food_restaurants, sort):
                query = query.order_by(getattr(Food_restaurants, sort))
        else:
            query = query.order_by(Food_restaurants.sort_order, Food_restaurants.id.desc())

        result = await self.db.execute(query.offset(skip).limit(limit))
        items = result.scalars().all()
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Food_restaurants]:
        obj = await self.get_by_id(obj_id)
        if not obj:
            return None
        try:
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)
            await self.db.commit()
            await self.db.refresh(obj)
            return obj
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, obj_id: int) -> bool:
        obj = await self.get_by_id(obj_id)
        if not obj:
            return False
        try:
            await self.db.delete(obj)
            await self.db.commit()
            return True
        except Exception:
            await self.db.rollback()
            raise

    async def list_by_field(self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20) -> List[Food_restaurants]:
        if not hasattr(Food_restaurants, field_name):
            raise ValueError(f"Field {field_name} does not exist on Food_restaurants")
        result = await self.db.execute(
            select(Food_restaurants)
            .where(getattr(Food_restaurants, field_name) == field_value)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()
