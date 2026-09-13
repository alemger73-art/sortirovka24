import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, update as sql_update
from fastapi import HTTPException
from services.food_operations import add_event, is_dam_order, LABELS, now
from sqlalchemy.ext.asyncio import AsyncSession

from models.food_orders import Food_orders
from services.bonus_rewards import link_food_order_to_user
from services.telegram import notify_food_order_status as notify_telegram_order_status
from services.frontpad_order_push import push_food_order_to_frontpad

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Food_ordersService:
    """Service layer for Food_orders operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], account_user=None, *, request_key=None, actor="Система") -> Optional[Food_orders]:
        """Create a new food_orders"""
        try:
            _allowed = set(Food_orders.__table__.columns.keys())
            bonus_points = float(data.get("bonus_points_used") or 0)
            bonus_discount = float(data.get("bonus_discount_amount") or 0)
            obj = Food_orders(**{k: v for k, v in data.items() if k in _allowed})
            self.db.add(obj)
            await self.db.flush()

            if bonus_points > 0 and account_user is not None:
                from services.bonus_spending import spend_bonuses_for_order

                await spend_bonuses_for_order(
                    self.db,
                    user=account_user,
                    food_order_id=int(obj.id),
                    points=bonus_points,
                    discount=bonus_discount,
                )

            if request_key:
                from models.food_operations import FoodOrderRequest
                self.db.add(FoodOrderRequest(key=request_key, order_id=obj.id))
                await self.db.flush()
            obj.version = 0
            dam_order = await is_dam_order(self.db, obj)
            if dam_order:
                add_event(self.db, obj, "Заказ создан", actor)
            await self.db.commit()
            await self.db.refresh(obj)
            try:
                await link_food_order_to_user(
                    self.db,
                    customer_phone=obj.customer_phone,
                    food_order_id=int(obj.id),
                    total_amount=obj.total_amount,
                    restaurant_name=obj.restaurant_name,
                    status=obj.status,
                )
            except Exception as bonus_err:
                logger.warning("[Bonus] Food order reward skipped: %s", bonus_err)
            try:
                from services.food_telegram_flow import notify_operator_new_order

                if not dam_order:
                    await notify_operator_new_order(obj)
            except Exception as tg_err:
                logger.warning("[Telegram] Food order notification skipped: %s", tg_err)
            try:
                from services.admin_alerts import alert_new_food_order

                await alert_new_food_order(self.db, obj)
            except Exception as admin_err:
                logger.warning("[Admin] Food order push skipped: %s", admin_err)
            try:
                fp_num = await push_food_order_to_frontpad(self.db, obj)
                if fp_num:
                    obj.frontpad_order_number = fp_num
                    await self.db.commit()
                    await self.db.refresh(obj)
            except Exception as fp_err:
                logger.warning("[FrontPad] Auto push skipped: %s", fp_err)
            try:
                from services.user_notifications import notify_food_order_created

                await notify_food_order_created(self.db, obj)
            except Exception as notify_err:
                logger.warning("[Notify] Food order created notify skipped: %s", notify_err)
            logger.info(f"Created food_orders with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating food_orders: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Food_orders]:
        """Get food_orders by ID"""
        try:
            query = select(Food_orders).where(Food_orders.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_orders {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of food_orderss"""
        try:
            query = select(Food_orders)
            count_query = select(func.count(Food_orders.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Food_orders, field):
                        query = query.where(getattr(Food_orders, field) == value)
                        count_query = count_query.where(getattr(Food_orders, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Food_orders, field_name):
                        query = query.order_by(getattr(Food_orders, field_name).desc())
                else:
                    if hasattr(Food_orders, sort):
                        query = query.order_by(getattr(Food_orders, sort))
            else:
                query = query.order_by(Food_orders.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching food_orders list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], *, expected_version=None, actor="Система") -> Optional[Food_orders]:
        """Update food_orders"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_orders {obj_id} not found for update")
                return None
            old_status = obj.status
            dam_order = await is_dam_order(self.db, obj)
            if dam_order:
                version = obj.version or 0
                if expected_version is not None and version != expected_version:
                    raise HTTPException(409, "Заказ уже изменён другим оператором. Обновите карточку.")
                if old_status in ('done', 'cancelled') and any(k not in ({'operator_note', 'payment_status'} if old_status == 'done' else {'operator_note'}) for k in update_data):
                    raise HTTPException(409, "Закрытый заказ нельзя изменять")
                if obj.payment_status == 'paid' and update_data.get('payment_status', 'paid') != 'paid':
                    raise HTTPException(422, 'Полученную оплату нельзя стереть. Возврат отмечается владельцем отдельно.')
                target = update_data.get('status', old_status)
                transitions = {'new': {'confirmed', 'cancelled'}, 'confirmed': {'preparing', 'ready', 'in_progress', 'done', 'cancelled'}, 'preparing': {'ready', 'cancelled'}, 'ready': {'in_progress', 'done', 'cancelled'}, 'in_progress': {'done', 'cancelled'}}
                if target != old_status and target not in transitions.get(old_status, set()):
                    raise HTTPException(409, "Недопустимый переход статуса")
                if target == 'in_progress' and obj.delivery_method == 'pickup':
                    raise HTTPException(422, "Самовывоз не передаётся в доставку")
                if target != old_status and obj.delivery_method != 'pickup' and target in ('in_progress', 'done') and actor != 'Курьер':
                    raise HTTPException(409, 'Передачу и доставку отмечает курьер в своём кабинете')
                if target == 'cancelled' and not (update_data.get('cancellation_reason') or '').strip():
                    raise HTTPException(422, "Укажите причину отмены")
                if update_data.get('delivery_address') is not None and obj.delivery_method != 'pickup' and not update_data['delivery_address'].strip():
                    raise HTTPException(422, "Адрес доставки не может быть пустым")
                if any(k in update_data for k in ('total_amount', 'order_items', 'user_id', 'restaurant_id', 'restaurant_name', 'created_at')):
                    raise HTTPException(422, "Состав и сумма принятого заказа зафиксированы. Для замены оформите новый заказ.")
                claimed = await self.db.execute(sql_update(Food_orders).where(Food_orders.id == obj_id, func.coalesce(Food_orders.version, 0) == version).values(version=version + 1).execution_options(synchronize_session=False))
                if not claimed.rowcount:
                    raise HTTPException(409, "Заказ изменён другим оператором. Обновите карточку.")
                obj.version = version + 1
                if update_data.get('payment_status') == 'paid' and obj.payment_status != 'paid':
                    obj.paid_at = now()
                    obj.paid_amount = obj.total_amount
                if target == 'done' and old_status != 'done':
                    obj.completed_at = now()
                if target == 'cancelled' and old_status != 'cancelled':
                    obj.cancelled_at = now()
                message = f"Статус: {LABELS.get(old_status, old_status)} → {LABELS.get(target, target)}" if target != old_status else 'Данные заказа обновлены'
                if target == 'cancelled':
                    message += ': ' + update_data['cancellation_reason'].strip()
                if 'payment_status' in update_data:
                    message += ' · Оплата: ' + ('получена' if update_data['payment_status'] == 'paid' else 'ожидается')
                add_event(self.db, obj, message, actor, notify=target != old_status)
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            if dam_order and ('status' in update_data or 'delivery_address' in update_data or 'payment_status' in update_data):
                from services.dam_order_workflow import sync_task
                await sync_task(self.db, obj)
            await self.db.commit()
            await self.db.refresh(obj)
            if "status" in update_data and update_data["status"] != old_status:
                try:
                    if not dam_order:
                        await notify_telegram_order_status({
                        "order_id": obj.id,
                        "restaurant_name": obj.restaurant_name,
                        "customer_name": obj.customer_name,
                        "customer_phone": obj.customer_phone,
                        "total_amount": obj.total_amount,
                        "old_status": old_status,
                        "new_status": obj.status,
                    })
                except Exception as tg_err:
                    logger.warning("[Telegram] Food status notification skipped: %s", tg_err)
                try:
                    from services.bonus_rewards import handle_food_order_status_bonus

                    await handle_food_order_status_bonus(
                        self.db,
                        customer_phone=obj.customer_phone,
                        food_order_id=int(obj.id),
                        total_amount=obj.total_amount,
                        old_status=old_status,
                        new_status=obj.status,
                        bonus_points_used=getattr(obj, "bonus_points_used", None),
                    )
                except Exception as bonus_err:
                    logger.warning("[Bonus] Food order status bonus handling skipped: %s", bonus_err)
                try:
                    from services.user_notifications import notify_food_order_status

                    await notify_food_order_status(self.db, obj, old_status, obj.status)
                except Exception as notify_err:
                    logger.warning("[Notify] Food order status notify skipped: %s", notify_err)
                if update_data["status"] == "in_progress" and old_status != "in_progress" and obj.delivery_method != "pickup" and not dam_order:
                    try:
                        from services.food_telegram_flow import dispatch_order_to_couriers

                        await dispatch_order_to_couriers(self.db, obj)
                    except Exception as dispatch_err:
                        logger.warning("[Telegram] Courier dispatch skipped: %s", dispatch_err)
            logger.info(f"Updated food_orders {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating food_orders {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete food_orders"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Food_orders {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted food_orders {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting food_orders {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Food_orders]:
        """Get food_orders by any field"""
        try:
            if not hasattr(Food_orders, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_orders")
            result = await self.db.execute(
                select(Food_orders).where(getattr(Food_orders, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching food_orders by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Food_orders]:
        """Get list of food_orderss filtered by field"""
        try:
            if not hasattr(Food_orders, field_name):
                raise ValueError(f"Field {field_name} does not exist on Food_orders")
            result = await self.db.execute(
                select(Food_orders)
                .where(getattr(Food_orders, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Food_orders.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching food_orderss by {field_name}: {str(e)}")
            raise