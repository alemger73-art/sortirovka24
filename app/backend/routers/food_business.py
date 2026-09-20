"""Small operational accounting, not tax accounting. All amounts are server-derived."""
import json
import re
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.food_staff_guard import food_staff, food_owner
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.food_business import FoodExpense, FoodRefund
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.partner_auth import PartnerCredentials
from models.food_shifts import FoodShift
from models.logistics import CourierProfile
from models.auth import User
from services.food_shifts import record_action, require_partner_shift
from services.food_operations import scope, brand, now, add_event
from services.food_payments import movement, preserve_legacy_payment, record
from services.dam_order_workflow import paid, claim

router = APIRouter(prefix='/api/v1/dam-alem/business', tags=['DAM ALEM business'])
CITY = timezone(timedelta(hours=5))

def city_today(): return datetime.now(CITY).date()
def actor(claims): return str(claims.get('display_name') or claims.get('username') or claims.get('sub') or 'Владелец')[:200]
def money(value):
    try:
        result=Decimal(str(value or 0))
        return result.quantize(Decimal('0.01')) if result.is_finite() else Decimal(0)
    except (InvalidOperation, ValueError): return Decimal(0)
def day_of(value):
    if not value: return None
    try:
        dt=datetime.fromisoformat(value.replace('Z','+00:00'))
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).astimezone(CITY).date()
    except (ValueError, TypeError): return None
def period(start, end):
    if start>end or (end-start).days>366: raise HTTPException(422,'Выберите период до 367 дней, начало не позже конца')
    return lambda day: day is not None and start <= day <= end

@router.get('/me')
async def me(claims=Depends(food_staff)):
    return {'role':claims['access_role'],'name':actor(claims)}

@router.get('/today')
async def today(db:AsyncSession=Depends(get_db),claims=Depends(food_staff)):
    condition=await scope(db)
    counts=dict((await db.execute(select(Food_orders.status,func.count()).where(condition).group_by(Food_orders.status))).all())
    pending=await db.scalar(select(func.count()).select_from(FoodOrderEvent).join(Food_orders,Food_orders.id==FoodOrderEvent.order_id).where(condition,FoodOrderEvent.notification.in_(['failed','unknown'])))
    unpaid=await db.scalar(select(func.count()).select_from(Food_orders).where(condition,Food_orders.status!='cancelled',(Food_orders.payment_status!='paid') | Food_orders.payment_status.is_(None)))
    rows=(await db.scalars(select(Food_orders).where(condition,Food_orders.status=='new').order_by(Food_orders.id).limit(8))).all()
    day = city_today()
    candidates = (await db.execute(select(Food_orders.created_at, Food_orders.status, Food_orders.total_amount).where(condition, func.substr(Food_orders.created_at, 1, 10).in_([str(day), str(day - timedelta(days=1))])))).all()
    daily_orders = [r for r in candidates if day_of(r.created_at) == day]
    daily = {'created': len(daily_orders), 'order_total': float(sum((money(r.total_amount) for r in daily_orders if r.status != 'cancelled'), Decimal(0)))}
    return {'day':str(day),'daily':daily,'counts':counts,'notification_errors':pending,'unpaid':unpaid,'new_orders':[{'id':o.id,'name':o.customer_name,'amount':o.total_amount,'delivery_method':o.delivery_method,'created_at':o.created_at} for o in rows]}

