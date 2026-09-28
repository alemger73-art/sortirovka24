"""DAM loyalty: Decimal arithmetic, one transaction, append-only existing ledger.

Lock order is DAM advisory lock -> policy row -> accounts. The policy row also
serializes referral graph changes. No routine in this module commits.
"""
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, ROUND_DOWN

from fastapi import HTTPException
from sqlalchemy import select, update, func
from models.auth import User
from models.crm import Customer, BusinessCustomer
from services import crm
DAM = crm.DAM
from models.food_orders import Food_orders
from models.user_management import Bonus, UserAction
from models.loyalty import BonusPolicy, BonusLot, BonusAllocation, BonusMember, BonusReferral, BonusReview

DEFAULTS = dict(cashback_rate=3, max_spend_percent=20, welcome_amount=300,
    welcome_days=14, regular_days=60, referral_amount=300, referral_enabled=True,
    earning_enabled=True, spending_enabled=True, referral_daily_limit=5,
    customer_daily_order_limit=20, auto_enroll=True)
CENT = Decimal('0.01')
ZERO = Decimal(0)
MAX_AMOUNT = Decimal('99999999999.99')


def now():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def amount(value):
    try:
        result = Decimal(str(value or 0))
        if not result.is_finite() or abs(result) > MAX_AMOUNT:
            raise InvalidOperation()
        return result.quantize(CENT, rounding=ROUND_HALF_UP)
    except (ValueError, TypeError, InvalidOperation):
        raise HTTPException(422, 'Некорректная сумма бонусов') from None


def audit(db, action, actor, entity, entity_id, details):
    db.add(UserAction(user_id=None, action=action, entity=entity, entity_id=str(entity_id),
        payload=json.dumps({'actor': actor or {'role': 'system'}, **details}, ensure_ascii=False, default=str)))


async def policy(db, *, lock=False, business_id=DAM):
    if lock:
        from services.food_preorders import lock_dam_operations
        await lock_dam_operations(db)
    await crm.ensure_business(db, business_id)
    dialect = db.bind.dialect.name
    if dialect == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    await db.execute(insert(BonusPolicy).values(id=business_id, version=1, settings=DEFAULTS).on_conflict_do_nothing(index_elements=['id']))
    if lock:
        await db.execute(update(BonusPolicy).where(BonusPolicy.id == business_id).values(version=BonusPolicy.version))
    return await db.scalar(select(BonusPolicy).where(BonusPolicy.id == business_id).execution_options(populate_existing=True))


async def rules(db, business_id=DAM):
    row = await policy(db, business_id=business_id)
    return {**DEFAULTS, **row.settings, 'version': row.version, 'tenge_rate': 1}


async def configure(db, changes, actor, business_id=DAM):
    row = await policy(db, lock=True, business_id=business_id)
    result = {**DEFAULTS, **row.settings}
    for key, value in changes.items():
        if key not in DEFAULTS:
            raise HTTPException(422, 'Неизвестная настройка бонусов')
        if isinstance(DEFAULTS[key], bool):
            if not isinstance(value, bool):
                raise HTTPException(422, 'Ожидается переключатель')
        else:
            value = amount(value)
            maximum = 100 if key.endswith('rate') or key.endswith('percent') else 100000
            if value < 0 or value > maximum or (key.endswith('days') and value < 1):
                raise HTTPException(422, 'Настройка вне допустимого диапазона')
            if (key.endswith('days') or key.endswith('limit')) and value != int(value):
                raise HTTPException(422, 'Укажите целое число')
            value = float(value)
        result[key] = value
    old = row.settings
    row.settings, row.version = result, row.version + 1
    audit(db, 'loyalty_settings_changed', actor, 'bonus_policy', business_id, {'old': old, 'new': result, 'version': row.version})
    await db.flush()
    return result


async def notify(db, account_id, key, text):
    member_row = await db.get(BonusMember, account_id)
    customer = await db.get(Customer, member_row.customer_id) if member_row else None
    if not customer or not customer.user_id:
        return
    from services.user_notifications import enqueue_notification
    await enqueue_notification(db, user_id=customer.user_id, category='bonus', key=key, title='Бонусная программа', body=text, path='/cabinet?tab=bonuses', entity_id=member_row.id, entity_type='business_customers')


