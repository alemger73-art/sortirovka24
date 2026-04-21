import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.real_estate import Real_estate

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Real_estateService:
    """Service layer for Real_estate operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Real_estate]:
        """Create a new real_estate"""
        try:
            obj = Real_estate(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created real_estate with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating real_estate: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Real_estate]:
        """Get real_estate by ID"""
        try:
            query = select(Real_estate).where(Real_estate.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching real_estate {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of real_estates"""
        try:
            query = select(Real_estate)
            count_query = select(func.count(Real_estate.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Real_estate, field):
                        query = query.where(getattr(Real_estate, field) == value)
                        count_query = count_query.where(getattr(Real_estate, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Real_estate, field_name):
                        query = query.order_by(getattr(Real_estate, field_name).desc())
                else:
                    if hasattr(Real_estate, sort):
                        query = query.order_by(getattr(Real_estate, sort))
            else:
                query = query.order_by(Real_estate.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching real_estate list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Real_estate]:
        """Update real_estate"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Real_estate {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated real_estate {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating real_estate {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete real_estate"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Real_estate {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted real_estate {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting real_estate {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Real_estate]:
        """Get real_estate by any field"""
        try:
            if not hasattr(Real_estate, field_name):
                raise ValueError(f"Field {field_name} does not exist on Real_estate")
            result = await self.db.execute(
                select(Real_estate).where(getattr(Real_estate, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching real_estate by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Real_estate]:
        """Get list of real_estates filtered by field"""
        try:
            if not hasattr(Real_estate, field_name):
                raise ValueError(f"Field {field_name} does not exist on Real_estate")
            result = await self.db.execute(
                select(Real_estate)
                .where(getattr(Real_estate, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Real_estate.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching real_estates by {field_name}: {str(e)}")
            raise