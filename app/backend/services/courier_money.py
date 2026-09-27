"""Exact money ledger. No external calls or commits inside mutation helpers.

All writers share DAM's transaction lock + courier profile row lock. Entries
are immutable; entry_key makes task accruals and explicit payout retries unique.
Legacy balance is retained but not guessed into a cash/payroll opening balance.
"""
from decimal import Decimal
import hashlib
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, func, update
from models.auth import User
from models.logistics import CourierProfile
from models.food_shifts import FoodShift
from models.courier_workflow import CourierLedger, CourierCashHandover
from services.dam_order_workflow import money, paid
from services.food_shifts import active_shift, record_action
from services.food_preorders import lock_dam_operations

LABELS = {'cash_collected':'Получено от клиента','cash_handed_over':'Передано оператору',
          'cash_adjustment':'Корректировка наличных','earning':'Начислено за доставку','payout':'Выплачено курьеру'}

async def lock_wallet(db, courier_id):
    await lock_dam_operations(db)
    profile = await db.scalar(select(CourierProfile).where(CourierProfile.user_id==courier_id)
        .with_for_update().execution_options(populate_existing=True))
    if not profile:
        raise HTTPException(404,'Курьер не найден')
    return profile

async def totals(db, courier_id, shift_id=None):
    query=select(CourierLedger.event_type,func.sum(CourierLedger.amount)).where(CourierLedger.courier_id==courier_id)
    if shift_id is not None:
        query=query.where(CourierLedger.shift_id==shift_id)
    return {key:money(value) for key,value in (await db.execute(query.group_by(CourierLedger.event_type))).all()}

def cash_balance(sums):
    return sums.get('cash_collected',Decimal(0))-sums.get('cash_handed_over',Decimal(0))+sums.get('cash_adjustment',Decimal(0))

async def view(db, courier_id):
    shift=await active_shift(db,'courier',courier_id)
    if not shift:
        shift=await db.scalar(select(FoodShift).where(FoodShift.staff_type=='courier',FoodShift.staff_id==courier_id).order_by(FoodShift.id.desc()).limit(1))
    all_sums=await totals(db,courier_id)
    sums=await totals(db,courier_id,shift.id) if shift else {}
    events=(await db.scalars(select(CourierLedger).where(CourierLedger.courier_id==courier_id).order_by(CourierLedger.id.desc()).limit(100))).all()
    count=await db.scalar(select(func.count()).select_from(CourierLedger).where(CourierLedger.courier_id==courier_id,CourierLedger.event_type=='earning',CourierLedger.shift_id==(shift.id if shift else -1)))
    pending=await db.scalar(select(CourierCashHandover.id).where(CourierCashHandover.active_key==courier_id))
    return {'collected':float(sums.get('cash_collected',0)), 'handed_over':float(sums.get('cash_handed_over',0)),
        'cash_balance':float(cash_balance(all_sums)), 'earned':float(sums.get('earning',0)),
        'earned_total':float(all_sums.get('earning',0)), 'paid_total':float(all_sums.get('payout',0)),
        'payout_due':float(all_sums.get('earning',Decimal(0))-all_sums.get('payout',Decimal(0))),
        'deliveries':count or 0,'pending_handover':pending,'shift_id':shift.id if shift else None,
        'events':[{'id':e.id,'type':e.event_type,'label':LABELS[e.event_type],'amount':float(e.amount),
            'created_at':e.created_at.replace(tzinfo=timezone.utc).isoformat(),'actor':e.actor,'comment':e.comment,'task_id':e.task_id,'shift_id':e.shift_id} for e in events]}

async def add_entry(db, *, key, courier_id, shift, kind, amount, actor, actor_id, task=None, comment=''):
    previous=await db.scalar(select(CourierLedger).where(CourierLedger.entry_key==key))
    if previous:
        return previous
    entry=CourierLedger(entry_key=key,courier_id=courier_id,shift_id=shift.id if shift else None,
        task_id=task.id if task else None,order_id=task.source_id if task and task.source_type=='food_orders' else None,
        event_type=kind,amount=money(amount),actor=actor,actor_id=str(actor_id),comment=comment)
    db.add(entry)
    # Staff-confirmed transfers/payouts are audited by their caller under the
    # actual staff identity, never falsely attributed to the recipient courier.
    if kind in ('cash_collected','earning'):
        record_action(db,shift,kind,staff_type='courier',staff_id=courier_id,staff_name=actor,role='courier',
            entity_type='order' if task else 'courier',entity_id=task.source_id if task else courier_id,
            details={'amount':str(money(amount)),'actor_id':str(actor_id),'task_id':task.id if task else None,'comment':comment})
    await db.flush()
    return entry

