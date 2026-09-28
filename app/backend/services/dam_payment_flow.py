"""Transaction-only payment commands. No client redirects or staff payment bypass."""
import hashlib
import json
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select
from models.food_payment import FoodPayment, FoodPaymentCallback
from models.food_orders import Food_orders
from services.dam_order_workflow import money, paid
from services.food_operations import now, add_event
from services.food_preorders import lock_dam_operations

PROVIDERS = {'cash': 'CASH', 'kaspi_qr': 'KASPI', 'halyk_qr': 'HALYK'}


def cash_values(total, given=None):
    total = money(total)
    given = total if given is None else money(given)
    if given < total or given > 100000000:
        raise HTTPException(422, 'Сумма наличных должна быть не меньше суммы заказа')
    return float(given), float(given-total)


def emit(db, order, kind, actor, *, key=None, **data):
    labels = {'PAYMENT_CONFIRMED':'Оплата подтверждена','SENT_TO_KITCHEN':'Передан на кухню','ORDER_READY':'Заказ готов','HANDED_TO_COURIER':'Передан курьеру','COURIER_ON_THE_WAY':'Курьер выехал','DELIVERED':'Доставлено','DELIVERY_STATUS_CHANGED':'Этап доставки изменён','ORDER_CANCELLED':'Заказ отменён','PAYMENT_STATUS_CHANGED':'Статус оплаты изменён','PAYMENT_REFUNDED':'Возврат отмечен'}
    event = add_event(db, order, labels.get(kind, kind), actor, notify=False)
    event.event_type = kind
    event.event_key = key or f'{kind}:{order.id}:{order.version or 0}'
    event.event_data = json.dumps(data, ensure_ascii=False, default=str)
    return event


async def current_payment(db, order):
    return await db.scalar(select(FoodPayment).where(FoodPayment.order_id == order.id)
        .order_by(FoodPayment.created_at.desc(), FoodPayment.id.desc()).limit(1))


async def create_payment(db, order):
    provider = PROVIDERS.get(order.payment_method)
    if not provider:
        return None  # unrelated/legacy payment method
    if provider != 'CASH':
        from services.payment_providers import configured_adapter
        adapter = configured_adapter()
    row = FoodPayment(id=str(uuid4()), order_id=order.id,
        user_id=str(order.user_id) if order.user_id is not None else None,
        provider=provider, amount=money(order.total_amount), currency='KZT',
        status='WAITING', created_at=now(), metadata_json={})
    if provider == 'CASH':
        order.cash_given_amount, order.change_amount = cash_values(order.total_amount, order.cash_given_amount)
    else:
        order.cash_given_amount = order.change_amount = None
    if provider != 'CASH':
        initiation = await adapter.initiate(row)
        row.external_id = initiation['external_id']
    db.add(row)
    return row


async def synchronize_cash(db, order, actor):
    if order.payment_method != 'cash':
        return
    row = await current_payment(db, order)
    if row and row.status != 'PAID' and paid(order) >= money(order.total_amount):
        row.status, row.paid_at = 'PAID', now()
        emit(db, order, 'PAYMENT_CONFIRMED', actor, key=f'payment:{row.id}:paid',
             old_status='WAITING', new_status='PAID', amount=str(row.amount), provider='CASH')