async def member(db, user):
    return user if isinstance(user, BonusMember) else await account(db, user.id)


async def identity(db, user):
    customer = await db.get(Customer, user.customer_id)
    return bool(customer and customer.state == 'NORMAL')


async def account(db, user_id, *, internal=False, business_id=DAM):
    row = await db.scalar(select(BonusMember).where(BonusMember.id == str(user_id), BonusMember.business_id == business_id).execution_options(populate_existing=True))
    if row:
        return row
    await policy(db, lock=True, business_id=business_id)
    customer = await db.get(Customer, str(user_id))
    if customer is None:
        linked_user = await db.get(User, str(user_id))
        if not linked_user or (not internal and (not linked_user.is_active or linked_user.status != 'active')):
            raise HTTPException(409, 'Бонусный аккаунт недоступен')
        customer = await crm.for_account(db, linked_user, business_id=business_id)
    relationship = await crm.membership(db, customer, business_id)
    row = await db.get(BonusMember, relationship.id)
    if not row:
        p = await rules(db, business_id)
        row = BonusMember(id=relationship.id, customer_id=customer.id, business_id=business_id,
            referral_code=secrets.token_urlsafe(18), initialized=1, legacy_welcome=0, bonus_balance=0, bonus_debt=0, enabled=int(p['auto_enroll']))
        db.add(row)
        await db.flush()
        audit(db, 'loyalty_enrolled', None, 'bonus_members', row.id, {'business_id':business_id,'customer_id':customer.id})
    return row


async def post(db, user, kind, delta, key, reason, *, order_id=None, expires_at=None, actor=None, details=None, clawback=False):
    delta = amount(delta)
    existing = await db.scalar(select(Bonus).where(Bonus.idempotency_key == key))
    if existing:
        return existing
    before, debt = amount(user.bonus_balance), amount(user.bonus_debt)
    data = dict(details or {})
    available_delta = delta
    if delta > 0 and debt:
        offset = min(delta, debt)
        user.bonus_debt = debt-offset
        available_delta -= offset
        data['debt_offset'] = str(offset)
    elif delta < 0 and before + delta < 0:
        if not clawback:
            raise HTTPException(409, 'Недостаточно доступных бонусов. Обновите заказ.')
        user.bonus_debt = debt-(before+delta)
        available_delta = -before
    after = before + available_delta
    data.update(debt_before=str(debt), debt_after=str(amount(user.bonus_debt)), available_delta=str(available_delta))
    entry = Bonus(user_id=(await db.get(Customer, user.customer_id)).user_id, account_id=user.id, business_id=user.business_id, customer_id=user.customer_id, points=delta, kind=kind, order_id=order_id,
        balance_before=before, balance_after=after, expires_at=expires_at, reason=reason,
        created_by=str((actor or {}).get('id') or '') or None, actor_role=(actor or {}).get('role', 'system'),
        details=data, idempotency_key=key)
    user.bonus_balance = after
    db.add(entry)
    await db.flush()
    if available_delta > 0:
        db.add(BonusLot(entry_id=entry.id, account_id=user.id, remaining=available_delta, expires_at=expires_at))
    audit(db, 'loyalty_'+kind.lower(), actor, 'bonuses', entry.id,
        {'customer': user.id, 'order': order_id, 'amount': delta, 'before': before, 'after': after, 'reason': reason, **data})
    await db.flush()
    return entry


async def consume(db, user, entry, quantity):
    lots = (await db.scalars(select(BonusLot).where(BonusLot.account_id == user.id, BonusLot.remaining > 0)
        .order_by(BonusLot.expires_at.asc().nullslast(), BonusLot.id))).all()
    left = amount(quantity)
    for lot in lots:
        take = min(left, amount(lot.remaining))
        if take:
            lot.remaining = amount(lot.remaining)-take
            db.add(BonusAllocation(debit_id=entry.id, lot_id=lot.id, amount=take))
            left -= take
        if left <= 0:
            break
    if left:
        raise HTTPException(409, 'Остаток бонусов требует сверки владельцем')
    await db.flush()


