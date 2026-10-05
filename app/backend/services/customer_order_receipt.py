"""Public receipt totals from the stored order, without repricing or settings."""
import json
import math


def customer_order_receipt(order):
    try:
        snapshot = json.loads(order.pricing_snapshot or '{}')
        stored = snapshot['breakdown']
        result = {key: float(stored[key]) for key in ('subtotal', 'service_fee', 'delivery_fee', 'discount')}
        if any(not math.isfinite(value) or value < 0 for value in result.values()):
            return None
        total = float(order.total_amount)
        if not math.isfinite(total) or abs(result['subtotal'] + result['service_fee'] + result['delivery_fee'] - result['discount'] - total) > 0.02:
            return None
        return result
    except (ValueError, TypeError, KeyError, AttributeError):
        return None


def receipt_snapshot(order):
    try:
        lines = json.loads(order.order_items or '[]')
    except (ValueError, TypeError):
        lines = []
    return {'items': lines if isinstance(lines, list) else [], 'total_amount': order.total_amount,
            'receipt': customer_order_receipt(order)}


async def customer_edit_allowed(db, order):
    from services.dam_order_workflow import paid
    from models.food_payment import FoodPayment
    from sqlalchemy import select, or_
    if order.status != 'new' or paid(order) > 0 or order.payment_status in ('paid', 'refunded') or order.payment_method != 'cash':
        return False
    return not await db.scalar(select(FoodPayment.id).where(
        FoodPayment.order_id == order.id, or_(FoodPayment.provider != 'CASH', FoodPayment.status.in_(('PAID', 'REFUNDED')))).limit(1))


async def validate_customer_minimum(db, order, quote):
    from models.food_restaurants import Food_restaurants
    from services.food_settings import Food_settingsService
    from services.dam_order_workflow import subtotal, money
    from fastapi import HTTPException
    if order.delivery_method == 'dine_in':
        return
    restaurant = await db.get(Food_restaurants, order.restaurant_id) if order.restaurant_id else None
    if restaurant and restaurant.is_active is False:
        raise HTTPException(409, 'Ресторан недоступен. Обратитесь к оператору.')
    minimum = money(restaurant.min_order if restaurant else 0)
    if minimum <= 0:
        settings = await Food_settingsService(db).get_all_as_dict()
        minimum = money(settings.get('min_order_amount') or 0)
    if minimum > 0 and subtotal(quote['items']) < minimum:
        raise HTTPException(422, f'Минимальный заказ {minimum:g} ₸. Для уменьшения отправьте запрос оператору.')


def public_receipt_event(event):
    """Expose receipt history only, never internal event_data or staff identity."""
    try:
        data = json.loads(event.public_data or '{}')
        if data.get('kind') not in ('receipt_created', 'receipt_changed', 'receipt_change_requested'):
            return None
        return {key: data[key] for key in ('kind', 'revision', 'reason', 'before', 'after', 'actor_role') if key in data} | {'created_at': event.created_at}
    except (ValueError, TypeError, AttributeError):
        return None
