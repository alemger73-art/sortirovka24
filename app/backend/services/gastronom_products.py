import logging
from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.gastronom_products import Gastronom_products

logger = logging.getLogger(__name__)


class Gastronom_productsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Gastronom_products]:
        try:
            allowed = set(Gastronom_products.__table__.columns.keys())
            obj = Gastronom_products(**{k: v for k, v in data.items() if k in allowed})
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating gastronom product: {e}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Gastronom_products]:
        result = await self.db.execute(select(Gastronom_products).where(Gastronom_products.id == obj_id))
        return result.scalar_one_or_none()

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 500,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        query = select(Gastronom_products)
        count_query = select(func.count(Gastronom_products.id))
        if query_dict:
            for field, value in query_dict.items():
                if hasattr(Gastronom_products, field):
                    query = query.where(getattr(Gastronom_products, field) == value)
                    count_query = count_query.where(getattr(Gastronom_products, field) == value)
        total = (await self.db.execute(count_query)).scalar()
        if sort:
            if sort.startswith("-"):
                field_name = sort[1:]
                if hasattr(Gastronom_products, field_name):
                    query = query.order_by(getattr(Gastronom_products, field_name).desc())
            elif hasattr(Gastronom_products, sort):
                query = query.order_by(getattr(Gastronom_products, sort))
        else:
            query = query.order_by(Gastronom_products.sort_order.asc(), Gastronom_products.id.asc())
        items = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Gastronom_products]:
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
            logger.error(f"Error updating gastronom product {obj_id}: {e}")
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
            logger.error(f"Error deleting gastronom product {obj_id}: {e}")
            raise
