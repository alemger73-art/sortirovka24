import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, update, or_, cast, DateTime
from sqlalchemy.ext.asyncio import AsyncSession

from models.announcements import Announcements
from models.categories import Categories

logger = logging.getLogger(__name__)

VISIBLE_STATUSES = {"approved", "published"}


def parse_announcement_date(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except (ValueError, TypeError):
        return None


def validate_announcement_fields(data):
    """Validate supplied fields for both submission and owner edits."""
    payload = dict(data)
    for field, maximum in (("title", 120), ("description", 5000), ("phone", 30),
                           ("whatsapp", 30), ("author_name", 100), ("address", 250), ("price", 100)):
        if field not in payload:
            continue
        value = str(payload[field] or "").strip()
        if field in {"title", "description", "phone"} and not value:
            raise ValueError("Заполните название, описание и телефон")
        if len(value) > maximum:
            raise ValueError(f"Поле {field}: не более {maximum} символов")
        if field in {"phone", "whatsapp"} and value:
            digits = "".join(c for c in value if c.isdigit())
            if not 10 <= len(digits) <= 15:
                raise ValueError("Укажите телефон с кодом страны")
        payload[field] = value
    if payload.get('gallery_images'):
        images = [image.strip() for image in payload['gallery_images'].split(',') if image.strip()]
        if len(images) > 5:
            raise ValueError('Можно добавить не более 5 фотографий')
        payload['gallery_images'] = ','.join(images)
    return payload

ANN_TYPE_SLUG = {
    "sell": "prodam",
    "buy": "kuplyu",
    "rent": "sdam",
    "services": "uslugi-ann",
    "free": "otdam-besplatno",
}


# ------------------ Service Layer ------------------
class AnnouncementsService:
    """Service layer for Announcements operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def enrich_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        payload = dict(data)
        if payload.get('category_id'):
            category = await self.db.get(Categories, payload['category_id'])
            if not category or category.cat_type != 'announcements' or not category.is_active:
                raise ValueError('Выберите доступную категорию объявлений')
            reverse = {slug: ann_type for ann_type, slug in ANN_TYPE_SLUG.items()}
            if category.slug in reverse:
                payload['ann_type'] = reverse[category.slug]
        for field in ('expires_at', 'promoted_until'):
            if payload.get(field):
                parsed = parse_announcement_date(payload[field])
                if not parsed:
                    raise ValueError('Укажите корректную дату')
                payload[field] = parsed.astimezone(timezone.utc).isoformat()
        if payload.get("status") in VISIBLE_STATUSES and not payload.get("expires_at"):
            payload["expires_at"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        if payload.get("views_count") is None:
            payload["views_count"] = 0
        if not payload.get("image_url") and payload.get("gallery_images"):
            first = (str(payload["gallery_images"]).split(",")[0] or "").strip()
            if first:
                payload["image_url"] = first
        if not payload.get("category_id") and payload.get("ann_type"):
            slug = ANN_TYPE_SLUG.get(str(payload["ann_type"]))
            if slug:
                cat = (
                    await self.db.execute(
                        select(Categories).where(
                            Categories.slug == slug,
                            Categories.cat_type == "announcements",
                        )
                    )
                ).scalar_one_or_none()
                if cat:
                    payload["category_id"] = cat.id
        return payload

    async def increment_views(self, obj_id: int) -> None:
        await self.db.execute(update(Announcements).where(Announcements.id == obj_id).values(
            views_count=func.coalesce(Announcements.views_count, 0) + 1))
        await self.db.commit()

    def public_conditions(self):
        # Dates are stored as text in the legacy schema. Compare as dates so
        # ISO offsets and legacy space-separated timestamps work consistently.
        expires = func.nullif(Announcements.expires_at, "")
        if self.db.bind.dialect.name == "sqlite":
            valid_until = func.datetime(expires) > datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        else:
            valid_until = cast(expires, DateTime(timezone=True)) > datetime.now(timezone.utc)
        return (Announcements.status.in_(VISIBLE_STATUSES), Announcements.active.is_(True),
                or_(expires.is_(None), valid_until))

    async def create(self, data: Dict[str, Any]) -> Optional[Announcements]:
        """Create a new announcements"""
        try:
            payload = await self.enrich_payload(data)
            _allowed = set(Announcements.__table__.columns.keys())
            obj = Announcements(**{k: v for k, v in payload.items() if k in _allowed})
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created announcements with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating announcements: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int, *, public_only: bool = False) -> Optional[Announcements]:
        """Get announcements by ID"""
        try:
            query = select(Announcements).where(Announcements.id == obj_id)
            if public_only:
                query = query.where(*self.public_conditions())
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching announcements {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
        public_only: bool = False,
    ) -> Dict[str, Any]:
        """Get paginated list of announcementss"""
        try:
            query = select(Announcements)
            count_query = select(func.count(Announcements.id))
            if public_only:
                conditions = self.public_conditions()
                query = query.where(*conditions)
                count_query = count_query.where(*conditions)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Announcements, field):
                        query = query.where(getattr(Announcements, field) == value)
                        count_query = count_query.where(getattr(Announcements, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Announcements, field_name):
                        query = query.order_by(getattr(Announcements, field_name).desc())
                else:
                    if hasattr(Announcements, sort):
                        query = query.order_by(getattr(Announcements, sort))
            else:
                query = query.order_by(Announcements.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching announcements list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Announcements]:
        """Update announcements"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Announcements {obj_id} not found for update")
                return None
            update_data = dict(update_data)
            if 'ann_type' in update_data and 'category_id' not in update_data:
                slug = ANN_TYPE_SLUG.get(update_data['ann_type'])
                category = await self.db.scalar(select(Categories).where(
                    Categories.slug == slug, Categories.cat_type == 'announcements', Categories.is_active.is_(True))) if slug else None
                update_data['category_id'] = category.id if category else None
            for field in ('expires_at', 'promoted_until'):
                if update_data.get(field):
                    parsed = parse_announcement_date(update_data[field])
                    if not parsed:
                        raise ValueError('Укажите корректную дату')
                    update_data[field] = parsed.astimezone(timezone.utc).isoformat()
            if update_data.get("status") in VISIBLE_STATUSES:
                update_data = dict(update_data)
                update_data["active"] = True
                previous_expiry = parse_announcement_date(obj.expires_at)
                if obj.status not in VISIBLE_STATUSES or not previous_expiry or previous_expiry <= datetime.now(timezone.utc):
                    update_data.setdefault("expires_at", (datetime.now(timezone.utc) + timedelta(days=30)).isoformat())
            elif update_data.get("status") in {"hidden", "rejected"}:
                update_data = {**update_data, "active": False}
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated announcements {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating announcements {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete announcements"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Announcements {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted announcements {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting announcements {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Announcements]:
        """Get announcements by any field"""
        try:
            if not hasattr(Announcements, field_name):
                raise ValueError(f"Field {field_name} does not exist on Announcements")
            result = await self.db.execute(
                select(Announcements).where(getattr(Announcements, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching announcements by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Announcements]:
        """Get list of announcementss filtered by field"""
        try:
            if not hasattr(Announcements, field_name):
                raise ValueError(f"Field {field_name} does not exist on Announcements")
            result = await self.db.execute(
                select(Announcements)
                .where(getattr(Announcements, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Announcements.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching announcementss by {field_name}: {str(e)}")
            raise
