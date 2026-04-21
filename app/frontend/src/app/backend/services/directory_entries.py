import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.directory_entries import Directory_entries

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Directory_entriesService:
    """Service layer for Directory_entries operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Directory_entries]:
        """Create a new directory_entries"""
        try:
            obj = Directory_entries(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created directory_entries with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating directory_entries: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Directory_entries]:
        """Get directory_entries by ID"""
        try:
            query = select(Directory_entries).where(Directory_entries.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching directory_entries {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of directory_entriess"""
        try:
            query = select(Directory_entries)
            count_query = select(func.count(Directory_entries.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Directory_entries, field):
                        query = query.where(getattr(Directory_entries, field) == value)
                        count_query = count_query.where(getattr(Directory_entries, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Directory_entries, field_name):
                        query = query.order_by(getattr(Directory_entries, field_name).desc())
                else:
                    if hasattr(Directory_entries, sort):
                        query = query.order_by(getattr(Directory_entries, sort))
            else:
                query = query.order_by(Directory_entries.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching directory_entries list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Directory_entries]:
        """Update directory_entries"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Directory_entries {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated directory_entries {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating directory_entries {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete directory_entries"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Directory_entries {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted directory_entries {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting directory_entries {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Directory_entries]:
        """Get directory_entries by any field"""
        try:
            if not hasattr(Directory_entries, field_name):
                raise ValueError(f"Field {field_name} does not exist on Directory_entries")
            result = await self.db.execute(
                select(Directory_entries).where(getattr(Directory_entries, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching directory_entries by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Directory_entries]:
        """Get list of directory_entriess filtered by field"""
        try:
            if not hasattr(Directory_entries, field_name):
                raise ValueError(f"Field {field_name} does not exist on Directory_entries")
            result = await self.db.execute(
                select(Directory_entries)
                .where(getattr(Directory_entries, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Directory_entries.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching directory_entriess by {field_name}: {str(e)}")
            raise