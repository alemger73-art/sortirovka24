import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.master_requests import Master_requests

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Master_requestsService:
    """Service layer for Master_requests operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Master_requests]:
        """Create a new master_requests"""
        try:
            obj = Master_requests(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created master_requests with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating master_requests: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Master_requests]:
        """Get master_requests by ID"""
        try:
            query = select(Master_requests).where(Master_requests.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching master_requests {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of master_requestss"""
        try:
            query = select(Master_requests)
            count_query = select(func.count(Master_requests.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Master_requests, field):
                        query = query.where(getattr(Master_requests, field) == value)
                        count_query = count_query.where(getattr(Master_requests, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Master_requests, field_name):
                        query = query.order_by(getattr(Master_requests, field_name).desc())
                else:
                    if hasattr(Master_requests, sort):
                        query = query.order_by(getattr(Master_requests, sort))
            else:
                query = query.order_by(Master_requests.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching master_requests list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Master_requests]:
        """Update master_requests"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Master_requests {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated master_requests {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating master_requests {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete master_requests"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Master_requests {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted master_requests {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting master_requests {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Master_requests]:
        """Get master_requests by any field"""
        try:
            if not hasattr(Master_requests, field_name):
                raise ValueError(f"Field {field_name} does not exist on Master_requests")
            result = await self.db.execute(
                select(Master_requests).where(getattr(Master_requests, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching master_requests by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Master_requests]:
        """Get list of master_requestss filtered by field"""
        try:
            if not hasattr(Master_requests, field_name):
                raise ValueError(f"Field {field_name} does not exist on Master_requests")
            result = await self.db.execute(
                select(Master_requests)
                .where(getattr(Master_requests, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Master_requests.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching master_requestss by {field_name}: {str(e)}")
            raise