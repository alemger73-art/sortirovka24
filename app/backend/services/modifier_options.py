import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.modifier_options import Modifier_options

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Modifier_optionsService:
    """Service layer for Modifier_options operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Modifier_options]:
        """Create a new modifier_options"""
        try:
            obj = Modifier_options(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created modifier_options with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating modifier_options: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Modifier_options]:
        """Get modifier_options by ID"""
        try:
            query = select(Modifier_options).where(Modifier_options.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching modifier_options {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of modifier_optionss"""
        try:
            query = select(Modifier_options)
            count_query = select(func.count(Modifier_options.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Modifier_options, field):
                        query = query.where(getattr(Modifier_options, field) == value)
                        count_query = count_query.where(getattr(Modifier_options, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Modifier_options, field_name):
                        query = query.order_by(getattr(Modifier_options, field_name).desc())
                else:
                    if hasattr(Modifier_options, sort):
                        query = query.order_by(getattr(Modifier_options, sort))
            else:
                query = query.order_by(Modifier_options.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching modifier_options list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Modifier_options]:
        """Update modifier_options"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Modifier_options {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated modifier_options {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating modifier_options {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete modifier_options"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Modifier_options {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted modifier_options {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting modifier_options {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Modifier_options]:
        """Get modifier_options by any field"""
        try:
            if not hasattr(Modifier_options, field_name):
                raise ValueError(f"Field {field_name} does not exist on Modifier_options")
            result = await self.db.execute(
                select(Modifier_options).where(getattr(Modifier_options, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching modifier_options by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Modifier_options]:
        """Get list of modifier_optionss filtered by field"""
        try:
            if not hasattr(Modifier_options, field_name):
                raise ValueError(f"Field {field_name} does not exist on Modifier_options")
            result = await self.db.execute(
                select(Modifier_options)
                .where(getattr(Modifier_options, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Modifier_options.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching modifier_optionss by {field_name}: {str(e)}")
            raise