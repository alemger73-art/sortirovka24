"""Owner-only daily payroll. Recording a payment does not transfer money."""
import json
from datetime import date
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.food_staff_guard import food_owner
from models.food_payroll import FoodPayrollEmployee, FoodPayrollDay, FoodPayrollWork, FoodPayrollPayment
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.food_business import FoodExpense
from services.food_payroll import calculate, report, CITY
from datetime import datetime
from services.dam_order_workflow import money
from services.food_operations import now, brand
from services.food_shifts import require_partner_shift, record_action

router=APIRouter(prefix='/api/v1/dam-alem/payroll',tags=['DAM ALEM payroll'],dependencies=[Depends(food_owner)])

def view(row): return {c.name:getattr(row,c.name) for c in row.__table__.columns}

async def lock_day(db, day, version):
    row=await db.get(FoodPayrollDay,day)
    if not row:
        try:
            async with db.begin_nested():
                db.add(FoodPayrollDay(day=day,version=0));await db.flush()
        except IntegrityError: pass
    claimed=await db.execute(update(FoodPayrollDay).where(FoodPayrollDay.day==day,FoodPayrollDay.version==version).values(version=version+1).execution_options(synchronize_session=False))
    if not claimed.rowcount: raise HTTPException(409,'Расчёт изменён. Обновите раздел.')
    row=await db.get(FoodPayrollDay,day,populate_existing=True)
    return row

class Rates(BaseModel):
    daily_base: float = Field(ge=0,le=10000000,allow_inf_nan=False)
    percent: float = Field(ge=0,le=100,allow_inf_nan=False)
    basis: Literal['kitchen','bar','all']
class Employee(Rates):
    name: str = Field(min_length=1,max_length=150)
    position: str = Field(min_length=1,max_length=150)
    active: bool = True
class Work(Rates):
    expected_version: int = Field(ge=0)
    worked: bool = True
class Close(BaseModel):
    expected_version: int = Field(ge=0)
    fingerprint: str = ''
class Payment(BaseModel):
    id: UUID
    employee_id: int
    expected_version: int = Field(ge=0)
    amount: float = Field(gt=0,le=10000000,allow_inf_nan=False)
    note: str = Field('',max_length=500)

@router.get('/employees')
async def employees(db:AsyncSession=Depends(get_db)):
    return [view(x) for x in (await db.scalars(select(FoodPayrollEmployee).order_by(FoodPayrollEmployee.id))).all()]
