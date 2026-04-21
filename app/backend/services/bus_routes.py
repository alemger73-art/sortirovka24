import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.bus_routes import Bus_routes

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Bus_routesService:
    """Service layer for Bus_routes operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Bus_routes]:
        """Create a new bus_routes"""
        try:
            obj = Bus_routes(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created bus_routes with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating bus_routes: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Bus_routes]:
        """Get bus_routes by ID"""
        try:
            query = select(Bus_routes).where(Bus_routes.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bus_routes {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of bus_routess"""
        try:
            query = select(Bus_routes)
            count_query = select(func.count(Bus_routes.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Bus_routes, field):
                        query = query.where(getattr(Bus_routes, field) == value)
                        count_query = count_query.where(getattr(Bus_routes, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Bus_routes, field_name):
                        query = query.order_by(getattr(Bus_routes, field_name).desc())
                else:
                    if hasattr(Bus_routes, sort):
                        query = query.order_by(getattr(Bus_routes, sort))
            else:
                query = query.order_by(Bus_routes.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching bus_routes list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Bus_routes]:
        """Update bus_routes"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Bus_routes {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated bus_routes {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating bus_routes {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete bus_routes"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Bus_routes {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted bus_routes {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting bus_routes {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Bus_routes]:
        """Get bus_routes by any field"""
        try:
            if not hasattr(Bus_routes, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bus_routes")
            result = await self.db.execute(
                select(Bus_routes).where(getattr(Bus_routes, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bus_routes by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Bus_routes]:
        """Get list of bus_routess filtered by field"""
        try:
            if not hasattr(Bus_routes, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bus_routes")
            result = await self.db.execute(
                select(Bus_routes)
                .where(getattr(Bus_routes, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Bus_routes.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching bus_routess by {field_name}: {str(e)}")
            raise