async def expire(db, user, at=None):
    at = at or now()
    lots = (await db.scalars(select(BonusLot).where(BonusLot.account_id == user.id, BonusLot.remaining > 0,
        BonusLot.expires_at <= at).order_by(BonusLot.id))).all()
    for lot in lots:
        quantity = amount(lot.remaining)
        await post(db, user, 'EXPIRE', -quantity, f'expire:{lot.id}', 'Истёк срок бонусов', details={'lot': lot.id})
        lot.remaining = 0
    soon = (await db.scalars(select(BonusLot).where(BonusLot.account_id == user.id, BonusLot.remaining > 0,
        BonusLot.expires_at > at, BonusLot.expires_at <= at+timedelta(days=3)))).all()
    for lot in soon:
        await notify(db, user.id, f'loyalty:expiry:{lot.id}', f'Ваши {lot.remaining:g} бонусов сгорят {aware(lot.expires_at):%d.%m.%Y}.')
    await db.flush()


async def summary(db, user_id, business_id=DAM):
    await policy(db, lock=True, business_id=business_id)
    user = await account(db, user_id, business_id=business_id)
    await expire(db, user)
    m = await member(db, user)
    entries = (await db.scalars(select(Bonus).where(Bonus.account_id == user.id).order_by(Bonus.id.desc()).limit(200))).all()
    lots = (await db.scalars(select(BonusLot).where(BonusLot.account_id == user.id, BonusLot.remaining > 0).order_by(BonusLot.expires_at.asc().nullslast()))).all()
    return {'business_id':user.business_id, 'customer_id':user.customer_id, 'balance': user.bonus_balance, 'debt': user.bonus_debt, 'rules': await rules(db, business_id),
        'referral_code': m.referral_code, 'enrolled': bool(m.enabled),
        'expires': [{'amount': l.remaining, 'at': l.expires_at} for l in lots if l.expires_at],
        'history': [{'id': e.id, 'kind': e.kind, 'amount': e.points, 'reason': e.reason, 'order_id': e.order_id,
            'created_at': e.created_at, 'expires_at': e.expires_at, 'balance_after': e.balance_after} for e in entries]}


def quote(policy_data, food_after_discounts, requested, balance):
    food, requested, balance = amount(food_after_discounts), amount(requested), amount(balance)
    if min(food, requested, balance) < 0:
        raise HTTPException(422, 'Сумма бонусов не может быть отрицательной')
    maximum = min(balance, (food * amount(policy_data['max_spend_percent']) / 100).quantize(CENT, rounding=ROUND_DOWN))
    if requested and not policy_data['spending_enabled']:
        raise HTTPException(409, 'Списание бонусов отключено')
    if requested > maximum:
        raise HTTPException(422, f'Доступно к списанию не более {maximum:g} бонусов')
    return requested, maximum


async def price_snapshot(db, *, food, promo, delivery, service, requested=0, user=None, business_id=DAM):
    p = await rules(db, business_id)
    balance = ZERO
    if user and isinstance(user, User) and not user.phone_verified_at:
        if amount(requested): raise HTTPException(409,'Подтвердите телефон для списания бонусов')
        user = None
    if user:
        await policy(db, lock=True, business_id=business_id)
        user = await account(db, user.id, business_id=business_id)
        await expire(db, user)
        if not await identity(db, user):
            if amount(requested):
                raise HTTPException(409, 'Телефон связан с другим бонусным аккаунтом. Обратитесь к владельцу.')
        elif user.enabled:
            balance = amount(user.bonus_balance)
    spent, maximum = quote(p, max(ZERO, amount(food)-amount(promo)), requested, balance)
    eligible = max(ZERO, amount(food)-amount(promo)-spent)
    return {'version': 1, 'business_id': business_id, 'policy': p, 'food_amount': str(amount(food)), 'promo_discount': str(amount(promo)),
        'eligible_amount': str(eligible), 'bonus_rate': str(p['cashback_rate']), 'bonus_spent': str(spent),
        'delivery_fee': str(amount(delivery)), 'service_fee': str(amount(service)),
        'total_amount': str(eligible+amount(delivery)+amount(service)), 'maximum_spend': str(maximum),
        'bonus_earned': '0', 'paid_amount': '0', 'finalized': False}


