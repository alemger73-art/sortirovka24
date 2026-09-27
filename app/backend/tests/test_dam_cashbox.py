from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from tests.test_dam_courier_registration import registration
from core.auth import create_access_token
from models.food_business import FoodExpense
from models.food_cashbox import FoodCashEntry
from models.food_orders import Food_orders
from models.partner_auth import PartnerCredentials
from services.food_payments import receive_outstanding, record, preserve_legacy_payment

BASE = '/api/v1/dam-alem/cashbox'


def body(kind='opening', amount='10000', **kwargs):
    return {'id':str(uuid4()),'kind':kind,'amount':amount,'recipient':'Тестовый получатель','reason':'Тестовая операция',**kwargs}


async def start(registration):
    client, _, owner = registration
    response = await client.post(BASE+'/entries',headers=owner,json=body())
    assert response.status_code == 200,response.text


@pytest.mark.asyncio
async def test_unknown_opening_not_zero_and_owner_needs_no_shift(registration):
    client, _, owner = registration
    data=(await client.get(BASE,headers=owner)).json()
    assert data['configured'] is False and data['balance'] is None
    assert (await client.post(BASE+'/entries',headers=owner,json=body('expense','500'))).status_code == 409
    opening=body(amount='0')
    for _ in range(2):
        assert (await client.post(BASE+'/entries',headers=owner,json=opening)).status_code == 200
    assert (await client.post(BASE+'/entries',headers=owner,json=body())).status_code == 409
    assert (await client.get(BASE,headers=owner)).json()['balance'] == 0


@pytest.mark.asyncio
async def test_expense_recipient_actor_balance_and_idempotency(registration):
    client,maker,owner=registration
    await start(registration)
    expense=body('expense','2500',recipient='Алсу',reason='Закуп овощей',category='products')
    for _ in range(2):
        assert (await client.post(BASE+'/entries',headers=owner,json=expense)).status_code == 200
    snapshot=(await client.get(BASE,headers=owner)).json()
    assert snapshot['balance'] == 7500
    entry=next(x for x in snapshot['entries'] if x['id']==expense['id'])
    assert entry['recipient']=='Алсу' and entry['actor']=='Test Owner' and entry['actor_id']=='1'
    async with maker() as db:
        row=await db.get(FoodExpense,expense['id'])
        assert row.amount==Decimal('2500') and row.category=='products' and 'Алсу' in row.note
        assert await db.scalar(select(func.count()).select_from(FoodExpense))==1
    assert (await client.post(BASE+'/entries',headers=owner,json={**expense,'amount':'2000'})).status_code==409
    assert (await client.post(BASE+'/entries',headers=owner,json={**expense,'category':'salary'})).status_code==409
    assert (await client.post(BASE+'/entries',headers=owner,json=body('withdrawal','8000'))).status_code==409
    assert (await client.get(BASE,headers=owner)).json()['balance']==7500


@pytest.mark.asyncio
async def test_deposit_withdrawal_and_correction_are_not_sales_or_expenses(registration):
    client,maker,owner=registration
    await start(registration)
    for kind,amount in [('deposit','500'),('withdrawal','1000'),('correction','-100')]:
        assert (await client.post(BASE+'/entries',headers=owner,json=body(kind,amount))).status_code==200
    assert (await client.get(BASE,headers=owner)).json()['balance']==9400
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(FoodExpense))==0
    for value in ['NaN','Infinity','-1','0','1.234']:
        assert (await client.post(BASE+'/entries',headers=owner,json=body('expense',value))).status_code==422


@pytest.mark.asyncio
async def test_operator_needs_shift_and_cannot_change_opening(registration):
    client,maker,owner=registration
    from utils.courier_pin import hash_courier_pin
    from services.food_shifts import open_shift
    async with maker() as db:
        db.add(PartnerCredentials(id=2,partner_type='dam_alem',email='operator@test.invalid',password_hash='unused',
            display_name='Operator',access_role='operator',is_active=True,pin_hash=hash_courier_pin('4321')))
        await db.commit()
    token=create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':2,'sub':'operator'})
    operator={'Authorization':'Bearer '+token}
    await start(registration)
    assert (await client.post(BASE+'/entries',headers=operator,json=body('expense','500'))).status_code==409
    async with maker() as db:
        staff=await db.get(PartnerCredentials,2)
        await open_shift(db,staff_type='partner',staff_id=2,staff_name='Operator',role='operator',stored_pin=staff.pin_hash,pin='4321')
    for kind in ['opening','correction']:
        assert (await client.post(BASE+'/entries',headers=operator,json=body(kind,'500'))).status_code==403
    expense=body('expense','500')
    assert (await client.post(BASE+'/entries',headers=operator,json=expense)).status_code==200
    owner_snapshot=(await client.get(BASE,headers=owner)).json()
    assert owner_snapshot['balance']==9500
    assert any(e['actor']=='Operator' and e['shift_id'] for e in owner_snapshot['entries'])
    assert (await client.get('/api/v1/dam-alem/business/overview',headers=operator)).status_code==403
    assert (await client.get(BASE)).status_code==403


