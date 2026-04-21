import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.bus_stops import Bus_stops

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Bus_stopsService:
    """Service layer for Bus_stops operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Bus_stops]:
        """Create a new bus_stops"""
        try:
            obj = Bus_stops(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created bus_stops with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating bus_stops: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Bus_stops]:
        """Get bus_stops by ID"""
        try:
            query = select(Bus_stops).where(Bus_stops.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bus_stops {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of bus_stopss"""
        try:
            query = select(Bus_stops)
            count_query = select(func.count(Bus_stops.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Bus_stops, field):
                        query = query.where(getattr(Bus_stops, field) == value)
                        count_query = count_query.where(getattr(Bus_stops, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Bus_stops, field_name):
                        query = query.order_by(getattr(Bus_stops, field_name).desc())
                else:
                    if hasattr(Bus_stops, sort):
                        query = query.order_by(getattr(Bus_stops, sort))
            else:
                query = query.order_by(Bus_stops.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching bus_stops list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Bus_stops]:
        """Update bus_stops"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Bus_stops {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated bus_stops {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating bus_stops {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete bus_stops"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Bus_stops {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted bus_stops {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting bus_stops {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Bus_stops]:
        """Get bus_stops by any field"""
        try:
            if not hasattr(Bus_stops, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bus_stops")
            result = await self.db.execute(
                select(Bus_stops).where(getattr(Bus_stops, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bus_stops by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Bus_stops]:
        """Get list of bus_stopss filtered by field"""
        try:
            if not hasattr(Bus_stops, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bus_stops")
            result = await self.db.execute(
                select(Bus_stops)
                .where(getattr(Bus_stops, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Bus_stops.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching bus_stopss by {field_name}: {str(e)}")
            raise