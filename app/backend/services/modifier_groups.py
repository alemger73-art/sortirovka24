import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.modifier_groups import Modifier_groups

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Modifier_groupsService:
    """Service layer for Modifier_groups operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Modifier_groups]:
        """Create a new modifier_groups"""
        try:
            obj = Modifier_groups(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created modifier_groups with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating modifier_groups: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Modifier_groups]:
        """Get modifier_groups by ID"""
        try:
            query = select(Modifier_groups).where(Modifier_groups.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching modifier_groups {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of modifier_groupss"""
        try:
            query = select(Modifier_groups)
            count_query = select(func.count(Modifier_groups.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Modifier_groups, field):
                        query = query.where(getattr(Modifier_groups, field) == value)
                        count_query = count_query.where(getattr(Modifier_groups, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Modifier_groups, field_name):
                        query = query.order_by(getattr(Modifier_groups, field_name).desc())
                else:
                    if hasattr(Modifier_groups, sort):
                        query = query.order_by(getattr(Modifier_groups, sort))
            else:
                query = query.order_by(Modifier_groups.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching modifier_groups list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Modifier_groups]:
        """Update modifier_groups"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Modifier_groups {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated modifier_groups {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating modifier_groups {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete modifier_groups"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Modifier_groups {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted modifier_groups {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting modifier_groups {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Modifier_groups]:
        """Get modifier_groups by any field"""
        try:
            if not hasattr(Modifier_groups, field_name):
                raise ValueError(f"Field {field_name} does not exist on Modifier_groups")
            result = await self.db.execute(
                select(Modifier_groups).where(getattr(Modifier_groups, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching modifier_groups by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Modifier_groups]:
        """Get list of modifier_groupss filtered by field"""
        try:
            if not hasattr(Modifier_groups, field_name):
                raise ValueError(f"Field {field_name} does not exist on Modifier_groups")
            result = await self.db.execute(
                select(Modifier_groups)
                .where(getattr(Modifier_groups, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Modifier_groups.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching modifier_groupss by {field_name}: {str(e)}")
            raise