async def apply_confirmation(db, confirmation):
    """Only adapters call this after authenticating a callback/status response.

    No commit: callback receipt, ledger credit, audit and order must be atomic.
    """
    await lock_dam_operations(db)
    c = confirmation
    digest = hashlib.sha256(json.dumps(c, sort_keys=True, default=str).encode()).hexdigest()
    key = f"{c['provider']}:{c['event_id']}"
    previous = await db.get(FoodPaymentCallback, key)
    if previous:
        if previous.payload_hash != digest:
            raise HTTPException(409, 'Повторное событие содержит другие данные')
        return await db.get(FoodPayment, previous.payment_id)
    payment = await db.scalar(select(FoodPayment).where(FoodPayment.id == c['payment_id']).with_for_update())
    if not payment or payment.provider != c['provider'] or payment.provider == 'CASH':
        raise HTTPException(404, 'Платёж не найден')
    order = await db.scalar(select(Food_orders).where(Food_orders.id == payment.order_id).with_for_update())
    if money(c['amount']) != money(payment.amount) or c['currency'] != payment.currency:
        raise HTTPException(409, 'Сумма или валюта платежа не совпадает')
    if payment.external_id and payment.external_id != c['external_id']:
        raise HTTPException(409, 'Не совпадает идентификатор банковского платежа')
    if await db.scalar(select(FoodPayment.id).where(FoodPayment.provider == c['provider'],
            FoodPayment.external_id == c['external_id'], FoodPayment.id != payment.id)):
        raise HTTPException(409, 'Банковский платёж уже связан с другим заказом')
    target = c['status']
    if target not in ('PAID', 'FAILED', 'EXPIRED', 'WAITING'):
        raise HTTPException(422, 'Неизвестный статус платежа')
    old = payment.status
    # Late success is real money, including an expired/cancelled order. It must
    # be recorded and surfaced for owner refund, never resurrect the order.
    if old not in ('PAID', 'REFUNDED') and not (old in ('FAILED', 'EXPIRED') and target != 'PAID'):
        payment.external_id = c['external_id']
        payment.status = target
        if target == 'PAID':
            from services.food_payments import record, preserve_legacy_payment
            await preserve_legacy_payment(db, order)
            await record(db, order, money(payment.amount), f'Provider {payment.provider}')
            order.paid_amount = float(paid(order) + money(payment.amount))
            order.payment_status = 'paid' if paid(order) >= money(order.total_amount) else 'pending'
            payment.paid_at = order.paid_at = now()
            order.version = (order.version or 0) + 1
            emit(db, order, 'PAYMENT_CONFIRMED', f'Provider {payment.provider}',
                key=f'payment:{payment.id}:paid', old_status=old, new_status=target,
                payment_id=payment.id, amount=str(payment.amount), source='provider')
            from services.food_shifts import record_action
            record_action(db, None, 'payment_confirmed', staff_type='system',
                staff_id=payment.provider, staff_name=f'Provider {payment.provider}', role='system',
                entity_type='order', entity_id=order.id, details={
                    'old_status':old, 'new_status':target, 'payment_id':payment.id,
                    'amount':str(payment.amount), 'source':'provider'})
            from services.dam_order_workflow import sync_task
            await sync_task(db, order)
            from services.bonus_rewards import settle_food_order_bonus
            await settle_food_order_bonus(db, order)
        elif target == 'FAILED':
            payment.failed_at = now()
        elif target == 'EXPIRED':
            payment.expired_at = now()
    db.add(FoodPaymentCallback(key=key, payment_id=payment.id, payload_hash=digest, created_at=now()))
    if target != 'PAID' and old != payment.status:
        emit(db, order, 'PAYMENT_STATUS_CHANGED', f'Provider {payment.provider}',
            key=f'callback:{key}', old_status=old, new_status=payment.status)
    await db.flush()
    return payment


async def mark_refunded(db, order):
    if paid(order) > 0:
        return  # partial refund remains recorded in the existing money ledger
    rows = (await db.scalars(select(FoodPayment).where(FoodPayment.order_id == order.id,
        FoodPayment.status == 'PAID'))).all()
    for row in rows:
        row.status, row.refunded_at = 'REFUNDED', now()


def payment_state(order, payment=None):
    status = payment.status if payment else None
    if order.payment_status == 'refunded' or status == 'REFUNDED':
        return 'REFUNDED'
    if order.payment_status == 'paid' or status == 'PAID':
        return 'PAID'
    if status in ('FAILED', 'EXPIRED'):
        return status
    return 'CASH_PENDING' if order.payment_method == 'cash' else status or 'WAITING'


def workflow_state(order, delivery_status=None):
    if order.status in ('new', 'confirmed'):
        if order.payment_method in ('kaspi_qr', 'halyk_qr') and paid(order) < money(order.total_amount):
            return 'WAITING_PAYMENT'
        return 'READY_FOR_OPERATOR'
    if order.status == 'in_progress' and delivery_status in ('on_the_way', 'arrived'):
        return 'COURIER_ON_THE_WAY'
    return {'preparing':'COOKING', 'ready':'READY', 'in_progress':'HANDED_TO_COURIER',
            'done':'DELIVERED', 'cancelled':'CANCELLED'}.get(order.status, 'NEW')
