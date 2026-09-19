"""Versioned operator receipts and atomic food/courier state bridge."""
import json
import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy import select, update, func
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.logistics import LogisticsTask
from services.food_operations import add_event, now, brand
from services.food_order_validation import validate_food_order


def money(value):
    try:
        result = Decimal(str(value or 0))
        if not result.is_finite():
            raise ValueError()
        return result.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    except (ValueError, InvalidOperation):
        raise HTTPException(422, 'Некорректная сумма') from None


def items(order):
    try:
        result = json.loads(order.order_items or '[]')
        if not isinstance(result, list):
            raise ValueError()
        return result
    except (ValueError, TypeError):
        raise HTTPException(409, 'Состав старого заказа повреждён. Обратитесь к владельцу.') from None


def subtotal(lines):
    return sum((money(x.get('price')) + money(x.get('modTotal'))) * int(x.get('quantity') or 1) for x in lines)


def paid(order):
    return money(order.paid_amount if order.paid_amount is not None else order.total_amount if order.payment_status == 'paid' else 0)


async def task_for(db, order):
    return await db.scalar(select(LogisticsTask).where(LogisticsTask.source_type == 'food_orders', LogisticsTask.source_id == order.id).with_for_update())


async def claim(db, order, version):
    result = await db.execute(update(Food_orders).where(Food_orders.id == order.id, func.coalesce(Food_orders.version, 0) == version).values(version=version + 1).execution_options(synchronize_session=False))
    if not result.rowcount:
        raise HTTPException(409, 'Заказ уже изменён. Обновите карточку и проверьте изменения.')
    order.version = version + 1


async def sync_task(db, order):
    """Must run inside the order transaction; never commits or calls external services."""
    if order.delivery_method not in ('delivery', 'доставка'):
        return
    task = await task_for(db, order)
    if not task and order.status == 'ready':
        from models.logistics import LogisticsSettings
        from services.logistics_service import DEFAULT_LOGISTICS_SETTINGS
        cfg = dict(DEFAULT_LOGISTICS_SETTINGS)
        cfg.update({x.key: x.value for x in (await db.scalars(select(LogisticsSettings))).all() if x.value is not None})
        task = LogisticsTask(vertical='food', source_type='food_orders', source_id=order.id,
            pickup_address=cfg.get('pickup_address') or order.restaurant_name or 'DAM ALEM 2.0', pickup_lat=float(cfg['pickup_lat']), pickup_lng=float(cfg['pickup_lng']), dropoff_address=order.delivery_address or '',
            customer_name=order.customer_name, customer_phone=order.customer_phone,
            merchant_name=order.restaurant_name, prep_minutes=0, delivery_fee=0, status='ready')
        db.add(task)
    if not task:
        return
    task.total_amount = order.total_amount
    task.paid_amount = float(paid(order))
    task.order_items = order.order_items
    task.receipt_revision = order.receipt_revision or 0
    task.order_status = order.status
    task.dropoff_address = order.delivery_address or ''
    task.comment = order.comment
    if order.status == 'cancelled':
        task.status, task.cancelled_at, task.cancel_reason = 'cancelled', now(), order.cancellation_reason
        task.offered_courier_id = task.offer_expires_at = None
    elif order.status == 'done':
        task.status = 'delivered'
    elif order.status == 'ready' and task.status in ('pending', 'ready'):
        task.status, task.ready_at = 'ready', now()
    elif order.status in ('new', 'confirmed', 'preparing') and not task.courier_id:
        task.status, task.ready_at = 'pending', None
        task.offered_courier_id = task.offer_expires_at = None


