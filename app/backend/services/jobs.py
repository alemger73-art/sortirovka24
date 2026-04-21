import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.jobs import Jobs

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class JobsService:
    """Service layer for Jobs operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Jobs]:
        """Create a new jobs"""
        try:
            obj = Jobs(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created jobs with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating jobs: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Jobs]:
        """Get jobs by ID"""
        try:
            query = select(Jobs).where(Jobs.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching jobs {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of jobss"""
        try:
            query = select(Jobs)
            count_query = select(func.count(Jobs.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Jobs, field):
                        query = query.where(getattr(Jobs, field) == value)
                        count_query = count_query.where(getattr(Jobs, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Jobs, field_name):
                        query = query.order_by(getattr(Jobs, field_name).desc())
                else:
                    if hasattr(Jobs, sort):
                        query = query.order_by(getattr(Jobs, sort))
            else:
                query = query.order_by(Jobs.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching jobs list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Jobs]:
        """Update jobs"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Jobs {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated jobs {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating jobs {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete jobs"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Jobs {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted jobs {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting jobs {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Jobs]:
        """Get jobs by any field"""
        try:
            if not hasattr(Jobs, field_name):
                raise ValueError(f"Field {field_name} does not exist on Jobs")
            result = await self.db.execute(
                select(Jobs).where(getattr(Jobs, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching jobs by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Jobs]:
        """Get list of jobss filtered by field"""
        try:
            if not hasattr(Jobs, field_name):
                raise ValueError(f"Field {field_name} does not exist on Jobs")
            result = await self.db.execute(
                select(Jobs)
                .where(getattr(Jobs, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Jobs.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching jobss by {field_name}: {str(e)}")
            raise