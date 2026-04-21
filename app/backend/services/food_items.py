import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.food_items import Food_items

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Food_itemsService:
    """Service layer for Food_items operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Food_items]:
        """Create a new food_items"""
        try:
            obj = Food_items(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created food_items with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating food_items: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Food_items]:
        """Get food_items by ID"""
        try:
            query = select(Food_items).where(Food_items.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_items {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of food_itemss"""
        try:
            query = select(Food_items)
            count_query = select(func.count(Food_items.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Food_items, field):
                        query = query.where(getattr(Food_items, field) == value)
                        count_query = count_query.where(getattr(Food_items, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Food_items, field_name):
                        query = query.order_by(getattr(Food_items, field_name).desc())
                else:
                    if hasattr(Food_items, sort):
                        query = query.order_by(getattr(Food_items, sort))
            else:
                query = query.order_by(Food_items.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching food_items list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Food_items]:
        """Update food_items"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_items {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated food_items {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating food_items {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete food_items"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_items {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted food_items {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting food_items {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Food_items]:
        """Get food_items by any field"""
        try:
            if not hasattr(Food_items, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_items")
            result = await self.db.execute(
                select(Food_items).where(getattr(Food_items, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_items by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Food_items]:
        """Get list of food_itemss filtered by field"""
        try:
            if not hasattr(Food_items, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_items")
            result = await self.db.execute(
                select(Food_items)
                .where(getattr(Food_items, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Food_items.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching food_itemss by {field_name}: {str(e)}")
            raise