async def spend(db, user, order):
    business_id = order.business_id or DAM
    await policy(db, lock=True, business_id=business_id)
    user = await account(db, order.customer_id or user.id, business_id=business_id)
    if not user.enabled or not await identity(db, user):
        raise HTTPException(409, 'Бонусный аккаунт не активен или требует проверки')
    await expire(db, user)
    key = f'spend:{order.id}'
    if await db.scalar(select(Bonus.id).where(Bonus.idempotency_key == key)):
        return
    snap = order.loyalty_snapshot
    if not snap:
        raise HTTPException(409, 'Пересчитайте заказ перед списанием бонусов')
    quantity, _ = quote(snap['policy'], amount(snap['food_amount'])-amount(snap['promo_discount']),
        order.bonus_points_used, user.bonus_balance)
    if quantity != amount(snap['bonus_spent']):
        raise HTTPException(409, 'Сумма списания изменилась')
    order.customer_id = str(user.customer_id)
    if quantity:
        entry = await post(db, user, 'SPEND', -quantity, key, f'Списание за заказ №{order.id}', order_id=order.id)
        await consume(db, user, entry, quantity)
        await notify(db, user.id, f'loyalty:{key}', f'Списано {quantity:g} бонусов. Осталось: {user.bonus_balance:g}.')


async def restore_spend(db, user, order):
    original = await db.scalar(select(Bonus).where(Bonus.idempotency_key == f'spend:{order.id}'))
    if not original:
        # Historical records remain supported; never invent a spend from a client field.
        original = await db.scalar(select(Bonus).where(Bonus.account_id == user.id, Bonus.order_id == order.id, Bonus.kind == 'SPEND'))
    if not original:
        return
    key = f'restore:{order.id}'
    if await db.scalar(select(Bonus.id).where(Bonus.idempotency_key == key)):
        return
    allocations = (await db.scalars(select(BonusAllocation).where(BonusAllocation.debit_id == original.id))).all()
    # Restore original deadlines. Already expired value receives an EXPIRE entry
    # in this transaction, so cancellation cannot renew old promotional credit.
    if allocations:
        for a in allocations:
            lot = await db.get(BonusLot, a.lot_id)
            await post(db, user, 'REVERSAL', a.amount, f'{key}:{a.id}', f'Возврат списания заказа №{order.id}',
                order_id=order.id, expires_at=lot.expires_at, details={'reversal_of': original.id})
        await post(db, user, 'REVERSAL', 0, key, f'Завершён возврат списания №{order.id}', order_id=order.id)
    else:
        await post(db, user, 'REVERSAL', -amount(original.points), key, f'Возврат списания №{order.id}', order_id=order.id)
    await expire(db, user)


