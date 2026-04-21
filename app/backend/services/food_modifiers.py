import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.food_modifiers import Food_modifiers

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Food_modifiersService:
    """Service layer for Food_modifiers operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Food_modifiers]:
        """Create a new food_modifiers"""
        try:
            obj = Food_modifiers(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created food_modifiers with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating food_modifiers: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Food_modifiers]:
        """Get food_modifiers by ID"""
        try:
            query = select(Food_modifiers).where(Food_modifiers.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_modifiers {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of food_modifierss"""
        try:
            query = select(Food_modifiers)
            count_query = select(func.count(Food_modifiers.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Food_modifiers, field):
                        query = query.where(getattr(Food_modifiers, field) == value)
                        count_query = count_query.where(getattr(Food_modifiers, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Food_modifiers, field_name):
                        query = query.order_by(getattr(Food_modifiers, field_name).desc())
                else:
                    if hasattr(Food_modifiers, sort):
                        query = query.order_by(getattr(Food_modifiers, sort))
            else:
                query = query.order_by(Food_modifiers.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching food_modifiers list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Food_modifiers]:
        """Update food_modifiers"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_modifiers {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated food_modifiers {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating food_modifiers {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete food_modifiers"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_modifiers {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted food_modifiers {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting food_modifiers {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Food_modifiers]:
        """Get food_modifiers by any field"""
        try:
            if not hasattr(Food_modifiers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_modifiers")
            result = await self.db.execute(
                select(Food_modifiers).where(getattr(Food_modifiers, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_modifiers by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Food_modifiers]:
        """Get list of food_modifierss filtered by field"""
        try:
            if not hasattr(Food_modifiers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_modifiers")
            result = await self.db.execute(
                select(Food_modifiers)
                .where(getattr(Food_modifiers, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Food_modifiers.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching food_modifierss by {field_name}: {str(e)}")
            raise