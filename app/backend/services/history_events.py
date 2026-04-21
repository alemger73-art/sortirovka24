import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.history_events import History_events

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class History_eventsService:
    """Service layer for History_events operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[History_events]:
        """Create a new history_events"""
        try:
            obj = History_events(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created history_events with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating history_events: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[History_events]:
        """Get history_events by ID"""
        try:
            query = select(History_events).where(History_events.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching history_events {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of history_eventss"""
        try:
            query = select(History_events)
            count_query = select(func.count(History_events.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(History_events, field):
                        query = query.where(getattr(History_events, field) == value)
                        count_query = count_query.where(getattr(History_events, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(History_events, field_name):
                        query = query.order_by(getattr(History_events, field_name).desc())
                else:
                    if hasattr(History_events, sort):
                        query = query.order_by(getattr(History_events, sort))
            else:
                query = query.order_by(History_events.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching history_events list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[History_events]:
        """Update history_events"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"History_events {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated history_events {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating history_events {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete history_events"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"History_events {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted history_events {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting history_events {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[History_events]:
        """Get history_events by any field"""
        try:
            if not hasattr(History_events, field_name):
                raise ValueError(f"Field {field_name} does not exist on History_events")
            result = await self.db.execute(
                select(History_events).where(getattr(History_events, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching history_events by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[History_events]:
        """Get list of history_eventss filtered by field"""
        try:
            if not hasattr(History_events, field_name):
                raise ValueError(f"Field {field_name} does not exist on History_events")
            result = await self.db.execute(
                select(History_events)
                .where(getattr(History_events, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(History_events.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching history_eventss by {field_name}: {str(e)}")
            raise