async def bind_referrer(db, user, code, business_id=DAM):
    p = await policy(db, lock=True, business_id=business_id)
    if not p.settings.get('referral_enabled', True):
        raise HTTPException(409, 'Приглашения временно отключены')
    user = await account(db, user.id, business_id=business_id)
    customer = await db.get(Customer, user.customer_id)
    if not customer.verified_at:
        raise HTTPException(409, "Подтвердите телефон для реферальной программы")
    if not await identity(db, user):
        raise HTTPException(409, 'Для приглашения нужен уникальный подтверждённый телефон')
    target = await db.scalar(select(BonusMember).where(BonusMember.referral_code == code, BonusMember.business_id == business_id))
    if not target or target.id == user.id:
        raise HTTPException(422, 'Недопустимый код приглашения')
    existing = await db.get(BonusReferral, user.id)
    if existing:
        if existing.referrer_id == target.id:
            return existing
        raise HTTPException(409, 'Пригласивший уже сохранён')
    m = await member(db, user)
    if m.welcome_order_id or m.legacy_welcome or await db.scalar(select(Food_orders.id).where(
        Food_orders.customer_id == user.customer_id, Food_orders.business_id == business_id, Food_orders.status == 'done', Food_orders.payment_status == 'paid')):
        raise HTTPException(409, 'Приглашение можно применить только до первого успешного заказа')
    cursor, visited = target.id, {user.id}
    while cursor:
        if cursor in visited:
            raise HTTPException(422, 'Циклические приглашения запрещены')
        visited.add(cursor)
        parent = await db.get(BonusReferral, cursor)
        cursor = parent.referrer_id if parent else None
    referrer = await account(db, target.id, business_id=business_id)
    referrer_customer = await db.get(Customer, referrer.customer_id)
    if not referrer.enabled or not referrer_customer.verified_at or not await identity(db, referrer):
        raise HTTPException(409, 'Приглашение требует проверки владельцем')
    row = BonusReferral(referred_id=user.id, referrer_id=target.id)
    db.add(row)
    audit(db, 'loyalty_referral_bound', {'id': user.id, 'role': 'customer'}, 'users', user.id, {'referrer': target.id})
    await db.flush()
    return row


async def reward(db, user, order, kind, quantity, days, key, risk=None):
    if quantity <= 0:
        return
    if risk:
        if not await db.scalar(select(BonusReview.id).where(BonusReview.business_key == key)):
            db.add(BonusReview(business_key=key, account_id=user.id, order_id=order.id, kind=kind, reason=risk,
                details={'amount': str(quantity), 'days': days}))
        return
    existing = await db.scalar(select(Bonus.id).where(Bonus.idempotency_key == key))
    if not existing:
        entry = await post(db, user, kind, quantity, key, {'EARN': 'Бонусы за заказ', 'WELCOME': 'Бонус за первый заказ',
            'REFERRAL': 'Друг сделал первый заказ'}[kind]+f' №{order.id}', order_id=order.id,
            expires_at=now()+timedelta(days=float(days)), details={'snapshot': order.loyalty_snapshot})
        await notify(db, user.id, f'loyalty:{key}', f'{entry.reason}. Начислено {quantity:g} бонусов. Баланс: {user.bonus_balance:g}.')


async def settle(db, order):
    if order.status not in ('done', 'cancelled') or not order.loyalty_snapshot:
        return
    business_id = order.business_id or DAM
    await policy(db, lock=True, business_id=business_id)
    if not order.customer_id:
        from services.crm import attach_order
        await attach_order(db, order)
    if not order.customer_id: return
    user = await account(db, order.customer_id, internal=True, business_id=business_id)
    await expire(db, user)
    order.customer_id = user.customer_id
    if order.status == 'cancelled':
        await restore_spend(db, user, order)
        return
    if not user.enabled:
        return
    if order.payment_status != 'paid' or amount(order.paid_amount) < amount(order.total_amount) or amount(order.total_amount) <= 0:
        return
    snap = order.loyalty_snapshot
    # Never retroactively apply current policy to a historical order.
    if not snap or snap.get('finalized'):
        return
    p = snap['policy']
    earned = (amount(snap['eligible_amount']) * amount(snap['bonus_rate'])/100).quantize(Decimal('1'), rounding=ROUND_HALF_UP) if p['earning_enabled'] else ZERO
    snap = {**snap, 'finalized': True, 'bonus_earned': '0', 'bonus_expected': str(earned), 'paid_amount': str(amount(order.paid_amount)),
        'finalized_at': now().isoformat(), 'refund_amount': '0'}
    order.loyalty_snapshot = snap
    risk = None if await identity(db, user) else 'Телефон отсутствует или связан с несколькими аккаунтами'
    today = now()-timedelta(days=1)
    count = await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.account_id == user.id, Bonus.kind == 'EARN', Bonus.created_at >= today))
    if count >= int(p['customer_daily_order_limit']):
        risk = 'Превышен порог успешных заказов за сутки'
    if snap.get('test_order'):
        return
    await reward(db, user, order, 'EARN', earned, p['regular_days'], f'earn:{order.id}', risk)
    m = await member(db, user)
    first = not m.welcome_order_id and not m.legacy_welcome
    if first:
        m.welcome_order_id = order.id
        await reward(db, user, order, 'WELCOME', amount(p['welcome_amount']), p['welcome_days'], f'welcome:{user.id}', risk)
        referral = await db.get(BonusReferral, user.id)
        if referral and not referral.qualified_order_id and p['referral_enabled']:
            referrer = await account(db, referral.referrer_id, internal=True, business_id=business_id)
            await expire(db, referrer)
            referral.qualified_order_id = order.id
            daily = await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.account_id == referrer.id,
                Bonus.kind == 'REFERRAL', Bonus.created_at >= today))
            r_risk = risk or (None if await identity(db, referrer) else 'Неоднозначный аккаунт пригласившего')
            if daily >= int(p['referral_daily_limit']):
                r_risk = 'Превышен суточный порог рефералов'
            await reward(db, referrer, order, 'REFERRAL', amount(p['referral_amount']), p['regular_days'], f'referral:{user.id}', r_risk)
    await refresh_receipt_snapshot(db, order, user)
    await db.flush()


