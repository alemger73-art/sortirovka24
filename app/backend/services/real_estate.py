import logging
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.real_estate import Real_estate

logger = logging.getLogger(__name__)

RE_TYPE_SLUG: dict[str, str] = {
    "sell_apartment": "prodam-kvartiru",
    "rent_apartment": "sdam-kvartiru",
    "need_apartment": "snimu-kvartiru",
    "sell_house": "prodam-dom",
    "rent_house": "arenda-doma",
    "commercial": "kommercheskaya",
    "land": "uchastki",
}

RE_TYPE_BY_SLUG: dict[str, str] = {slug: re_type for re_type, slug in RE_TYPE_SLUG.items()}


def validate_author_listing(data: Dict[str, Any]) -> None:
    """Validate resident input independently of browser-required controls."""
    from utils.phone import normalize_phone
    for field, label, maximum in (("title", "заголовок", 200), ("description", "описание", 10000)):
        value = str(data.get(field) or "").strip()
        if not value or len(value) > maximum:
            raise HTTPException(status_code=422, detail=f"Заполните {label} (до {maximum} символов)")
        data[field] = value
    phone = normalize_phone(str(data.get("phone") or ""))
    if len(phone) != 12 or not phone.startswith("+7"):
        raise HTTPException(status_code=422, detail="Укажите телефон в формате +7 и 10 цифр")
    data["phone"] = phone


# ------------------ Service Layer ------------------
class Real_estateService:
    """Service layer for Real_estate operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Real_estate]:
        """Create a new real_estate"""
        try:
            if data.get("status") in {"approved", "published"} and not data.get("expires_at"):
                data = {**data, "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}
            if data.get("status") == "rejected" and not str(data.get("moderation_reason") or "").strip():
                raise HTTPException(status_code=422, detail="Укажите причину отклонения объявления")
            _allowed = set(Real_estate.__table__.columns.keys())
            if data.get("seller_type") == "owner":
                data = {**data, "agency_name": None, "commission": None}
            obj = Real_estate(**{k: v for k, v in data.items() if k in _allowed})
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created real_estate with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating real_estate: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int, *, public_only: bool = False) -> Optional[Real_estate]:
        """Get real_estate by ID"""
        try:
            query = select(Real_estate).where(Real_estate.id == obj_id)
            if public_only:
                query = query.where(Real_estate.status.in_(("approved", "published")) & Real_estate.active.is_(True))
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching real_estate {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
        public_only: bool = False,
    ) -> Dict[str, Any]:
        """Get paginated list of real_estates"""
        try:
            query = select(Real_estate)
            count_query = select(func.count(Real_estate.id))
            if public_only:
                query = query.where(Real_estate.status.in_(("approved", "published")) & Real_estate.active.is_(True))
                count_query = count_query.where(Real_estate.status.in_(("approved", "published")) & Real_estate.active.is_(True))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Real_estate, field):
                        query = query.where(getattr(Real_estate, field) == value)
                        count_query = count_query.where(getattr(Real_estate, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Real_estate, field_name):
                        query = query.order_by(getattr(Real_estate, field_name).desc())
                else:
                    if hasattr(Real_estate, sort):
                        query = query.order_by(getattr(Real_estate, sort))
            else:
                query = query.order_by(Real_estate.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching real_estate list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Real_estate]:
        """Update real_estate"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Real_estate {obj_id} not found for update")
                return None
            status = update_data.get("status")
            if status == "rejected" and not str(update_data.get("moderation_reason") or "").strip():
                raise HTTPException(status_code=422, detail="Укажите причину отклонения объявления")
            if status in {"approved", "published"}:
                update_data = {**update_data, "active": True, "moderation_reason": None}
                if obj.status not in {"approved", "published"} or not obj.expires_at:
                    update_data["expires_at"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            elif status in {"hidden", "rejected"}:
                update_data = {**update_data, "active": False}
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated real_estate {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating real_estate {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete real_estate"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Real_estate {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted real_estate {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting real_estate {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Real_estate]:
        """Get real_estate by any field"""
        try:
            if not hasattr(Real_estate, field_name):
                raise ValueError(f"Field {field_name} does not exist on Real_estate")
            result = await self.db.execute(
                select(Real_estate).where(getattr(Real_estate, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching real_estate by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Real_estate]:
        """Get list of real_estates filtered by field"""
        try:
            if not hasattr(Real_estate, field_name):
                raise ValueError(f"Field {field_name} does not exist on Real_estate")
            result = await self.db.execute(
                select(Real_estate)
                .where(getattr(Real_estate, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Real_estate.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching real_estates by {field_name}: {str(e)}")
            raise