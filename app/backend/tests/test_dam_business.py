from datetime import timedelta
from uuid import uuid4
from decimal import Decimal
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from core.database import Base,get_db
from core.auth import create_access_token
from models.partner_auth import PartnerCredentials
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent,FoodOperationsSettings
from models.food_business import FoodExpense,FoodRefund
from models.food_restaurants import Food_restaurants
from models.food_items import Food_items
from routers.food_business import router,city_today
from routers.food_operations import router as operations
from middleware.entity_guard import EntityWriteGuardMiddleware

@pytest.fixture
async def env(monkeypatch):
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    tables=[m.__table__ for m in [PartnerCredentials,Food_orders,FoodOrderEvent,FoodOperationsSettings,FoodExpense,FoodRefund,Food_restaurants,Food_items]]
    async with engine.begin() as c: await c.run_sync(lambda conn:Base.metadata.create_all(conn,tables=tables))
    maker=async_sessionmaker(engine,expire_on_commit=False)
    async with maker() as db:
        db.add_all([PartnerCredentials(id=1,partner_type='dam_alem',email='owner@example.test',password_hash='not-used',access_role='owner',is_active=True),PartnerCredentials(id=2,partner_type='dam_alem',email='operator@example.test',password_hash='not-used',access_role='operator',is_active=True)])
        db.add_all([Food_restaurants(id=1,name='DAM ALEM 2.0'),Food_restaurants(id=2,name='Other')])
        db.add_all([Food_items(id=1,restaurant_id=1,name='Донер',price=1000,is_active=True,available=True),Food_items(id=2,restaurant_id=2,name='Чужое',price=1,is_active=True,available=True)])
        await db.commit()
    async def dependency():
        async with maker() as db: yield db
    monkeypatch.setattr('core.database.get_db',dependency)
    app=FastAPI();app.include_router(router);app.include_router(operations);app.dependency_overrides[get_db]=dependency;app.add_middleware(EntityWriteGuardMiddleware)
    @app.put('/api/v1/entities/food_items/1')
    async def legacy():return {'unsafe':'must not reach'}
    def headers(id):return {'Authorization':'Bearer '+create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':id,'access_role':'owner'})}
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:yield client,maker,headers(1),headers(2)
    await engine.dispose()

@pytest.mark.asyncio
async def test_operator_permissions_and_revocation(env):
    client,maker,owner,operator=env
    base='/api/v1/dam-alem'
    assert (await client.get(base+'/business/me',headers=operator)).json()['role']=='operator'
    for path in ['/business/report?start=2026-09-01&end=2026-09-13','/business/staff','/operations/telegram']:
        assert (await client.get(base+path,headers=operator)).status_code==403
    assert (await client.put('/api/v1/entities/food_items/1',headers=operator,json={'price':1})).status_code==403
    assert (await client.get(base+'/business/today',headers=operator)).status_code==200
    assert (await client.patch(base+'/business/availability/1',headers=operator,json={'available':False})).status_code==200
    assert (await client.patch(base+'/business/availability/2',headers=operator,json={'available':False})).status_code==404
    assert (await client.patch(base+'/business/staff/2',headers=owner,json={'active':False})).status_code==200
    assert (await client.get(base+'/business/today',headers=operator)).status_code==403

@pytest.mark.asyncio
async def test_report_dates_refunds_and_expenses_are_separate(env):
    client,maker,owner,operator=env
    async with maker() as db:
        # 20:30 UTC belongs to the NEXT calendar day in Karaganda.
        db.add_all([Food_orders(id=1,restaurant_id=1,status='done',payment_status='paid',total_amount=1000,payment_method='cash',completed_at='2026-09-12T20:30:00+00:00',paid_at='2026-09-11T10:00:00+00:00',created_at='2026-09-11T09:00:00+00:00',order_items='[{"name":"Донер","quantity":1,"price":1000}]',bonus_discount_amount=0),Food_orders(id=2,restaurant_id=1,status='cancelled',payment_status='paid',total_amount=500,payment_method='kaspi_qr',paid_at='2026-09-13T10:00:00+00:00',cancelled_at='2026-09-13T11:00:00+00:00'),Food_orders(id=3,restaurant_id=1,status='done',payment_status='paid',total_amount=999999),Food_orders(id=4,restaurant_id=2,status='done',payment_status='paid',total_amount=999999,completed_at='2026-09-13T10:00:00+00:00',paid_at='2026-09-13T10:00:00+00:00')])
        db.add(FoodExpense(id=str(uuid4()),day='2026-09-13',amount=Decimal('100.10'),category='products',note='Тест',actor='Owner',created_at='2026-09-13',voided=False))
        db.add(FoodRefund(order_id=2,amount=Decimal('500'),day='2026-09-13',actor='Owner',note='Возвращено',created_at='2026-09-13'))
        await db.commit()
    response=await client.get('/api/v1/dam-alem/business/report?start=2026-09-13&end=2026-09-13',headers=owner)
    assert response.status_code==200,response.text
    data=response.json()
    assert data['sales']==1000 and data['receipts']==500 and data['refunds']==500
    assert data['cash_difference']==-100.1 and data['completed']==1 and data['cancelled']==1
    assert data['undated_done']==1 and data['undated_paid']==1
    assert data['products'][0]['quantity']==1 and not data['refunds_needed']

@pytest.mark.asyncio
async def test_expense_idempotency_validation_and_void(env):
    client,maker,owner,operator=env
    url='/api/v1/dam-alem/business/expenses';body={'id':str(uuid4()),'day':str(city_today()),'amount':'100.10','category':'products','note':'Закупка'}
    assert (await client.post(url,headers=operator,json=body)).status_code==403
    assert (await client.post(url,headers=owner,json=body)).status_code==200
    assert (await client.post(url,headers=owner,json=body)).status_code==200
    assert (await client.post(url,headers=owner,json={**body,'amount':'200'})).status_code==409
    assert (await client.post(url,headers=owner,json={**body,'id':str(uuid4()),'amount':'-1'})).status_code==422
    assert (await client.post(url,headers=owner,json={**body,'id':str(uuid4()),'day':str(city_today()+timedelta(days=1))})).status_code==422
    assert (await client.post(url+'/'+body['id']+'/void',headers=owner,json={'reason':'Ошибочная запись'})).status_code==200
    assert (await client.post(url+'/'+body['id']+'/void',headers=owner,json={'reason':'Повтор'})).status_code==409
    async with maker() as db:
        rows=(await db.scalars(select(FoodExpense))).all();assert len(rows)==1 and rows[0].voided

@pytest.mark.asyncio
async def test_refund_only_once_and_only_owner(env):
    client,maker,owner,operator=env
    async with maker() as db:
        db.add(Food_orders(id=1,restaurant_id=1,status='cancelled',payment_status='paid',total_amount=500));await db.commit()
    url='/api/v1/dam-alem/business/refunds/1';body={'day':str(city_today()),'note':'Возвращено наличными'}
    assert (await client.post(url,headers=operator,json=body)).status_code==403
    assert (await client.post(url,headers=owner,json=body)).status_code==200
    assert (await client.post(url,headers=owner,json=body)).status_code==409

@pytest.mark.asyncio
async def test_owner_creates_operator_without_exposing_password(env):
    client,maker,owner,operator=env
    body={'name':'Сотрудник','email':'worker@example.test','password':'StrongTestPassword42'}
    url='/api/v1/dam-alem/business/staff'
    assert (await client.post(url,headers=operator,json=body)).status_code==403
    response=await client.post(url,headers=owner,json=body);assert response.status_code==200,response.text
    rows=await client.get(url,headers=owner);assert body['password'] not in rows.text and 'password_hash' not in rows.text
    async with maker() as db:
        row=await db.get(PartnerCredentials,response.json()['id']);assert row.access_role=='operator' and row.password_hash!=body['password']
    assert (await client.patch(url+'/1',headers=owner,json={'active':False})).status_code==403

@pytest.mark.asyncio
async def test_late_payment_has_date_and_cannot_be_erased(env):
    client,maker,owner,operator=env
    async with maker() as db:
        db.add(Food_orders(id=90,restaurant_id=1,status='done',payment_status='pending',version=0,total_amount=1234));await db.commit()
    url='/api/v1/dam-alem/operations/orders/90'
    response=await client.patch(url,headers=operator,json={'expected_version':0,'payment_status':'paid'})
    assert response.status_code==200,response.text
    assert response.json()['paid_at'] and response.json()['completed_at'] is None
    again=await client.patch(url,headers=operator,json={'expected_version':1,'payment_status':'pending'})
    assert again.status_code==422
    report=await client.get('/api/v1/dam-alem/business/report',headers=owner,params={'start':str(city_today()),'end':str(city_today())})
    assert report.json()['receipts']==1234 and report.json()['sales']==0


@pytest.mark.asyncio
async def test_reduced_paid_receipt_refunds_only_excess_then_cancellation(env):
    client,maker,owner,_=env
    day=str(city_today())
    async with maker() as db:
        db.add(Food_orders(id=91,restaurant_id=1,status='new',payment_status='paid',version=0,
            total_amount=500,paid_amount=1200,paid_at=day+'T10:00:00+05:00',delivery_method='pickup'))
        await db.commit()
    url='/api/v1/dam-alem/business'
    async def report():
        response=await client.get(url+'/report',headers=owner,params={'start':day,'end':day})
        assert response.status_code==200,response.text
        return response.json()
    before=await report()
    assert before['receipts']==1200 and before['refunds_needed']==[{'id':91,'amount':700}]
    body={'day':day,'note':'Переплата возвращена'}
    assert (await client.post(url+'/refunds/91',headers=owner,json=body)).status_code==200
    assert (await client.post(url+'/refunds/91',headers=owner,json=body)).status_code==409
    after=await report()
    assert after['receipts']==1200 and after['refunds']==700 and not after['refunds_needed']
    async with maker() as db:
        order=await db.get(Food_orders,91)
        assert order.paid_amount==500
        order.status='cancelled'
        await db.commit()
    assert (await client.post(url+'/refunds/91',headers=owner,json=body)).status_code==200
    after=await report()
    assert after['receipts']==1200 and after['refunds']==1200 and after['cash_difference']==0


@pytest.mark.asyncio
async def test_supplement_keeps_original_payment_day(env):
    client,maker,owner,operator=env
    day=str(city_today());previous=str(city_today()-timedelta(days=1))
    async with maker() as db:
        db.add(Food_orders(id=92,restaurant_id=1,status='new',payment_status='pending',version=0,
            total_amount=1800,paid_amount=1200,paid_at=previous+'T10:00:00+05:00',delivery_method='pickup'))
        await db.commit()
    response=await client.patch('/api/v1/dam-alem/operations/orders/92',headers=operator,
        json={'expected_version':0,'payment_status':'paid'})
    assert response.status_code==200,response.text
    for date,amount in [(previous,1200),(day,600)]:
        result=await client.get('/api/v1/dam-alem/business/report',headers=owner,params={'start':date,'end':date})
        assert result.json()['receipts']==amount,result.text