async def refresh_receipt_snapshot(db, order, user):
    earned = await db.scalar(select(func.coalesce(func.sum(Bonus.points), 0)).where(Bonus.order_id == order.id, Bonus.account_id == user.id, Bonus.kind.in_(('EARN', 'WELCOME'))))
    order.loyalty_snapshot = {**(order.loyalty_snapshot or {}), 'bonus_earned': str(amount(earned)), 'balance_after': str(amount(user.bonus_balance))}


async def refund(db, order, cumulative_refund, actor=None):
    business_id = order.business_id or DAM
    await policy(db, lock=True, business_id=business_id)
    snap = order.loyalty_snapshot
    if not snap or not snap.get('finalized'):
        return
    total = amount(snap['total_amount'])
    cumulative = amount(cumulative_refund)
    if cumulative < amount(snap.get('refund_amount', 0)) or cumulative > total or cumulative < 0:
        raise HTTPException(422, 'Некорректная накопленная сумма возврата')
    if cumulative == amount(snap.get('refund_amount', 0)):
        return
    ratio = min(Decimal(1), cumulative/total) if total else Decimal(1)
    # Proportional order-wide refund; original eligible amount excludes delivery.
    entries = (await db.scalars(select(Bonus).where(Bonus.order_id == order.id, Bonus.kind.in_(('EARN', 'WELCOME', 'REFERRAL'))))).all()
    for original in entries:
        target = (amount(original.points)*ratio).quantize(Decimal('1'), rounding=ROUND_HALF_UP) if original.kind == 'EARN' else (amount(original.points) if ratio == 1 else ZERO)
        previous = (await db.scalars(select(Bonus).where(Bonus.kind == 'REVERSAL', Bonus.idempotency_key.like(f'clawback:{original.id}:%')))).all()
        already = sum((amount((e.details or {}).get('nominal_reversed', -e.points)) for e in previous), ZERO)
        nominal = max(ZERO, target-already)
        if nominal:
            user = await account(db, original.account_id, internal=True, business_id=business_id)
            await expire(db, user)
            lot = await db.scalar(select(BonusLot).where(BonusLot.entry_id == original.id))
            expired = ZERO
            if lot:
                expired_entry = await db.scalar(select(Bonus).where(Bonus.idempotency_key == f'expire:{lot.id}'))
                expired = -amount(expired_entry.points) if expired_entry else ZERO
            # Expired credits already reduced liability; a refund must not debit
            # them a second time. Track nominal reversal even when delta is zero.
            previous_recovered = -sum((amount(e.points) for e in previous), ZERO)
            delta = max(ZERO, min(target, amount(original.points)-expired)-previous_recovered)
            entry = await post(db, user, 'REVERSAL', -delta, f'clawback:{original.id}:{target}', f'Отмена начисления при возврате №{order.id}',
                order_id=order.id, actor=actor, details={'reversal_of': original.id, 'refund_total': str(cumulative), 'nominal_reversed': str(nominal)}, clawback=True)
            remaining = min(delta, amount(entry.balance_before))
            if lot and lot.remaining and remaining:
                take = min(amount(lot.remaining), remaining)
                lot.remaining = amount(lot.remaining)-take
                db.add(BonusAllocation(debit_id=entry.id, lot_id=lot.id, amount=take))
                remaining -= take
                await db.flush()
            if remaining:
                await consume(db, user, entry, remaining)
    order.loyalty_snapshot = {**snap, 'refund_amount': str(cumulative)}
    if ratio == 1 and order.customer_id:
        await restore_spend(db, await account(db, order.customer_id, internal=True, business_id=business_id), order)
    await db.flush()


