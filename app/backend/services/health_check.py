import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.health_check import Health_check

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Health_checkService:
    """Service layer for Health_check operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Health_check]:
        """Create a new health_check"""
        try:
            obj = Health_check(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created health_check with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating health_check: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Health_check]:
        """Get health_check by ID"""
        try:
            query = select(Health_check).where(Health_check.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching health_check {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of health_checks"""
        try:
            query = select(Health_check)
            count_query = select(func.count(Health_check.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Health_check, field):
                        query = query.where(getattr(Health_check, field) == value)
                        count_query = count_query.where(getattr(Health_check, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Health_check, field_name):
                        query = query.order_by(getattr(Health_check, field_name).desc())
                else:
                    if hasattr(Health_check, sort):
                        query = query.order_by(getattr(Health_check, sort))
            else:
                query = query.order_by(Health_check.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching health_check list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Health_check]:
        """Update health_check"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Health_check {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated health_check {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating health_check {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete health_check"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Health_check {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted health_check {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting health_check {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Health_check]:
        """Get health_check by any field"""
        try:
            if not hasattr(Health_check, field_name):
                raise ValueError(f"Field {field_name} does not exist on Health_check")
            result = await self.db.execute(
                select(Health_check).where(getattr(Health_check, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching health_check by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Health_check]:
        """Get list of health_checks filtered by field"""
        try:
            if not hasattr(Health_check, field_name):
                raise ValueError(f"Field {field_name} does not exist on Health_check")
            result = await self.db.execute(
                select(Health_check)
                .where(getattr(Health_check, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Health_check.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching health_checks by {field_name}: {str(e)}")
            raise