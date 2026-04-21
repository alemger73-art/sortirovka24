import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.item_modifier_groups import Item_modifier_groups

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Item_modifier_groupsService:
    """Service layer for Item_modifier_groups operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Item_modifier_groups]:
        """Create a new item_modifier_groups"""
        try:
            obj = Item_modifier_groups(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created item_modifier_groups with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating item_modifier_groups: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Item_modifier_groups]:
        """Get item_modifier_groups by ID"""
        try:
            query = select(Item_modifier_groups).where(Item_modifier_groups.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching item_modifier_groups {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of item_modifier_groupss"""
        try:
            query = select(Item_modifier_groups)
            count_query = select(func.count(Item_modifier_groups.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Item_modifier_groups, field):
                        query = query.where(getattr(Item_modifier_groups, field) == value)
                        count_query = count_query.where(getattr(Item_modifier_groups, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Item_modifier_groups, field_name):
                        query = query.order_by(getattr(Item_modifier_groups, field_name).desc())
                else:
                    if hasattr(Item_modifier_groups, sort):
                        query = query.order_by(getattr(Item_modifier_groups, sort))
            else:
                query = query.order_by(Item_modifier_groups.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching item_modifier_groups list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Item_modifier_groups]:
        """Update item_modifier_groups"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Item_modifier_groups {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated item_modifier_groups {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating item_modifier_groups {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete item_modifier_groups"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Item_modifier_groups {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted item_modifier_groups {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting item_modifier_groups {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Item_modifier_groups]:
        """Get item_modifier_groups by any field"""
        try:
            if not hasattr(Item_modifier_groups, field_name):
                raise ValueError(f"Field {field_name} does not exist on Item_modifier_groups")
            result = await self.db.execute(
                select(Item_modifier_groups).where(getattr(Item_modifier_groups, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching item_modifier_groups by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Item_modifier_groups]:
        """Get list of item_modifier_groupss filtered by field"""
        try:
            if not hasattr(Item_modifier_groups, field_name):
                raise ValueError(f"Field {field_name} does not exist on Item_modifier_groups")
            result = await self.db.execute(
                select(Item_modifier_groups)
                .where(getattr(Item_modifier_groups, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Item_modifier_groups.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching item_modifier_groupss by {field_name}: {str(e)}")
            raise