async def adjust(db, user_id, delta, reason, key, actor, business_id=DAM):
    if not reason.strip():
        raise HTTPException(422, 'Укажите причину корректировки')
    await policy(db, lock=True, business_id=business_id)
    user = await account(db, user_id, business_id=business_id)
    await expire(db, user)
    previous = await db.scalar(select(Bonus).where(Bonus.idempotency_key == 'manual:'+key))
    if previous:
        if previous.account_id != user.id or amount(previous.points) != amount(delta) or previous.reason != reason.strip():
            raise HTTPException(409, 'Параметры повторной корректировки отличаются')
        return
    p = await rules(db, business_id)
    entry = await post(db, user, 'MANUAL_ADJUSTMENT', delta, 'manual:'+key, reason.strip(), actor=actor,
        expires_at=now()+timedelta(days=float(p['regular_days'])) if amount(delta)>0 else None)
    if amount(delta)<0:
        await consume(db, user, entry, -amount(delta))
    await db.flush()


async def resolve_review(db, review_id, approved, reason, actor, business_id=DAM):
    await policy(db, lock=True, business_id=business_id)
    review = await db.get(BonusReview, review_id)
    checked_account = await db.get(BonusMember, review.account_id) if review else None
    if not checked_account or checked_account.business_id != business_id:
        raise HTTPException(404, 'Проверка не найдена')
    if review.status != 'REVIEW':
        return
    if not reason.strip():
        raise HTTPException(422, 'Укажите причину решения')
    order = await db.get(Food_orders, review.order_id)
    if approved and (not order or order.status != 'done' or order.payment_status != 'paid' or amount(order.paid_amount)<amount(order.total_amount)
            or amount((order.loyalty_snapshot or {}).get('refund_amount'))>0):
        raise HTTPException(409, 'Заказ уже не соответствует условиям начисления')
    review.status = 'NORMAL' if approved else 'BLOCKED'
    audit(db, 'loyalty_review_resolved', actor, 'bonus_reviews', review.id, {'old': 'REVIEW', 'new': review.status, 'reason': reason})
    if approved:
        user = await account(db, review.account_id, business_id=business_id)
        await post(db, user, review.kind, review.details['amount'], review.business_key, reason, actor=actor,
            order_id=review.order_id, expires_at=now()+timedelta(days=float(review.details['days'])), details={'review': review.id})
        await notify(db, user.id, f'loyalty:{review.business_key}', f'Начислено {review.details["amount"]} бонусов. Баланс: {user.bonus_balance:g}.')
        if order.customer_id == user.customer_id:
            await refresh_receipt_snapshot(db, order, user)
    await db.flush()


async def maintain_expirations(db):
    # Every account with due/soon lots; no fixed first-page starvation.
    ids = (await db.scalars(select(BonusLot.account_id).where(BonusLot.remaining > 0,
        BonusLot.expires_at <= now()+timedelta(days=3)).distinct())).all()
    for uid in ids:
        row = await db.get(BonusMember, uid)
        await policy(db, lock=True, business_id=row.business_id)
        await expire(db, await account(db, uid, internal=True, business_id=row.business_id))
    await db.commit()
