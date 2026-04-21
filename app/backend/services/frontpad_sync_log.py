import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.frontpad_sync_log import Frontpad_sync_log

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Frontpad_sync_logService:
    """Service layer for Frontpad_sync_log operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Frontpad_sync_log]:
        """Create a new frontpad_sync_log"""
        try:
            obj = Frontpad_sync_log(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created frontpad_sync_log with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating frontpad_sync_log: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Frontpad_sync_log]:
        """Get frontpad_sync_log by ID"""
        try:
            query = select(Frontpad_sync_log).where(Frontpad_sync_log.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching frontpad_sync_log {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of frontpad_sync_logs"""
        try:
            query = select(Frontpad_sync_log)
            count_query = select(func.count(Frontpad_sync_log.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Frontpad_sync_log, field):
                        query = query.where(getattr(Frontpad_sync_log, field) == value)
                        count_query = count_query.where(getattr(Frontpad_sync_log, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Frontpad_sync_log, field_name):
                        query = query.order_by(getattr(Frontpad_sync_log, field_name).desc())
                else:
                    if hasattr(Frontpad_sync_log, sort):
                        query = query.order_by(getattr(Frontpad_sync_log, sort))
            else:
                query = query.order_by(Frontpad_sync_log.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching frontpad_sync_log list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Frontpad_sync_log]:
        """Update frontpad_sync_log"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Frontpad_sync_log {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated frontpad_sync_log {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating frontpad_sync_log {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete frontpad_sync_log"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Frontpad_sync_log {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted frontpad_sync_log {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting frontpad_sync_log {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Frontpad_sync_log]:
        """Get frontpad_sync_log by any field"""
        try:
            if not hasattr(Frontpad_sync_log, field_name):
                raise ValueError(f"Field {field_name} does not exist on Frontpad_sync_log")
            result = await self.db.execute(
                select(Frontpad_sync_log).where(getattr(Frontpad_sync_log, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching frontpad_sync_log by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Frontpad_sync_log]:
        """Get list of frontpad_sync_logs filtered by field"""
        try:
            if not hasattr(Frontpad_sync_log, field_name):
                raise ValueError(f"Field {field_name} does not exist on Frontpad_sync_log")
            result = await self.db.execute(
                select(Frontpad_sync_log)
                .where(getattr(Frontpad_sync_log, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Frontpad_sync_log.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching frontpad_sync_logs by {field_name}: {str(e)}")
            raise