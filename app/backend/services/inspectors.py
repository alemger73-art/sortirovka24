import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.inspectors import Inspectors

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class InspectorsService:
    """Service layer for Inspectors operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Inspectors]:
        """Create a new inspectors"""
        try:
            obj = Inspectors(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created inspectors with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating inspectors: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Inspectors]:
        """Get inspectors by ID"""
        try:
            query = select(Inspectors).where(Inspectors.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching inspectors {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of inspectorss"""
        try:
            query = select(Inspectors)
            count_query = select(func.count(Inspectors.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Inspectors, field):
                        query = query.where(getattr(Inspectors, field) == value)
                        count_query = count_query.where(getattr(Inspectors, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Inspectors, field_name):
                        query = query.order_by(getattr(Inspectors, field_name).desc())
                else:
                    if hasattr(Inspectors, sort):
                        query = query.order_by(getattr(Inspectors, sort))
            else:
                query = query.order_by(Inspectors.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching inspectors list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Inspectors]:
        """Update inspectors"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Inspectors {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated inspectors {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating inspectors {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete inspectors"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Inspectors {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted inspectors {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting inspectors {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Inspectors]:
        """Get inspectors by any field"""
        try:
            if not hasattr(Inspectors, field_name):
                raise ValueError(f"Field {field_name} does not exist on Inspectors")
            result = await self.db.execute(
                select(Inspectors).where(getattr(Inspectors, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching inspectors by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Inspectors]:
        """Get list of inspectorss filtered by field"""
        try:
            if not hasattr(Inspectors, field_name):
                raise ValueError(f"Field {field_name} does not exist on Inspectors")
            result = await self.db.execute(
                select(Inspectors)
                .where(getattr(Inspectors, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Inspectors.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching inspectorss by {field_name}: {str(e)}")
            raise