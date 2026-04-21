import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.homepage_stats import Homepage_stats

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Homepage_statsService:
    """Service layer for Homepage_stats operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Homepage_stats]:
        """Create a new homepage_stats"""
        try:
            obj = Homepage_stats(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created homepage_stats with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating homepage_stats: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Homepage_stats]:
        """Get homepage_stats by ID"""
        try:
            query = select(Homepage_stats).where(Homepage_stats.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching homepage_stats {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of homepage_statss"""
        try:
            query = select(Homepage_stats)
            count_query = select(func.count(Homepage_stats.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Homepage_stats, field):
                        query = query.where(getattr(Homepage_stats, field) == value)
                        count_query = count_query.where(getattr(Homepage_stats, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Homepage_stats, field_name):
                        query = query.order_by(getattr(Homepage_stats, field_name).desc())
                else:
                    if hasattr(Homepage_stats, sort):
                        query = query.order_by(getattr(Homepage_stats, sort))
            else:
                query = query.order_by(Homepage_stats.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching homepage_stats list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Homepage_stats]:
        """Update homepage_stats"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Homepage_stats {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated homepage_stats {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating homepage_stats {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete homepage_stats"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Homepage_stats {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted homepage_stats {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting homepage_stats {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Homepage_stats]:
        """Get homepage_stats by any field"""
        try:
            if not hasattr(Homepage_stats, field_name):
                raise ValueError(f"Field {field_name} does not exist on Homepage_stats")
            result = await self.db.execute(
                select(Homepage_stats).where(getattr(Homepage_stats, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching homepage_stats by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Homepage_stats]:
        """Get list of homepage_statss filtered by field"""
        try:
            if not hasattr(Homepage_stats, field_name):
                raise ValueError(f"Field {field_name} does not exist on Homepage_stats")
            result = await self.db.execute(
                select(Homepage_stats)
                .where(getattr(Homepage_stats, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Homepage_stats.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching homepage_statss by {field_name}: {str(e)}")
            raise