import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.complaints import Complaints

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class ComplaintsService:
    """Service layer for Complaints operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Complaints]:
        """Create a new complaints"""
        try:
            obj = Complaints(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created complaints with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating complaints: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Complaints]:
        """Get complaints by ID"""
        try:
            query = select(Complaints).where(Complaints.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching complaints {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of complaintss"""
        try:
            query = select(Complaints)
            count_query = select(func.count(Complaints.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Complaints, field):
                        query = query.where(getattr(Complaints, field) == value)
                        count_query = count_query.where(getattr(Complaints, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Complaints, field_name):
                        query = query.order_by(getattr(Complaints, field_name).desc())
                else:
                    if hasattr(Complaints, sort):
                        query = query.order_by(getattr(Complaints, sort))
            else:
                query = query.order_by(Complaints.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching complaints list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Complaints]:
        """Update complaints"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Complaints {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated complaints {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating complaints {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete complaints"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Complaints {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted complaints {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting complaints {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Complaints]:
        """Get complaints by any field"""
        try:
            if not hasattr(Complaints, field_name):
                raise ValueError(f"Field {field_name} does not exist on Complaints")
            result = await self.db.execute(
                select(Complaints).where(getattr(Complaints, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching complaints by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Complaints]:
        """Get list of complaintss filtered by field"""
        try:
            if not hasattr(Complaints, field_name):
                raise ValueError(f"Field {field_name} does not exist on Complaints")
            result = await self.db.execute(
                select(Complaints)
                .where(getattr(Complaints, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Complaints.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching complaintss by {field_name}: {str(e)}")
            raise