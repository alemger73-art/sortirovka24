import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.bus_notifications import Bus_notifications

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Bus_notificationsService:
    """Service layer for Bus_notifications operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Bus_notifications]:
        """Create a new bus_notifications"""
        try:
            obj = Bus_notifications(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created bus_notifications with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating bus_notifications: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Bus_notifications]:
        """Get bus_notifications by ID"""
        try:
            query = select(Bus_notifications).where(Bus_notifications.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bus_notifications {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of bus_notificationss"""
        try:
            query = select(Bus_notifications)
            count_query = select(func.count(Bus_notifications.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Bus_notifications, field):
                        query = query.where(getattr(Bus_notifications, field) == value)
                        count_query = count_query.where(getattr(Bus_notifications, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Bus_notifications, field_name):
                        query = query.order_by(getattr(Bus_notifications, field_name).desc())
                else:
                    if hasattr(Bus_notifications, sort):
                        query = query.order_by(getattr(Bus_notifications, sort))
            else:
                query = query.order_by(Bus_notifications.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching bus_notifications list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Bus_notifications]:
        """Update bus_notifications"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Bus_notifications {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated bus_notifications {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating bus_notifications {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete bus_notifications"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Bus_notifications {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted bus_notifications {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting bus_notifications {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Bus_notifications]:
        """Get bus_notifications by any field"""
        try:
            if not hasattr(Bus_notifications, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bus_notifications")
            result = await self.db.execute(
                select(Bus_notifications).where(getattr(Bus_notifications, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bus_notifications by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Bus_notifications]:
        """Get list of bus_notificationss filtered by field"""
        try:
            if not hasattr(Bus_notifications, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bus_notifications")
            result = await self.db.execute(
                select(Bus_notifications)
                .where(getattr(Bus_notifications, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Bus_notifications.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching bus_notificationss by {field_name}: {str(e)}")
            raise