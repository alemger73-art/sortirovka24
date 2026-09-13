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
from services.food_operations import scope, brand, now, add_event

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
    return {'day':str(city_today()),'counts':counts,'notification_errors':pending,'unpaid':unpaid,'new_orders':[{'id':o.id,'name':o.customer_name,'amount':o.total_amount,'delivery_method':o.delivery_method,'created_at':o.created_at} for o in rows]}

@router.get('/report')
async def report(start:date, end:date, db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    inside=period(start,end)
    sales=Decimal(0); receipts=Decimal(0); bonuses=Decimal(0); completed=0; cancelled=0; created=0; undated_paid=0; undated_done=0
    promos=Decimal(0);untracked_promos=0
    methods={}; products={}; days={str(start+timedelta(days=i)):{'sales':Decimal(0),'receipts':Decimal(0),'expenses':Decimal(0),'refunds':Decimal(0)} for i in range((end-start).days+1)}
    stream=await db.stream_scalars(select(Food_orders).where(await scope(db)))
    async for order in stream:
        if inside(day_of(order.created_at)): created+=1
        if order.status=='cancelled' and inside(day_of(order.cancelled_at)): cancelled+=1
        if order.status=='done' and not day_of(order.completed_at): undated_done+=1
        if order.payment_status=='paid' and not day_of(order.paid_at): undated_paid+=1
        if order.payment_status=='paid' and inside(day_of(order.paid_at)):
            amount=money(order.total_amount);receipts+=amount;key=order.payment_method or 'unknown';methods[key]=methods.get(key,Decimal(0))+amount;days[str(day_of(order.paid_at))]['receipts']+=amount
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
    returned=sum((r.amount for r in refunds),Decimal(0))
    for r in refunds: days[r.day]['refunds']+=r.amount
    needs_refund=(await db.scalars(select(Food_orders).where(await scope(db),Food_orders.status=='cancelled',Food_orders.payment_status=='paid',~Food_orders.id.in_(select(FoodRefund.order_id))).order_by(Food_orders.id.desc()))).all()
    return {'start':str(start),'end':str(end),'sales':sales,'completed':completed,'created':created,'cancelled':cancelled,'average':sales/completed if completed else 0,'receipts':receipts,'refunds':returned,'expenses_total':spent,'cash_difference':receipts-returned-spent,'bonuses':bonuses,'promo_discounts':promos,'untracked_promos':untracked_promos,'payment_methods':methods,'undated_paid':undated_paid,'undated_done':undated_done,'products':[{'name':k,**v} for k,v in sorted(products.items(),key=lambda kv:kv[1]['quantity'],reverse=True)[:20]],'days':[{'day':k,**v} for k,v in days.items()],'expenses':[{'id':e.id,'day':e.day,'amount':e.amount,'category':e.category,'note':e.note,'voided':e.voided,'void_reason':e.void_reason} for e in expenses],'refunds_needed':[{'id':o.id,'amount':o.total_amount} for o in needs_refund]}

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
    values={'id':str(body.id),'day':str(body.day),'amount':body.amount,'category':body.category,'note':body.note}
    existing=await db.get(FoodExpense,values['id'])
    if existing:
        if any(getattr(existing,k)!=v for k,v in values.items()): raise HTTPException(409,'Эта операция уже сохранена с другими данными')
        return {'id':existing.id}
    db.add(FoodExpense(**values,actor=actor(claims),created_at=now(),voided=False))
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
    await db.commit()
    if not result.rowcount: raise HTTPException(409,'Расход уже исключён или не найден')
    return {'ok':True}

class RefundBody(BaseModel):
    day:date
    note:str=Field(min_length=3,max_length=1000)

@router.post('/refunds/{order_id}')
async def refund(order_id:int,body:RefundBody,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    order=await db.scalar(select(Food_orders).where(Food_orders.id==order_id,await scope(db)))
    if not order or order.status!='cancelled' or order.payment_status!='paid': raise HTTPException(422,'Возврат отмечается для оплаченного отменённого заказа')
    if body.day>city_today() or (day_of(order.paid_at) and body.day<day_of(order.paid_at)): raise HTTPException(422,'Проверьте дату возврата')
    if len(body.note.strip())<3: raise HTTPException(422,'Укажите как выполнен возврат')
    if await db.get(FoodRefund,order_id): raise HTTPException(409,'Возврат уже отмечен')
    db.add(FoodRefund(order_id=order_id,amount=money(order.total_amount),day=str(body.day),note=body.note.strip(),actor=actor(claims),created_at=now()))
    add_event(db,order,'Владелец отметил полный возврат оплаты',actor(claims),notify=False)
    try: await db.commit()
    except IntegrityError:
        await db.rollback();raise HTTPException(409,'Возврат уже отмечен')
    return {'ok':True}

async def item_condition(db):
    rows=(await db.execute(select(Food_restaurants.id,Food_restaurants.name))).all()
    return Food_items.restaurant_id.in_([r.id for r in rows if brand(r.name)])

@router.get('/availability')
async def availability(db:AsyncSession=Depends(get_db),claims=Depends(food_staff)):
    rows=(await db.scalars(select(Food_items).where(await item_condition(db),Food_items.is_active==True).order_by(Food_items.name))).all()
    return [{'id':i.id,'name':i.name,'available':i.available is not False} for i in rows]

class AvailableBody(BaseModel):
    available:bool

@router.patch('/availability/{item_id}')
async def set_available(item_id:int,body:AvailableBody,db:AsyncSession=Depends(get_db),claims=Depends(food_staff)):
    result=await db.execute(update(Food_items).where(Food_items.id==item_id,await item_condition(db)).values(available=body.available))
    await db.commit()
    if not result.rowcount: raise HTTPException(404,'Блюдо не найдено')
    return {'ok':True}

@router.get('/staff')
async def staff_list(db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    rows=(await db.scalars(select(PartnerCredentials).where(PartnerCredentials.partner_type=='dam_alem').order_by(PartnerCredentials.id))).all()
    return [{'id':r.id,'name':r.display_name,'email':r.email,'phone':r.phone,'active':r.is_active,'role':r.access_role or 'owner'} for r in rows]

class StaffBody(BaseModel):
    name:str=Field(min_length=1,max_length=120)
    email:str=Field(min_length=5,max_length=255)
    password:str=Field(min_length=10,max_length=100)

@router.post('/staff')
async def staff_create(body:StaffBody,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    from routers.partner_auth import _hash_password
    email=body.email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email): raise HTTPException(422,'Укажите email для входа')
    if len(body.password.encode('utf-8'))>72: raise HTTPException(422,'Пароль слишком длинный, используйте до 72 байт')
    if not body.name.strip(): raise HTTPException(422,'Укажите имя сотрудника')
    row=PartnerCredentials(partner_type='dam_alem',email=email,display_name=body.name.strip(),password_hash=_hash_password(body.password),is_active=True,access_role='operator')
    db.add(row)
    try: await db.commit()
    except IntegrityError:
        await db.rollback();raise HTTPException(409,'Этот email уже используется')
    return {'id':row.id}

class StaffActive(BaseModel):
    active:bool

@router.patch('/staff/{staff_id}')
async def staff_active(staff_id:int,body:StaffActive,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    row=await db.get(PartnerCredentials,staff_id)
    if not row or row.partner_type!='dam_alem' or row.access_role!='operator': raise HTTPException(403,'Здесь можно отключать только операторов')
    row.is_active=body.active;await db.commit();return {'ok':True}
