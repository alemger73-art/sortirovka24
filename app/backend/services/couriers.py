import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.couriers import Couriers

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class CouriersService:
    """Service layer for Couriers operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Couriers]:
        """Create a new couriers"""
        try:
            obj = Couriers(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created couriers with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating couriers: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Couriers]:
        """Get couriers by ID"""
        try:
            query = select(Couriers).where(Couriers.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching couriers {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of courierss"""
        try:
            query = select(Couriers)
            count_query = select(func.count(Couriers.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Couriers, field):
                        query = query.where(getattr(Couriers, field) == value)
                        count_query = count_query.where(getattr(Couriers, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Couriers, field_name):
                        query = query.order_by(getattr(Couriers, field_name).desc())
                else:
                    if hasattr(Couriers, sort):
                        query = query.order_by(getattr(Couriers, sort))
            else:
                query = query.order_by(Couriers.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching couriers list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Couriers]:
        """Update couriers"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Couriers {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated couriers {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating couriers {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete couriers"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Couriers {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted couriers {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting couriers {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Couriers]:
        """Get couriers by any field"""
        try:
            if not hasattr(Couriers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Couriers")
            result = await self.db.execute(
                select(Couriers).where(getattr(Couriers, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching couriers by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Couriers]:
        """Get list of courierss filtered by field"""
        try:
            if not hasattr(Couriers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Couriers")
            result = await self.db.execute(
                select(Couriers)
                .where(getattr(Couriers, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Couriers.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching courierss by {field_name}: {str(e)}")
            raise