@router.get('/report')
async def report(start:date, end:date, db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    inside=period(start,end)
    sales=Decimal(0); receipts=Decimal(0); bonuses=Decimal(0); completed=0; cancelled=0; created=0; undated_paid=0; undated_done=0
    promos=Decimal(0);untracked_promos=0
    methods={}; products={}; days={str(start+timedelta(days=i)):{'sales':Decimal(0),'receipts':Decimal(0),'expenses':Decimal(0),'refunds':Decimal(0)} for i in range((end-start).days+1)}
    cash_events = (await db.scalars(select(FoodOrderEvent).join(Food_orders, Food_orders.id == FoodOrderEvent.order_id).where(await scope(db), FoodOrderEvent.public_data.isnot(None)))).all()
    tracked = set(); journal_refunds = Decimal(0)
    for event in cash_events:
        entry = movement(event)
        if not entry:
            continue
        tracked.add(event.order_id)
        event_day = day_of(event.created_at)
        if not inside(event_day):
            continue
        amount = money(entry['amount'])
        if amount >= 0:
            receipts += amount
            key = entry.get('method') or 'unknown'
            methods[key] = methods.get(key, Decimal(0)) + amount
            days[str(event_day)]['receipts'] += amount
        else:
            journal_refunds -= amount
            days[str(event_day)]['refunds'] -= amount
    stream=await db.stream_scalars(select(Food_orders).where(await scope(db)))
    async for order in stream:
        if inside(day_of(order.created_at)): created+=1
        if order.status=='cancelled' and inside(day_of(order.cancelled_at)): cancelled+=1
        if order.status=='done' and not day_of(order.completed_at): undated_done+=1
        if order.payment_status=='paid' and not day_of(order.paid_at): undated_paid+=1
        if order.id not in tracked and paid(order) > 0 and inside(day_of(order.paid_at)):
            amount=paid(order);receipts+=amount;key=order.payment_method or 'unknown';methods[key]=methods.get(key,Decimal(0))+amount;days[str(day_of(order.paid_at))]['receipts']+=amount
        if order.status=='done' and inside(day_of(order.completed_at)):
            promos+=money(order.promo_discount_amount)
            if order.promo_discount_amount is None: untracked_promos+=1
            amount=money(order.total_amount);sales+=amount;completed+=1;bonuses+=money(order.bonus_discount_amount);days[str(day_of(order.completed_at))]['sales']+=amount
            try: items=json.loads(order.order_items or '[]')
            except (ValueError,TypeError): items=[]
            for item in items if isinstance(items,list) else []:
                if not isinstance(item,dict): continue
                name=str(item.get('name') or 'Блюдо')[:200];qty=money(item.get('quantity'));line=products.setdefault(name,{'quantity':Decimal(0),'amount':Decimal(0)})
                line['quantity']+=qty;line['amount']+=(money(item.get('price'))+money(item.get('modTotal')))*qty
    expenses=(await db.scalars(select(FoodExpense).where(FoodExpense.day>=str(start),FoodExpense.day<=str(end)).order_by(FoodExpense.day.desc(),FoodExpense.created_at.desc()))).all()
    spent=Decimal(0)
    for e in expenses:
        if not e.voided: spent+=e.amount;days[e.day]['expenses']+=e.amount
    refunds=(await db.scalars(select(FoodRefund).where(FoodRefund.day>=str(start),FoodRefund.day<=str(end)))).all()
    returned=journal_refunds + sum((r.amount for r in refunds),Decimal(0))
    for r in refunds: days[r.day]['refunds']+=r.amount
    candidates=(await db.scalars(select(Food_orders).where(await scope(db),~Food_orders.id.in_(select(FoodRefund.order_id))).order_by(Food_orders.id.desc()))).all()
    needs_refund=[{'id':o.id,'amount':float(max(Decimal(0), paid(o) - (Decimal(0) if o.status == 'cancelled' else money(o.total_amount))))} for o in candidates]
    needs_refund=[r for r in needs_refund if r['amount'] > 0]
    return {'start':str(start),'end':str(end),'sales':sales,'completed':completed,'created':created,'cancelled':cancelled,'average':sales/completed if completed else 0,'receipts':receipts,'refunds':returned,'expenses_total':spent,'cash_difference':receipts-returned-spent,'bonuses':bonuses,'promo_discounts':promos,'untracked_promos':untracked_promos,'payment_methods':methods,'undated_paid':undated_paid,'undated_done':undated_done,'products':[{'name':k,**v} for k,v in sorted(products.items(),key=lambda kv:kv[1]['quantity'],reverse=True)[:20]],'days':[{'day':k,**v} for k,v in days.items()],'expenses':[{'id':e.id,'day':e.day,'amount':e.amount,'category':e.category,'note':e.note,'voided':e.voided,'void_reason':e.void_reason} for e in expenses],'refunds_needed':needs_refund}

class ExpenseBody(BaseModel):
    id:UUID
    day:date
    amount:Decimal=Field(gt=0,le=100000000,max_digits=14,decimal_places=2)
    category:Literal['products','packaging','couriers','salary','rent','other']
    note:str=Field(min_length=1,max_length=1000)
    @field_validator('day')
    @classmethod
    def valid_day(cls,value):
        if value>city_today(): raise ValueError('Расход нельзя записать будущей датой')
        return value
    @field_validator('note')
    @classmethod
    def valid_note(cls,value):
        if not value.strip(): raise ValueError('Укажите назначение расхода')
        return value.strip()

@router.post('/expenses')
async def add_expense(body:ExpenseBody,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    values={'id':str(body.id),'day':str(body.day),'amount':body.amount,'category':body.category,'note':body.note}
    existing=await db.get(FoodExpense,values['id'])
    if existing:
        if any(getattr(existing,k)!=v for k,v in values.items()): raise HTTPException(409,'Эта операция уже сохранена с другими данными')
        return {'id':existing.id}
    db.add(FoodExpense(**values,actor=actor(claims),created_at=now(),voided=False))
    record_action(db,shift,'expense_recorded',claims=claims,entity_type='expense',entity_id=str(body.id),details={'amount':float(body.amount),'category':body.category,'day':str(body.day)})
    try: await db.commit()
    except IntegrityError:
        await db.rollback()
        existing=await db.get(FoodExpense,values['id'])
        if not existing or any(getattr(existing,k)!=v for k,v in values.items()): raise HTTPException(409,'Операция уже существует')
    return {'id':values['id']}

class Reason(BaseModel):
    reason:str=Field(min_length=3,max_length=500)

@router.post('/expenses/{expense_id}/void')
async def void_expense(expense_id:UUID,body:Reason,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    if len(body.reason.strip())<3: raise HTTPException(422,'Укажите причину исправления')
    expense=await db.get(FoodExpense,str(expense_id))
    if expense and expense.category=='salary' and expense.note.startswith('Зарплата: '):
        from models.food_payroll import FoodPayrollPayment, FoodPayrollDay
        from routers.food_payroll import lock_day
        payment=await db.get(FoodPayrollPayment,str(expense_id))
        if payment:
            period=await db.get(FoodPayrollDay,payment.day)
            await lock_day(db,payment.day,period.version if period else 0)
            payment.voided=True
            payment.void_reason=f'{actor(claims)}: {body.reason.strip()}'
    result=await db.execute(update(FoodExpense).where(FoodExpense.id==str(expense_id),FoodExpense.voided==False).values(voided=True,void_reason=f'{actor(claims)}: {body.reason.strip()}'))
    if not result.rowcount: raise HTTPException(409,'Расход уже исключён или не найден')
    record_action(db,shift,'expense_voided',claims=claims,entity_type='expense',entity_id=str(expense_id),details={'reason':body.reason.strip()})
    await db.commit()
    return {'ok':True}

class RefundBody(BaseModel):
    day:date
    note:str=Field(min_length=3,max_length=1000)

@router.post('/refunds/{order_id}')
async def refund(order_id:int,body:RefundBody,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    order=await db.scalar(select(Food_orders).where(Food_orders.id==order_id,await scope(db)))
    if not order: raise HTTPException(404,'Заказ не найден')
    if body.day>city_today() or (day_of(order.paid_at) and body.day<day_of(order.paid_at)): raise HTTPException(422,'Проверьте дату возврата')
    if len(body.note.strip())<3: raise HTTPException(422,'Укажите как выполнен возврат')
    if await db.get(FoodRefund,order_id): raise HTTPException(409,'Возврат уже отмечен')
    await claim(db, order, order.version or 0)
    await preserve_legacy_payment(db, order)
    amount = max(Decimal(0), paid(order) - (Decimal(0) if order.status == 'cancelled' else money(order.total_amount)))
    if amount <= 0: raise HTTPException(409,'Суммы к возврату нет или возврат уже отмечен')
    timestamp = datetime.combine(body.day, datetime.min.time(), tzinfo=CITY).isoformat()
    event = record(db, order, -amount, actor(claims), at=timestamp)
    event.message += ': ' + body.note.strip()
    order.paid_amount = float(paid(order) - amount)
    from services.dam_order_workflow import sync_task
    await sync_task(db, order)
    record_action(db,shift,'refund_recorded',claims=claims,entity_type='order',entity_id=order_id,details={'amount':float(amount),'day':str(body.day)})
    try: await db.commit()
    except IntegrityError:
        await db.rollback();raise HTTPException(409,'Возврат уже отмечен')
    return {'ok':True}

async def item_condition(db):
    rows=(await db.execute(select(Food_restaurants.id,Food_restaurants.name,Food_restaurants.merchant_key))).all()
    return Food_items.restaurant_id.in_([r.id for r in rows if brand(r.name, r.merchant_key)])

@router.get('/availability')
async def availability(db:AsyncSession=Depends(get_db),claims=Depends(food_staff)):
    rows=(await db.scalars(select(Food_items).where(await item_condition(db),Food_items.is_active==True).order_by(Food_items.name))).all()
    return [{'id':i.id,'name':i.name,'available':i.available is not False} for i in rows]

class AvailableBody(BaseModel):
    available:bool

@router.patch('/availability/{item_id}')
async def set_available(item_id:int,body:AvailableBody,db:AsyncSession=Depends(get_db),claims=Depends(food_staff)):
    shift=await require_partner_shift(db,claims)
    result=await db.execute(update(Food_items).where(Food_items.id==item_id,await item_condition(db)).values(available=body.available))
    if not result.rowcount:
        await db.rollback();raise HTTPException(404,'Блюдо не найдено')
    record_action(db,shift,'product_availability_changed',claims=claims,entity_type='food_item',entity_id=item_id,details={'available':body.available})
    await db.commit()
    return {'ok':True}

@router.get('/staff')
async def staff_list(db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    rows=(await db.scalars(select(PartnerCredentials).where(PartnerCredentials.partner_type=='dam_alem').order_by(PartnerCredentials.id))).all()
    return [{'id':r.id,'name':r.display_name,'email':r.email,'phone':r.phone,'active':r.is_active,'role':r.access_role or 'owner','pin_set':bool(r.pin_hash)} for r in rows]

class StaffBody(BaseModel):
    name:str=Field(min_length=1,max_length=120)
    email:str=Field(min_length=5,max_length=255)
    password:str=Field(min_length=10,max_length=100)
    pin:str=Field(pattern=r'^\d{4}$')
    role:Literal['owner','operator']='operator'

@router.post('/staff')
async def staff_create(body:StaffBody,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    from routers.partner_auth import _hash_password
    from utils.courier_pin import hash_courier_pin
    email=body.email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email): raise HTTPException(422,'Укажите email для входа')
    if len(body.password.encode('utf-8'))>72: raise HTTPException(422,'Пароль слишком длинный, используйте до 72 байт')
    if not body.name.strip(): raise HTTPException(422,'Укажите имя сотрудника')
    row=PartnerCredentials(partner_type='dam_alem',email=email,display_name=body.name.strip(),password_hash=_hash_password(body.password),pin_hash=hash_courier_pin(body.pin),is_active=True,access_role=body.role)
    db.add(row)
    record_action(db,None,'staff_created',claims=claims,entity_type='staff',details={'name':row.display_name,'role':row.access_role})
    try: await db.commit()
    except IntegrityError:
        await db.rollback();raise HTTPException(409,'Этот email уже используется')
    return {'id':row.id}

@router.get('/staff/couriers')
async def courier_staff(db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    rows=(await db.execute(select(CourierProfile,User).join(User,User.id==CourierProfile.user_id).where(CourierProfile.is_verified==True).order_by(User.name,User.phone))).all()
    return [{'id':p.user_id,'name':u.name or p.phone or u.phone or 'Курьер','phone':p.phone or u.phone,'active':p.is_verified,'online':p.is_online,'role':'courier','pin_set':bool(p.pin_hash)} for p,u in rows]

class CourierStaffUpdate(BaseModel):
    pin:str=Field(pattern=r'^\d{4}$')

@router.patch('/staff/couriers/{user_id}/pin')
async def courier_staff_pin(user_id:str,body:CourierStaffUpdate,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    from utils.courier_pin import hash_courier_pin
    profile=await db.get(CourierProfile,user_id)
    if not profile or not profile.is_verified: raise HTTPException(404,'Подтверждённый курьер не найден')
    profile.pin_hash=hash_courier_pin(body.pin)
    record_action(db,None,'courier_pin_changed',claims=claims,entity_type='courier',entity_id=user_id)
    await db.commit();return {'ok':True}

class StaffUpdate(BaseModel):
    name:str|None=Field(None,min_length=1,max_length=120)
    active:bool|None=None
    role:Literal['owner','operator']|None=None
    pin:str|None=Field(None,pattern=r'^\d{4}$')
    password:str|None=Field(None,min_length=10,max_length=100)

async def _last_active_owner(db:AsyncSession, row:PartnerCredentials) -> bool:
    if (row.access_role or 'owner')!='owner' or not row.is_active: return False
    count=await db.scalar(select(func.count()).select_from(PartnerCredentials).where(PartnerCredentials.partner_type=='dam_alem',PartnerCredentials.is_active==True,func.coalesce(PartnerCredentials.access_role,'owner')=='owner'))
    return int(count or 0)<=1

@router.patch('/staff/{staff_id}')
async def staff_active(staff_id:int,body:StaffUpdate,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    from routers.partner_auth import _hash_password
    from utils.courier_pin import hash_courier_pin
    row=await db.get(PartnerCredentials,staff_id)
    if not row or row.partner_type!='dam_alem': raise HTTPException(404,'Сотрудник не найден')
    removes_owner=(body.active is False) or (body.role is not None and body.role!='owner')
    if removes_owner and await _last_active_owner(db,row): raise HTTPException(409,'Нельзя отключить или понизить последнего активного владельца')
    changes={}
    if body.name is not None: row.display_name=body.name.strip();changes['name']=row.display_name
    if body.active is not None: row.is_active=body.active;changes['active']=body.active
    if body.role is not None: row.access_role=body.role;changes['role']=body.role
    if body.pin is not None: row.pin_hash=hash_courier_pin(body.pin);changes['pin_changed']=True
    if body.password is not None:
        if len(body.password.encode('utf-8'))>72: raise HTTPException(422,'Пароль слишком длинный, используйте до 72 байт')
        row.password_hash=_hash_password(body.password);changes['password_changed']=True
    if not changes: raise HTTPException(422,'Нет изменений')
    record_action(db,None,'staff_updated',claims=claims,entity_type='staff',entity_id=staff_id,details=changes)
    await db.commit();return {'ok':True}

@router.delete('/staff/{staff_id}')
async def staff_delete(staff_id:int,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    row=await db.get(PartnerCredentials,staff_id)
    if not row or row.partner_type!='dam_alem': raise HTTPException(404,'Сотрудник не найден')
    if await _last_active_owner(db,row): raise HTTPException(409,'Нельзя удалить последнего активного владельца')
    active=await db.scalar(select(FoodShift.id).where(FoodShift.active_key==f'partner:{staff_id}'))
    if active: raise HTTPException(409,'Сначала сотрудник должен закрыть смену')
    snapshot={'name':row.display_name,'role':row.access_role or 'owner','email':row.email,'phone':row.phone}
    await db.delete(row)
    record_action(db,None,'staff_deleted',claims=claims,entity_type='staff',entity_id=staff_id,details=snapshot)
    await db.commit();return {'ok':True}
