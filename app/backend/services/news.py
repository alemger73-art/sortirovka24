import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.news import News

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class NewsService:
    """Service layer for News operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _normalize_payload(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Keep only model columns and drop None values to avoid constructor
        errors when frontend/SDK sends optional or unknown fields.
        """
        if not data:
            return {}
        allowed = set(News.__table__.columns.keys())
        return {k: v for k, v in data.items() if k in allowed and v is not None}

    async def create(self, data: Dict[str, Any]) -> Optional[News]:
        """Create a new news"""
        try:
            payload = self._normalize_payload(data)
            obj = News(**payload)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created news with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating news: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[News]:
        """Get news by ID"""
        try:
            query = select(News).where(News.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching news {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of newss"""
        try:
            query = select(News)
            count_query = select(func.count(News.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(News, field):
                        query = query.where(getattr(News, field) == value)
                        count_query = count_query.where(getattr(News, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(News, field_name):
                        query = query.order_by(getattr(News, field_name).desc())
                else:
                    if hasattr(News, sort):
                        query = query.order_by(getattr(News, sort))
            else:
                query = query.order_by(News.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching news list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[News]:
        """Update news"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"News {obj_id} not found for update")
                return None
            payload = self._normalize_payload(update_data)
            for key, value in payload.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated news {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating news {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete news"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"News {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted news {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting news {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[News]:
        """Get news by any field"""
        try:
            if not hasattr(News, field_name):
                raise ValueError(f"Field {field_name} does not exist on News")
            result = await self.db.execute(
                select(News).where(getattr(News, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching news by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[News]:
        """Get list of newss filtered by field"""
        try:
            if not hasattr(News, field_name):
                raise ValueError(f"Field {field_name} does not exist on News")
            result = await self.db.execute(
                select(News)
                .where(getattr(News, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(News.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching newss by {field_name}: {str(e)}")
            raise