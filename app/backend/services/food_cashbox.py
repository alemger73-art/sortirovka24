"""Physical cash only. No inferred bank funds, courier custody or legacy opening."""
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, text

from models.food_cashbox import FoodCashEntry
from services.dam_order_workflow import money

LABELS = {'opening':'Начальный остаток', 'payment':'Оплата заказа', 'refund':'Возврат клиенту',
    'handover':'Наличные от курьера', 'deposit':'Внесение денег', 'expense':'Расход из кассы',
    'withdrawal':'Изъятие денег', 'correction':'Корректировка по пересчёту'}


async def lock(db):
    # Separate lock from order/shift operations. No order/profile locks are
    # acquired after this lock, preventing an inverse order with payment flows.
    if db.bind.dialect.name == 'postgresql':
        await db.execute(text('SELECT pg_advisory_xact_lock(24002702)'))


async def opening(db):
    return await db.scalar(select(FoodCashEntry).where(FoodCashEntry.entry_key == 'opening'))


async def balance(db):
    return money(await db.scalar(select(func.sum(FoodCashEntry.amount))))


async def snapshot(db, limit=100):
    start = await opening(db)
    if not start:
        return {'configured':False, 'balance':None, 'entries':[]}
    rows = (await db.scalars(select(FoodCashEntry).order_by(FoodCashEntry.created_at.desc(), FoodCashEntry.id).limit(limit))).all()
    return {'configured':True, 'balance':float(await balance(db)), 'opened_at':start.created_at,
        'entries':[{'id':r.id, 'kind':r.kind, 'label':LABELS.get(r.kind,r.kind), 'amount':float(r.amount),
            'recipient':r.recipient, 'reason':r.reason, 'actor':r.actor, 'actor_id':r.actor_id,
            'shift_id':r.shift_id, 'order_id':r.order_id, 'expense_id':r.expense_id, 'created_at':r.created_at} for r in rows]}


async def automatic(db, *, key, kind, amount, actor, actor_id='', recipient='', reason='', order_id=None):
    await lock(db)
    if not await opening(db):
        return  # Owner must count existing physical cash once, not guess it.
    previous = await db.scalar(select(FoodCashEntry).where(FoodCashEntry.entry_key == key))
    if previous:
        return previous
    entry = FoodCashEntry(id=str(uuid4()), entry_key=key, kind=kind, amount=money(amount),
        actor=actor[:200], actor_id=str(actor_id), recipient=recipient[:200], reason=reason[:1000], order_id=order_id)
    db.add(entry)
    return entry


async def manual(db, body, claims, shift):
    from datetime import datetime, timedelta, timezone
    from models.food_business import FoodExpense
    from services.food_operations import now
    from services.food_shifts import record_action

    await lock(db)
    amount = money(body.amount)
    recipient = body.recipient.strip()
    reason = body.reason.strip()
    if not reason or (body.kind in ('expense','withdrawal','deposit') and not recipient):
        raise HTTPException(422, 'Укажите получателя / от кого деньги и назначение')
    if body.kind in ('opening','correction') and claims['access_role'] != 'owner':
        raise HTTPException(403, 'Начальный остаток и пересчёт доступны владельцу')
    signed = -amount if body.kind in ('expense','withdrawal') else amount
    previous = await db.get(FoodCashEntry, str(body.id))
    if previous:
        if (previous.kind, money(previous.amount), previous.recipient, previous.reason) != (body.kind, signed, recipient, reason):
            raise HTTPException(409, 'Повторная операция содержит другие данные')
        if previous.actor_id != str(claims.get('staff_id') or claims.get('sub') or 'admin'):
            raise HTTPException(409, 'Эта операция уже записана другим сотрудником')
        if body.kind == 'expense':
            expense = await db.get(FoodExpense, previous.expense_id)
            if expense.category != body.category:
                raise HTTPException(409, 'Категория повторного расхода отличается')
        return previous
    start = await opening(db)
    if body.kind == 'opening':
        if start:
            raise HTTPException(409, 'Начальный остаток уже задан. Используйте корректировку по пересчёту.')
    elif not start:
        raise HTTPException(409, 'Владелец должен сначала указать фактический начальный остаток кассы')
    if body.kind in ('expense','withdrawal') and amount > await balance(db):
        raise HTTPException(409, 'В кассе недостаточно денег. Проверьте остаток и поступления.')
    if body.kind == 'correction' and await balance(db) + amount < 0:
        raise HTTPException(422, 'После пересчёта остаток не может быть отрицательным')
    name = str(claims.get('display_name') or claims.get('sub') or 'Сотрудник')[:200]
    row = FoodCashEntry(id=str(body.id), entry_key='opening' if body.kind == 'opening' else 'manual:'+str(body.id),
        kind=body.kind, amount=signed, recipient=recipient, reason=reason, actor=name,
        actor_id=str(claims.get('staff_id') or claims.get('sub') or 'admin'), shift_id=shift.id if shift else None)
    if body.kind == 'expense':
        # The same expense appears in the existing owner financial report.
        db.add(FoodExpense(id=row.id, day=datetime.now(timezone(timedelta(hours=5))).date().isoformat(),
            amount=amount, category=body.category, note=f'{recipient}: {reason}', actor=name, created_at=now(), voided=False))
        await db.flush()
        row.expense_id = row.id
    db.add(row)
    record_action(db, shift, 'cashbox_'+body.kind, claims=claims, entity_type='cashbox', entity_id=row.id,
        details={'amount':str(signed), 'recipient':recipient, 'reason':reason})
    await db.flush()
    return row
