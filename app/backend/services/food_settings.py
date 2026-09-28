import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.food_settings import Food_settings

logger = logging.getLogger(__name__)


def validate_setting(key, value):
    if key == 'courier_payout':
        from decimal import Decimal, InvalidOperation
        try:
            amount = Decimal(str(value))
            if not amount.is_finite() or not 0 <= amount <= 50000 or amount.as_tuple().exponent < -2:
                raise ValueError()
        except (ValueError, TypeError, InvalidOperation):
            from fastapi import HTTPException
            raise HTTPException(422, 'Вознаграждение курьеру: сумма от 0 до 50 000 ₸, не более двух знаков после запятой') from None
    if key in ('preorder_lead_minutes','preorder_min_minutes','preorder_advance_days','preorder_step_minutes'):
        from fastapi import HTTPException
        lo, hi = {'preorder_lead_minutes':(0,1440),'preorder_min_minutes':(0,1440),'preorder_advance_days':(1,30),'preorder_step_minutes':(5,120)}[key]
        try:
            number = int(value)
            if str(number) != str(value).strip() or not lo <= number <= hi:
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(422, f'Значение {key}: целое число от {lo} до {hi}') from None
    if key == 'preorders_enabled' and str(value) not in ('0','1','true','false'):
        from fastapi import HTTPException
        raise HTTPException(422, 'Некорректный переключатель предзаказов')
    if key == 'pickup_location':
        import json
        from pydantic import ValidationError
        from fastapi import HTTPException
        from routers.dam_checkout_config import Pickup
        try:
            Pickup.model_validate(json.loads(value))
        except (ValueError, TypeError, ValidationError):
            raise HTTPException(422, 'Некорректные данные точки самовывоза') from None


# ------------------ Service Layer ------------------
class Food_settingsService:
    """Service layer for Food_settings operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Food_settings]:
        """Create a new food_settings"""
        try:
            validate_setting(data.get('setting_key'), data.get('setting_value'))
            _allowed = set(Food_settings.__table__.columns.keys())
            obj = Food_settings(**{k: v for k, v in data.items() if k in _allowed})
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created food_settings with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating food_settings: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Food_settings]:
        """Get food_settings by ID"""
        try:
            query = select(Food_settings).where(Food_settings.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_settings {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of food_settingss"""
        try:
            query = select(Food_settings)
            count_query = select(func.count(Food_settings.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Food_settings, field):
                        query = query.where(getattr(Food_settings, field) == value)
                        count_query = count_query.where(getattr(Food_settings, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Food_settings, field_name):
                        query = query.order_by(getattr(Food_settings, field_name).desc())
                else:
                    if hasattr(Food_settings, sort):
                        query = query.order_by(getattr(Food_settings, sort))
            else:
                query = query.order_by(Food_settings.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching food_settings list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Food_settings]:
        """Update food_settings"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_settings {obj_id} not found for update")
                return None
            validate_setting(update_data.get('setting_key',obj.setting_key), update_data.get('setting_value',obj.setting_value))
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated food_settings {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating food_settings {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete food_settings"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_settings {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted food_settings {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting food_settings {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Food_settings]:
        """Get food_settings by any field"""
        try:
            if not hasattr(Food_settings, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_settings")
            result = await self.db.execute(
                select(Food_settings).where(getattr(Food_settings, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_settings by {field_name}: {str(e)}")
            raise

    async def get_all_as_dict(self) -> Dict[str, str]:
        """Key-value map of all food_settings rows (setting_key -> setting_value)."""
        result = await self.db.execute(select(Food_settings))
        rows = result.scalars().all()
        settings: Dict[str, str] = {}
        for row in rows:
            key = getattr(row, "setting_key", None)
            if key:
                settings[str(key)] = getattr(row, "setting_value", None) or ""
        return settings

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Food_settings]:
        """Get list of food_settingss filtered by field"""
        try:
            if not hasattr(Food_settings, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_settings")
            result = await self.db.execute(
                select(Food_settings)
                .where(getattr(Food_settings, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Food_settings.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching food_settingss by {field_name}: {str(e)}")
            raise