async def quote_change(db, order, body):
    if (order.version or 0) != body.expected_version:
        raise HTTPException(409, 'Заказ уже изменён. Обновите карточку.')
    if order.status not in ('new', 'confirmed', 'preparing', 'ready'):
        raise HTTPException(409, 'Состав нельзя менять после передачи курьеру или закрытия заказа')
    task = await task_for(db, order)
    if task and task.status in ('picked_up', 'on_the_way', 'delivered'):
        raise HTTPException(409, 'Курьер уже забрал заказ. Состав зафиксирован для доставки.')
    original = items(order)
    revised, additions, seen = [], [], set()
    for line in body.items:
        data = line.model_dump(exclude_none=True)
        index = data.pop('line_index', None)
        if index is not None:
            if index >= len(original) or index in seen:
                raise HTTPException(422, 'Некорректная строка заказа')
            seen.add(index)
            old = original[index]
            if old.get('is_gift'):
                continue
            if line.quantity > int(old.get('quantity') or 1):
                # An existing receipt price stays agreed, but additional portions
                # must still be available and their modifier choices valid today.
                await validate_food_order(db, dict(restaurant_id=order.restaurant_id,
                    customer_name=order.customer_name, customer_phone=order.customer_phone,
                    delivery_method='pickup', order_items=json.dumps([{**old, 'quantity': line.quantity}])),
                    staff_quote=True, catalog_only=True)
            revised.append({**old, 'quantity': line.quantity, 'sum': float((money(old.get('price')) + money(old.get('modTotal'))) * line.quantity)})
        else:
            if not line.id:
                raise HTTPException(422, 'Выберите блюдо из меню')
            additions.append(data)
    if additions:
        data = dict(restaurant_id=order.restaurant_id, customer_name=order.customer_name,
                    customer_phone=order.customer_phone, delivery_method='pickup', order_items=json.dumps(additions))
        _, checked, _ = await validate_food_order(db, data, staff_quote=True, catalog_only=True)
        revised.extend(checked)
    if not revised:
        raise HTTPException(422, 'В заказе должно остаться хотя бы одно блюдо. Для полного отказа используйте отмену.')
    before_subtotal, after_subtotal = subtotal(original), subtotal(revised)
    # Existing delivery, service charge and agreed discounts remain fixed. Never spend extra bonuses.
    adjustment = money(order.total_amount) - before_subtotal
    total = after_subtotal + adjustment
    promo_discount = money(order.promo_discount_amount)
    if order.pricing_snapshot:
        try:
            snapshot = json.loads(order.pricing_snapshot)
            cfg = snapshot['settings']
            from services.food_order_validation import _apply_free_delivery_threshold, _resolve_promo, expected_apartment_fee
            service = (after_subtotal * Decimal(str(snapshot['service_rate']))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
            delivery = money(_apply_free_delivery_threshold(float(after_subtotal), snapshot['base_delivery_fee'], cfg))
            free = False
            promo_discount = Decimal(0)
            if snapshot.get('promo_code'):
                try:
                    discount, free = _resolve_promo(snapshot['promo_code'], float(after_subtotal), cfg)
                    promo_discount = money(discount)
                except HTTPException:
                    # The original promo no longer applies below its threshold.
                    pass
            if free:
                delivery = Decimal(0)
            apartment = money(expected_apartment_fee(delivery_method=order.delivery_method,
                subtotal=float(after_subtotal), settings=cfg, promo_free_delivery=free,
                requested=snapshot.get('requested_apartment', False)))
            adjustment = service + delivery + apartment - promo_discount - money(order.bonus_discount_amount)
            total = after_subtotal + adjustment
        except (KeyError, ValueError, TypeError):
            raise HTTPException(409, 'Не удалось прочитать условия расчёта заказа') from None
    if total < 0 or after_subtotal < money(order.bonus_discount_amount):
        raise HTTPException(422, 'Сумма ниже уже применённых скидок. Согласуйте отмену и возврат бонусов с клиентом.')
    choices = await gift_choices(db, order.restaurant_id, after_subtotal)
    selected_id = body.selected_gift_id or next((x.get('gift_id') for x in original if x.get('is_gift')), None)
    chosen = next((x for x in choices if x['id'] == selected_id), None)
    if not chosen and len(choices) == 1:
        chosen = choices[0]
    if chosen:
        revised.append(gift_line(chosen))
    received = paid(order)
    return {'items': revised, 'total_amount': float(total), 'previous_total': float(money(order.total_amount)),
            'adjustment': float(adjustment), 'paid_amount': float(received),
            'promo_discount_amount': float(promo_discount),
            'gift_choices': choices, 'gift_required': bool(choices and not chosen),
            'amount_due': float(max(Decimal(0), total - received)), 'refund_due': float(max(Decimal(0), received - total))}


async def amend(db, order, body, actor):
    await claim(db, order, body.expected_version)
    quote = await quote_change(db, order, body.model_copy(update={'expected_version': body.expected_version + 1}))
    if quote['gift_required']:
        raise HTTPException(409, 'Выберите подарок для клиента')
    if body.quoted_total is None or money(body.quoted_total) != money(quote['total_amount']):
        raise HTTPException(409, 'Расчёт изменился. Проверьте новую сумму перед сохранением.')
    from services.food_payments import preserve_legacy_payment
    await preserve_legacy_payment(db, order)
    before = {'items': items(order), 'total_amount': order.total_amount}
    order.order_items = json.dumps(quote['items'], ensure_ascii=False)
    order.total_amount, order.paid_amount = quote['total_amount'], quote['paid_amount']
    order.promo_discount_amount = quote['promo_discount_amount']
    order.payment_status = 'paid' if quote['paid_amount'] >= quote['total_amount'] and quote['paid_amount'] > 0 else 'pending'
    order.receipt_revision = (order.receipt_revision or 0) + 1
    order.receipt_updated_at = now()
    if order.status == 'ready':
        order.status = 'preparing'
    event = add_event(db, order, f"Состав изменён: {before['total_amount']} → {quote['total_amount']} ₸. {body.reason.strip()}", actor)
    event.public_data = json.dumps({'kind': 'receipt_changed', 'revision': order.receipt_revision,
        'reason': body.reason.strip(), 'before': before, 'after': {'items': quote['items'], 'total_amount': quote['total_amount']}}, ensure_ascii=False)
    await sync_task(db, order)
    await db.commit()
    await db.refresh(order)
    from services.user_notifications import notify_user_by_phone
    try:
        await notify_user_by_phone(db, phone=order.customer_phone, category='food',
            event_key=f'food:receipt:{order.id}:{order.receipt_revision}', title='Состав заказа изменён',
            body=f'Заказ №{order.id}. Новая сумма: {order.total_amount:g} ₸. Проверьте обновлённый состав.',
            path=f'/cabinet/orders/food/{order.id}', entity_type='food_orders', entity_id=str(order.id))
    except Exception:
        logging.getLogger(__name__).exception('Receipt saved; customer notification failed')
        await db.rollback()
        await db.refresh(order)
    return order


async def manual_quote(db, body):
    restaurants = (await db.scalars(select(Food_restaurants))).all()
    restaurant = next((r for r in restaurants if brand(r.name, r.merchant_key)), None)
    if not restaurant:
        raise HTTPException(409, 'Сначала заполните профиль DAM ALEM')
    payload = {'restaurant_id': restaurant.id, 'restaurant_name': restaurant.name,
        'customer_name': body.customer_name.strip(), 'customer_phone': body.customer_phone.strip(),
        'delivery_address': body.delivery_address.strip(), 'delivery_method': body.delivery_method,
        'payment_method': body.payment_method, 'comment': body.comment,
        'order_items': json.dumps([x.model_dump(exclude_none=True) for x in body.items]), 'total_amount': 0}
    # Resolve the gift after pricing so reducing a draft below the threshold
    # removes its old gift instead of making automatic recalculation impossible.
    data, lines, total = await validate_food_order(db, payload, staff_quote=True)
    choices = await gift_choices(db, restaurant.id, subtotal(lines))
    chosen = next((g for g in choices if g['id'] == body.selected_gift_id), None)
    if not chosen and len(choices) == 1:
        chosen = choices[0]
    if chosen:
        lines.append(gift_line(chosen))
        data['order_items'] = json.dumps(lines, ensure_ascii=False)
    data['order_source'] = 'operator'
    return data, {'items': lines, 'total_amount': total, **json.loads(data['pricing_snapshot'])['breakdown'], 'gift_choices': choices,
        'gift_required': bool(choices and not any(x.get('is_gift') for x in lines))}


async def gift_choices(db, restaurant_id, amount):
    from models.food_settings import Food_settings
    from services.food_order_validation import available_gifts
    settings = {x.setting_key: x.setting_value or '' for x in (await db.scalars(select(Food_settings))).all()}
    products = (await db.scalars(select(Food_items).where(Food_items.restaurant_id == restaurant_id))).all()
    gifts = [g for g in available_gifts(settings, products, restaurant_id) if amount >= money(g['min_amount'])]
    threshold = max((money(g['min_amount']) for g in gifts), default=Decimal(0))
    return [g for g in gifts if money(g['min_amount']) == threshold]


def gift_line(gift):
    return {'id': 'gift:' + gift['id'], 'name': gift['title'], 'price': 0, 'quantity': 1,
        'modifiers': [], 'modTotal': 0, 'sum': 0, 'is_gift': True, 'gift_id': gift['id'],
        'gift_threshold': gift['min_amount'], 'product_id': gift.get('product_id')}


async def lock_courier_order(db, task, *, require_ready=False):
    if task.source_type != 'food_orders':
        return None
    order = await db.scalar(select(Food_orders).where(Food_orders.id == task.source_id).with_for_update())
    from services.food_operations import is_dam_order
    if not order or not await is_dam_order(db, order):
        return None
    if order.status in ('done', 'cancelled') or (require_ready and order.status != 'ready'):
        raise ValueError('Заказ ещё не готов или уже закрыт. Обновите кабинет.')
    await claim(db, order, order.version or 0)
    return order
