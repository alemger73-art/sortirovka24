"""Account-owned S24 welcome credit, funded and redeemable only by DAM ALEM.

Uses the existing append-only ledger. Never resolves identity from a delivery
phone and never commits. Callers hold the shared DAM lock before user locks.
"""
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import select, func
from models.auth import User
from models.user_management import Bonus
from services.crm import DAM, ensure_business, lock

POINTS = Decimal('300.00')
KINDS = ('REGISTRATION', 'REGISTRATION_SPEND', 'REGISTRATION_RETURN')


async def balance(db, user_id, business_id=DAM):
    if business_id != DAM:
        return Decimal(0)
    return Decimal(await db.scalar(select(func.coalesce(func.sum(Bonus.points), 0)).where(
        Bonus.user_id == str(user_id), Bonus.business_id == DAM,
        Bonus.kind.in_(KINDS))) or 0)


async def post(db, user_id, delta, kind, key, reason, *, order=None):
    await lock(db)
    user = await db.scalar(select(User).where(User.id == str(user_id)).with_for_update().execution_options(populate_existing=True))
    if not user:
        raise HTTPException(409, 'Бонусный аккаунт недоступен')
    existing = await db.scalar(select(Bonus).where(Bonus.idempotency_key == key))
    if existing:
        return existing
    before = await balance(db, user.id)
    after = before + delta
    if after < 0:
        raise HTTPException(409, 'Бонусный баланс изменился. Пересчитайте заказ.')
    await ensure_business(db, DAM)
    row = Bonus(user_id=str(user.id), business_id=DAM, kind=kind, points=delta,
        order_id=order.id if order else None,
        customer_id=order.customer_id if order else None,
        balance_before=before, balance_after=after, idempotency_key=key,
        reason=reason, actor_role='system', details={
            'issuer': 'sortirovka24', 'funded_by': DAM, 'redeemable_in': DAM,
            'wallet': 'registration', 'account_user_id': str(user.id)})
    db.add(row)
    # Compatibility projection; the ledger is authoritative for spendable credit.
    from services.loyalty import amount, audit
    user.bonus_balance = amount(user.bonus_balance) + delta
    audit(db, 'loyalty_'+kind.lower(), {'id': str(user.id), 'role': 'customer'},
        'users', user.id, {'amount': str(delta), 'business_id': DAM,
        'order_id': order.id if order else None, 'funded_by': DAM})
    await db.flush()
    from services.user_notifications import enqueue_notification
    await enqueue_notification(db, user_id=str(user.id), category='bonus',
        key=key, title='Бонусы Сортировка24', body=reason,
        path='/cabinet?tab=bonuses', entity_id=str(row.id), entity_type='bonuses')
    return row


async def grant(db, user):
    return await post(db, user.id, POINTS, 'REGISTRATION',
        f's24-registration:{user.id}', '300 бонусов Сортировка24 за регистрацию · только DAM ALEM')


async def spend(db, order, authenticated_user):
    from services.loyalty import amount
    snap = order.loyalty_snapshot or {}
    quantity = amount(snap.get('registration_spent'))
    if not quantity:
        return
    if (order.business_id != DAM or authenticated_user is None
            or str(authenticated_user.id) != snap.get('registration_user_id')
            or quantity < 0 or quantity > amount(order.bonus_points_used)):
        raise HTTPException(409, 'Некорректная привязка бонусов к заказу')
    await post(db, authenticated_user.id, -quantity, 'REGISTRATION_SPEND',
        f's24-registration-spend:{order.id}', f'Списание бонусов Сортировка24 за заказ №{order.id}', order=order)


async def restore(db, order):
    original = await db.scalar(select(Bonus).where(
        Bonus.idempotency_key == f's24-registration-spend:{order.id}',
        Bonus.business_id == DAM, Bonus.kind == 'REGISTRATION_SPEND'))
    if original:
        await post(db, original.user_id, -original.points, 'REGISTRATION_RETURN',
            f's24-registration-return:{order.id}', f'Возврат бонусов Сортировка24 за заказ №{order.id}', order=order)