async def collect_cash(db, task, order, courier, shift):
    if not order or order.payment_method != 'cash':
        raise HTTPException(422,'Курьер может подтвердить только наличную оплату')
    outstanding=max(Decimal(0),money(order.total_amount)-paid(order))
    if not outstanding:
        return
    # Server amount, existing payment journal, same order transaction.
    from services.food_payments import receive_outstanding
    await receive_outstanding(db,order,courier.name or 'Курьер')
    order.payment_status='paid'
    task.paid_amount=order.paid_amount
    await add_entry(db,key=f'cash:{task.id}',courier_id=str(courier.id),shift=shift,
        kind='cash_collected',amount=outstanding,actor=courier.name or 'Курьер',actor_id=courier.id,task=task)

async def accrue(db, task, courier, shift, payout):
    await add_entry(db,key=f'earning:{task.id}',courier_id=str(courier.id),shift=shift,
        kind='earning',amount=payout,actor=courier.name or 'Курьер',actor_id=courier.id,task=task)

async def request_handover(db, courier_id):
    await lock_wallet(db,courier_id)
    shift=await active_shift(db,'courier',courier_id)
    if not shift: raise HTTPException(409,'Сначала откройте смену')
    pending=await db.scalar(select(CourierCashHandover).where(CourierCashHandover.active_key==courier_id))
    if pending:return pending
    amount=cash_balance(await totals(db,courier_id))
    if amount<=0: raise HTTPException(409,'Нет наличных для передачи')
    row=CourierCashHandover(courier_id=courier_id,shift_id=shift.id,active_key=courier_id,amount=amount,status='pending')
    db.add(row);await db.flush()
    record_action(db,shift,'cash_handover_requested',entity_type='cash_handover',entity_id=row.id,details={'amount':str(amount)})
    return row

async def confirm_handover(db, id, claims):
    await lock_dam_operations(db)
    row=await db.scalar(select(CourierCashHandover).where(CourierCashHandover.id==id).with_for_update())
    if not row:raise HTTPException(404,'Передача не найдена')
    await lock_wallet(db,row.courier_id)
    if row.status=='confirmed':return row
    if cash_balance(await totals(db,row.courier_id))<money(row.amount):
        raise HTTPException(409,'Остаток изменился. Проверьте передачу')
    name=str(claims.get('display_name') or claims.get('sub') or 'Сотрудник')
    staff=str(claims.get('staff_id') or claims.get('sub') or 'admin')
    shift=await db.get(FoodShift,row.shift_id)
    await add_entry(db,key=f'handover:{row.id}',courier_id=row.courier_id,shift=shift,
        kind='cash_handed_over',amount=row.amount,actor=name,actor_id=staff,comment=f'Передача №{row.id}')
    row.status='confirmed';row.active_key=None;row.confirmed_at=datetime.now(timezone.utc);row.confirmed_by=staff
    record_action(db,None,'cash_handed_over',claims=claims,entity_type='courier',entity_id=row.courier_id,details={'handover_id':row.id,'amount':str(row.amount)})
    return row

async def payout(db, courier_id, body, claims):
    await lock_wallet(db,courier_id)
    key='payout:'+hashlib.sha256(f'{courier_id}:{body.request_key}'.encode()).hexdigest()
    previous=await db.scalar(select(CourierLedger).where(CourierLedger.entry_key==key))
    amount=money(body.amount)
    if not body.comment.strip():raise HTTPException(422,'Укажите комментарий к выплате')
    if previous:
        if money(previous.amount)!=amount or previous.comment!=body.comment.strip():
            raise HTTPException(409,'Повторная выплата имеет другие параметры')
        return previous
    sums=await totals(db,courier_id)
    due=sums.get('earning',Decimal(0))-sums.get('payout',Decimal(0))
    if amount<=0 or amount>due:raise HTTPException(422,'Выплата должна быть больше нуля и не превышать начисленный остаток')
    entry=await add_entry(db,key=key,courier_id=courier_id,shift=await active_shift(db,'courier',courier_id),
        kind='payout',amount=amount,actor=str(claims.get('display_name') or claims.get('sub') or 'Владелец'),
        actor_id=str(claims.get('staff_id') or 'admin'),comment=body.comment.strip())
    record_action(db,None,'courier_payout_paid',claims=claims,entity_type='courier',entity_id=courier_id,details={'amount':str(amount),'entry_id':entry.id})
    return entry
