import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from models.salons import Salons

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class SalonsService:
    """Service layer for Salons operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Salons]:
        """Create a new salon"""
        try:
            _allowed = set(Salons.__table__.columns.keys())
            obj = Salons(**{k: v for k, v in data.items() if k in _allowed})
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created salon with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating salon: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Salons]:
        """Get salon by ID"""
        try:
            query = select(Salons).where(Salons.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching salon {obj_id}: {str(e)}")
            raise

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of salons"""
        try:
            query = select(Salons)
            count_query = select(func.count(Salons.id))

            if query_dict:
                search_q = query_dict.pop("q", None) or query_dict.pop("_q", None)
                if search_q and str(search_q).strip():
                    pattern = f"%{str(search_q).strip().lower()}%"
                    search_filter = or_(
                        func.lower(Salons.name).like(pattern),
                        func.lower(Salons.description).like(pattern),
                        func.lower(Salons.services).like(pattern),
                        func.lower(Salons.category).like(pattern),
                        func.lower(Salons.district).like(pattern),
                        func.lower(Salons.address).like(pattern),
                    )
                    query = query.where(search_filter)
                    count_query = count_query.where(search_filter)
                for field, value in query_dict.items():
                    if hasattr(Salons, field):
                        query = query.where(getattr(Salons, field) == value)
                        count_query = count_query.where(getattr(Salons, field) == value)

            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Salons, field_name):
                        query = query.order_by(getattr(Salons, field_name).desc())
                else:
                    if hasattr(Salons, sort):
                        query = query.order_by(getattr(Salons, sort))
            else:
                query = query.order_by(Salons.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching salons list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Salons]:
        """Update salon"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Salon {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated salon {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating salon {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete salon"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Salon {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted salon {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting salon {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Salons]:
        """Get salon by any field"""
        try:
            if not hasattr(Salons, field_name):
                raise ValueError(f"Field {field_name} does not exist on Salons")
            result = await self.db.execute(
                select(Salons).where(getattr(Salons, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching salon by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Salons]:
        """Get list of salons filtered by field"""
        try:
            if not hasattr(Salons, field_name):
                raise ValueError(f"Field {field_name} does not exist on Salons")
            result = await self.db.execute(
                select(Salons)
                .where(getattr(Salons, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Salons.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching salons by {field_name}: {str(e)}")
            raise
