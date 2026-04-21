import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.park_points import Park_points

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Park_pointsService:
    """Service layer for Park_points operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Park_points]:
        """Create a new park_points"""
        try:
            obj = Park_points(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created park_points with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating park_points: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Park_points]:
        """Get park_points by ID"""
        try:
            query = select(Park_points).where(Park_points.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching park_points {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of park_pointss"""
        try:
            query = select(Park_points)
            count_query = select(func.count(Park_points.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Park_points, field):
                        query = query.where(getattr(Park_points, field) == value)
                        count_query = count_query.where(getattr(Park_points, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Park_points, field_name):
                        query = query.order_by(getattr(Park_points, field_name).desc())
                else:
                    if hasattr(Park_points, sort):
                        query = query.order_by(getattr(Park_points, sort))
            else:
                query = query.order_by(Park_points.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching park_points list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Park_points]:
        """Update park_points"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Park_points {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated park_points {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating park_points {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete park_points"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Park_points {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted park_points {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting park_points {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Park_points]:
        """Get park_points by any field"""
        try:
            if not hasattr(Park_points, field_name):
                raise ValueError(f"Field {field_name} does not exist on Park_points")
            result = await self.db.execute(
                select(Park_points).where(getattr(Park_points, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching park_points by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Park_points]:
        """Get list of park_pointss filtered by field"""
        try:
            if not hasattr(Park_points, field_name):
                raise ValueError(f"Field {field_name} does not exist on Park_points")
            result = await self.db.execute(
                select(Park_points)
                .where(getattr(Park_points, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Park_points.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching park_pointss by {field_name}: {str(e)}")
            raise