@router.post('/employees')
async def add_employee(body:Employee,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    if not body.name.strip() or not body.position.strip():raise HTTPException(422,'Укажите имя и должность')
    row=FoodPayrollEmployee(**body.model_dump());db.add(row);record_action(db,shift,'payroll_employee_created',claims=claims,entity_type='payroll_employee',details={'name':body.name});await db.commit();await db.refresh(row);return view(row)
@router.put('/employees/{employee_id}')
async def update_employee(employee_id:int,body:Employee,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    row=await db.get(FoodPayrollEmployee,employee_id)
    if not row:raise HTTPException(404,'Сотрудник не найден')
    for k,v in body.model_dump().items():setattr(row,k,v)
    record_action(db,shift,'payroll_employee_updated',claims=claims,entity_type='payroll_employee',entity_id=employee_id);await db.commit();return view(row)

@router.get('/departments')
async def departments(db:AsyncSession=Depends(get_db)):
    restaurants=(await db.scalars(select(Food_restaurants))).all()
    ids=[x.id for x in restaurants if brand(x.name, x.merchant_key)]
    rows=(await db.scalars(select(Food_items).where((Food_items.restaurant_id.in_(ids)) | Food_items.restaurant_id.is_(None)).order_by(Food_items.name))).all()
    return [{'id':x.id,'name':x.name,'department':x.sales_department} for x in rows]
class Department(BaseModel):
    department: Literal['kitchen','bar']
@router.put('/departments/{item_id}')
async def set_department(item_id:int,body:Department,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    allowed=await departments(db)
    if item_id not in {x['id'] for x in allowed}:raise HTTPException(404,'Блюдо не найдено')
    row=await db.get(Food_items,item_id);row.sales_department=body.department;record_action(db,shift,'sales_department_changed',claims=claims,entity_type='food_item',entity_id=item_id,details={'department':body.department});await db.commit();return {'ok':True}

@router.get('/days/{day}')
async def day_report(day:date,db:AsyncSession=Depends(get_db)):
    return await report(db,day.isoformat())
@router.put('/days/{day}/work/{employee_id}')
async def save_work(day:date,employee_id:int,body:Work,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    key=day.isoformat();period=await lock_day(db,key,body.expected_version)
    if period.closed_json:raise HTTPException(409,'Расчёт закрыт')
    if not await db.get(FoodPayrollEmployee,employee_id):raise HTTPException(404,'Сотрудник не найден')
    row=await db.get(FoodPayrollWork,f'{key}:{employee_id}')
    if not body.worked:
        if row:await db.delete(row)
    else:
        if not row:
            row=FoodPayrollWork(id=f'{key}:{employee_id}',day=key,employee_id=employee_id);db.add(row)
        row.daily_base,row.percent,row.basis=body.daily_base,body.percent,body.basis
    record_action(db,shift,'payroll_work_changed',claims=claims,entity_type='payroll_day',entity_id=key,details={'employee_id':employee_id,'worked':body.worked});await db.commit();return await report(db,key)

@router.post('/days/{day}/close')
async def close_day(day:date,body:Close,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    key=day.isoformat();period=await lock_day(db,key,body.expected_version)
    if period.closed_json:raise HTTPException(409,'Расчёт уже закрыт')
    result=await calculate(db,key)
    if result['fingerprint']!=body.fingerprint:raise HTTPException(409,'Продажи или ставки изменились. Проверьте новый расчёт.')
    if not result['rows']:raise HTTPException(422,'Отметьте работавших сотрудников')
    if result['pending_orders']:raise HTTPException(409,'Есть незавершённые или неоплаченные заказы за этот день')
    if result['unassigned'] and any(x['basis']!='all' for x in result['rows']):raise HTTPException(409,'Распределите проданные позиции между кухней и баром')
    period.closed_json=json.dumps(result,ensure_ascii=False);period.closed_at=now();record_action(db,shift,'payroll_day_closed',claims=claims,entity_type='payroll_day',entity_id=key);await db.commit();return await report(db,key)

@router.post('/days/{day}/reopen')
async def reopen(day:date,body:Close,db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    shift=await require_partner_shift(db,claims)
    key=day.isoformat();period=await lock_day(db,key,body.expected_version)
    payments=(await db.scalars(select(FoodPayrollPayment).where(FoodPayrollPayment.day==key))).all()
    if any(not p.voided for p in payments):raise HTTPException(409,'За день уже записаны выплаты. Закрытые начисления нельзя переписать.')
    period.closed_json=period.closed_at=None;record_action(db,shift,'payroll_day_reopened',claims=claims,entity_type='payroll_day',entity_id=key);await db.commit();return await report(db,key)

@router.post('/days/{day}/payments')
async def payment(day:date,body:Payment,claims=Depends(food_owner),db:AsyncSession=Depends(get_db)):
    shift=await require_partner_shift(db,claims)
    key=day.isoformat();existing=await db.get(FoodPayrollPayment,str(body.id))
    if existing:
        if existing.day!=key or existing.employee_id!=body.employee_id or money(existing.amount)!=money(body.amount):raise HTTPException(409,'Этот номер выплаты уже использован')
        return await report(db,key)
    period=await lock_day(db,key,body.expected_version)
    if not period.closed_json:raise HTTPException(409,'Сначала проверьте и закройте расчёт дня')
    result=await report(db,key)
    employee=next((x for x in result['rows'] if x['employee_id']==body.employee_id),None)
    if not employee or money(body.amount)>money(employee['remaining']):raise HTTPException(422,'Сумма превышает остаток к выплате')
    amount=money(body.amount)
    if amount<=0:raise HTTPException(422,'Введите сумму выплаты')
    actor=str(claims.get('display_name') or claims.get('sub') or 'Владелец')[:200]
    db.add(FoodPayrollPayment(id=str(body.id),day=key,employee_id=body.employee_id,amount=float(amount),note=body.note,created_at=now(),actor=actor))
    db.add(FoodExpense(id=str(body.id),day=datetime.now(CITY).date().isoformat(),amount=amount,category='salary',
        note=f'Зарплата: {employee["name"]}, за {key}. {body.note}',actor=actor,created_at=now(),voided=False))
    record_action(db,shift,'salary_payment_recorded',claims=claims,entity_type='payroll_payment',entity_id=str(body.id),details={'employee_id':body.employee_id,'amount':float(amount),'day':key})
    await db.commit();return await report(db,key)
