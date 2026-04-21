import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.become_master_requests import Become_master_requests

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Become_master_requestsService:
    """Service layer for Become_master_requests operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Become_master_requests]:
        """Create a new become_master_requests"""
        try:
            obj = Become_master_requests(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created become_master_requests with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating become_master_requests: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Become_master_requests]:
        """Get become_master_requests by ID"""
        try:
            query = select(Become_master_requests).where(Become_master_requests.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching become_master_requests {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of become_master_requestss"""
        try:
            query = select(Become_master_requests)
            count_query = select(func.count(Become_master_requests.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Become_master_requests, field):
                        query = query.where(getattr(Become_master_requests, field) == value)
                        count_query = count_query.where(getattr(Become_master_requests, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Become_master_requests, field_name):
                        query = query.order_by(getattr(Become_master_requests, field_name).desc())
                else:
                    if hasattr(Become_master_requests, sort):
                        query = query.order_by(getattr(Become_master_requests, sort))
            else:
                query = query.order_by(Become_master_requests.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching become_master_requests list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Become_master_requests]:
        """Update become_master_requests"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Become_master_requests {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated become_master_requests {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating become_master_requests {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete become_master_requests"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Become_master_requests {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted become_master_requests {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting become_master_requests {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Become_master_requests]:
        """Get become_master_requests by any field"""
        try:
            if not hasattr(Become_master_requests, field_name):
                raise ValueError(f"Field {field_name} does not exist on Become_master_requests")
            result = await self.db.execute(
                select(Become_master_requests).where(getattr(Become_master_requests, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching become_master_requests by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Become_master_requests]:
        """Get list of become_master_requestss filtered by field"""
        try:
            if not hasattr(Become_master_requests, field_name):
                raise ValueError(f"Field {field_name} does not exist on Become_master_requests")
            result = await self.db.execute(
                select(Become_master_requests)
                .where(getattr(Become_master_requests, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Become_master_requests.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching become_master_requestss by {field_name}: {str(e)}")
            raise