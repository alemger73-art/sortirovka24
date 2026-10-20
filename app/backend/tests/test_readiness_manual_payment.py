import json
import pytest
from sqlalchemy import select
from tests.test_dam_order_workflow import env,BASE
from models.food_orders import Food_orders
from models.food_payment import FoodPayment
from models.food_operations import FoodOrderEvent
from services.dam_payment_flow import create_payment,apply_confirmation
from services.food_payments import movement

@pytest.mark.parametrize('method',['kaspi_qr','halyk_qr'])
@pytest.mark.asyncio
async def test_unconfigured_bank_with_invoice_mode_off_does_not_enable_public_payment(env, method):
    from fastapi import HTTPException
    env[3].delenv('PAYMENT_TEST_SECRET', raising=False)
    env[3].setenv('DAM_BANK_INVOICE', 'off')
    async with env[1]() as db:
        order = await db.get(Food_orders, 1)
        order.payment_method = method
        with pytest.raises(HTTPException) as exc:
            await create_payment(db, order)
        assert exc.value.status_code == 503
        assert await db.scalar(select(FoodPayment).where(FoodPayment.order_id == 1)) is None

@pytest.mark.parametrize('method',['kaspi_qr','halyk_qr'])
@pytest.mark.asyncio
async def test_manual_order_bank_choice_without_adapter_stays_unpaid_until_operator_confirmation(env, method):
    from tests.test_dam_payment_lifecycle import create, change
    env[3].delenv('PAYMENT_TEST_SECRET', raising=False)
    order = await create(env, method)
    assert order['payment_method'] == method
    assert order['payment_status'] == 'pending'
    assert float(order['paid_amount'] or 0) == 0
    client, maker, operator, _ = env
    detail = (await client.get(BASE + f"/orders/{order['id']}", headers=operator)).json()
    assert detail['order']['manual_payment_confirmation'] is True
    confirmed = await change(env, order['id'], payment_status='paid')
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()['paid_amount'] == 7800
    assert confirmed.json()['payment_status'] == 'paid'
    assert confirmed.json()['status'] == 'new'

@pytest.mark.parametrize('method',['kaspi_qr','halyk_qr'])
@pytest.mark.parametrize('legacy',[False,True])
@pytest.mark.asyncio
async def test_offline_operator_confirms_once_with_audit_and_late_callback(env,method,legacy):
    client,maker,auth,monkeypatch=env
    async with maker() as db:
        order=await db.get(Food_orders,1)
        order.payment_method=method;order.payment_status='pending';order.paid_amount=0
        order.delivery_method='pickup';order.status='done' if legacy else 'new'
        if not legacy:await create_payment(db,order)
        await db.commit()
    monkeypatch.delenv('PAYMENT_TEST_SECRET',raising=False)
    detail=(await client.get(BASE+'/orders/1',headers=auth)).json()
    assert detail['order']['manual_payment_confirmation'] is True
    response=await client.patch(BASE+'/orders/1',headers=auth,json={'expected_version':0,'payment_status':'paid'})
    assert response.status_code==200,response.text
    assert response.json()['paid_amount']==1200 and response.json()['payment_status']=='paid'
    retry=await client.patch(BASE+'/orders/1',headers=auth,json={'expected_version':response.json()['version'],'payment_status':'paid'})
    assert retry.status_code==200,retry.text
    async with maker() as db:
        payment=await db.scalar(select(FoodPayment).where(FoodPayment.order_id==1))
        assert payment.status=='PAID' and payment.metadata_json['confirmation_source']=='staff'
        assert payment.metadata_json['confirmed_by']=='Operator'
        order=await db.get(Food_orders,1)
        await apply_confirmation(db,{'provider':payment.provider,'payment_id':payment.id,'event_id':'late-bank-event',
            'external_id':payment.external_id or 'later-bank-reference','amount':'1200.00','currency':'KZT','status':'PAID'})
        await db.commit();await db.refresh(order)
        assert order.paid_amount==1200
        events=(await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id==1))).all()
        amounts=[movement(e) for e in events if movement(e)]
        assert len(amounts)==1 and amounts[0]['method']==method and amounts[0]['amount']=='1200.00'
        confirmations=[json.loads(e.event_data) for e in events if e.event_type=='PAYMENT_CONFIRMED']
        assert len(confirmations)==1 and confirmations[0]['source']=='staff'

@pytest.mark.parametrize('method',['kaspi_qr','halyk_qr'])
@pytest.mark.asyncio
async def test_active_adapter_keeps_bank_confirmation_required(env,method):
    client,maker,auth,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1);order.payment_method=method;order.payment_status='pending';order.paid_amount=0
        await create_payment(db,order);await db.commit()
    detail=(await client.get(BASE+'/orders/1',headers=auth)).json()
    assert detail['order']['manual_payment_confirmation'] is False
    response=await client.patch(BASE+'/orders/1',headers=auth,json={'expected_version':0,'payment_status':'paid'})
    assert response.status_code==403