@pytest.mark.asyncio
async def test_cash_payments_banks_legacy_and_refund(registration):
    client,maker,owner=registration
    await start(registration)
    async with maker() as db:
        for i,method in enumerate(['cash','kaspi_qr','halyk_qr'],1):
            order=Food_orders(id=i,restaurant_id=1,restaurant_name='DAM ALEM 2.0',customer_name='Test',status='new',
                payment_method=method,payment_status='pending',paid_amount=0,total_amount=1200)
            db.add(order);await db.flush()
            await receive_outstanding(db,order,'Operator')
            await receive_outstanding(db,order,'Operator')
        legacy=Food_orders(id=10,restaurant_id=1,restaurant_name='DAM ALEM 2.0',payment_method='cash',payment_status='paid',paid_amount=9000,total_amount=9000)
        db.add(legacy);await db.flush();await preserve_legacy_payment(db,legacy)
        await db.commit()
    assert (await client.get(BASE,headers=owner)).json()['balance']==11200
    async with maker() as db:
        order=await db.get(Food_orders,1)
        await record(db,order,-1200,'Owner')
        await db.commit()
    assert (await client.get(BASE,headers=owner)).json()['balance']==10000


@pytest.mark.asyncio
async def test_courier_cash_enters_drawer_only_on_confirmed_handover(registration):
    client,maker,owner=registration
    from models.auth import User
    from models.logistics import CourierProfile, LogisticsTask
    from models.food_shifts import FoodShift
    from services.courier_money import collect_cash,request_handover,confirm_handover
    await start(registration)
    async with maker() as db:
        courier=User(id='courier-test',name='Courier',phone='+77005554433',role='courier')
        db.add(courier);await db.flush()
        db.add(CourierProfile(user_id=courier.id,is_verified=True))
        shift=FoodShift(staff_type='courier',staff_id=courier.id,staff_name='Courier',role='courier',active_key='courier:'+courier.id,opened_by='Courier')
        db.add(shift)
        order=Food_orders(id=1,restaurant_id=1,restaurant_name='DAM ALEM 2.0',customer_name='Test',payment_method='cash',payment_status='pending',paid_amount=0,total_amount=1200)
        task=LogisticsTask(id=1,source_type='food_orders',source_id=1,courier_id=courier.id,status='on_the_way',
            pickup_address='Test restaurant',dropoff_address='Test customer')
        db.add_all([order,task]);await db.flush()
        await collect_cash(db,task,order,courier,shift);await db.commit()
        transfer=await request_handover(db,courier.id);await db.commit();hid=transfer.id
    assert (await client.get(BASE,headers=owner)).json()['balance']==10000
    async with maker() as db:
        for _ in range(2):
            await confirm_handover(db,hid,{'staff_id':1,'display_name':'Owner','sub':'owner','role':'partner','access_role':'owner'})
            await db.commit()
    assert (await client.get(BASE,headers=owner)).json()['balance']==11200


@pytest.mark.asyncio
async def test_voiding_accounting_expense_does_not_invent_returned_cash(registration):
    client,maker,owner=registration
    await start(registration)
    expense=body('expense','500')
    assert (await client.post(BASE+'/entries',headers=owner,json=expense)).status_code==200
    assert (await client.post('/api/v1/dam-alem/business/expenses/'+expense['id']+'/void',headers=owner,json={'reason':'Исправление категории'})).status_code==200
    assert (await client.get(BASE,headers=owner)).json()['balance']==9500


@pytest.mark.asyncio
async def test_two_operators_cannot_spend_the_same_cash_twice(registration):
    import asyncio
    client,maker,owner=registration
    if maker.kw['bind'].dialect.name != 'postgresql':
        pytest.skip('Production transaction/advisory locks are PostgreSQL-specific')
    await start(registration)
    replies=await asyncio.gather(*[
        client.post(BASE+'/entries',headers=owner,json=body('withdrawal','6000')) for _ in range(2)])
    assert sorted(r.status_code for r in replies)==[200,409]
    assert (await client.get(BASE,headers=owner)).json()['balance']==4000


@pytest.mark.asyncio
async def test_additive_migration_can_repeat_without_erasing_cash_history(registration):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    client,maker,owner=registration
    path=Path(__file__).parents[1]/'alembic/versions/dam20260930_shared_cashbox.py'
    spec=importlib.util.spec_from_file_location('cashbox_migration',path)
    migration=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    def upgrade(connection):
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

    # This fixture owns an isolated UUID schema / temporary SQLite database.
    async with maker.kw['bind'].begin() as connection:
        await connection.run_sync(FoodCashEntry.__table__.drop)
        await connection.run_sync(upgrade)
    await start(registration)
    async with maker.kw['bind'].begin() as connection:
        await connection.run_sync(upgrade)
    assert (await client.get(BASE,headers=owner)).json()['balance']==10000


@pytest.mark.asyncio
async def test_cashbox_rejects_other_partner_courier_and_disabled_staff(registration):
    client,maker,_=registration
    for claims in [
        {'role':'partner','type':'partner_session','partner_type':'shop','partner_id':1,'sub':'other'},
        {'role':'user','type':'access','sub':'customer'},
        {'role':'courier','type':'courier_session','sub':'courier'},
    ]:
        headers={'Authorization':'Bearer '+create_access_token(claims)}
        assert (await client.get(BASE,headers=headers)).status_code in (401,403)
        assert (await client.post(BASE+'/entries',headers=headers,json=body())).status_code in (401,403)
    async with maker() as db:
        staff=await db.get(PartnerCredentials,1)
        staff.is_active=False
        await db.commit()
    headers={'Authorization':'Bearer '+create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':1,'sub':'owner'})}
    assert (await client.get(BASE,headers=headers)).status_code==403
