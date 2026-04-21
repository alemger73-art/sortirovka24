import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.banners import Banners

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class BannersService:
    """Service layer for Banners operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Banners]:
        """Create a new banners"""
        try:
            obj = Banners(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created banners with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating banners: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Banners]:
        """Get banners by ID"""
        try:
            query = select(Banners).where(Banners.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching banners {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of bannerss"""
        try:
            query = select(Banners)
            count_query = select(func.count(Banners.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Banners, field):
                        query = query.where(getattr(Banners, field) == value)
                        count_query = count_query.where(getattr(Banners, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Banners, field_name):
                        query = query.order_by(getattr(Banners, field_name).desc())
                else:
                    if hasattr(Banners, sort):
                        query = query.order_by(getattr(Banners, sort))
            else:
                query = query.order_by(Banners.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching banners list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Banners]:
        """Update banners"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Banners {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated banners {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating banners {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete banners"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Banners {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted banners {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting banners {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Banners]:
        """Get banners by any field"""
        try:
            if not hasattr(Banners, field_name):
                raise ValueError(f"Field {field_name} does not exist on Banners")
            result = await self.db.execute(
                select(Banners).where(getattr(Banners, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching banners by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Banners]:
        """Get list of bannerss filtered by field"""
        try:
            if not hasattr(Banners, field_name):
                raise ValueError(f"Field {field_name} does not exist on Banners")
            result = await self.db.execute(
                select(Banners)
                .where(getattr(Banners, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Banners.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching bannerss by {field_name}: {str(e)}")
            raise