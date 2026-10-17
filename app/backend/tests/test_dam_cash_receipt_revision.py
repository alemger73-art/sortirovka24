import json
import pytest
from sqlalchemy import select
from fastapi import HTTPException
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from tests.test_dam_order_workflow import env, BASE
from services.dam_payment_flow import cash_values

@pytest.mark.asyncio
async def test_operator_amend_above_cash_note_then_confirm_new_note(env):
    client,maker,headers,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1)
        order.total_amount=16000;order.paid_amount=0;order.payment_status='pending';order.payment_method='cash'
        order.cash_given_amount=20000;order.change_amount=4000
        order.order_items=json.dumps([{'id':1,'name':'Pizza','price':16000,'quantity':1,'modTotal':0,'sum':16000}])
        await db.commit()
    body={'expected_version':0,'items':[{'line_index':0,'quantity':2}],'reason':'Клиент изменил состав','quoted_total':32000}
    result=await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)
    assert result.status_code==200,result.text
    assert result.json()['total_amount']==32000
    assert result.json()['cash_given_amount']==20000 and result.json()['change_amount'] is None
    assert result.json()['paid_amount']==0 and result.json()['payment_status']=='pending'
    async with maker() as db:
        event=await db.scalar(select(FoodOrderEvent).where(FoodOrderEvent.public_data.isnot(None)))
        history=json.loads(event.public_data)
        assert history['before']['cash_given_amount']==20000 and history['before']['change_amount']==4000
        assert history['after']['cash_given_amount']==20000 and history['after']['change_amount'] is None
    body.update(expected_version=result.json()['version'],cash_given_amount=30000)
    rejected=await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)
    assert rejected.status_code==422
    # Failed update must not claim the version or alter the receipt.
    body['cash_given_amount']=40000
    result=await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)
    assert result.status_code==200,result.text
    assert result.json()['cash_given_amount']==40000 and result.json()['change_amount']==8000
    assert result.json()['paid_amount']==0
    assert (await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)).status_code==409

@pytest.mark.asyncio
async def test_operator_amend_retains_sufficient_note(env):
    client,maker,headers,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1)
        order.payment_method='cash';order.payment_status='pending';order.paid_amount=0
        order.cash_given_amount=2000;order.change_amount=800
        await db.commit()
    body={'expected_version':0,'items':[{'line_index':0,'quantity':1},{'id':2,'quantity':2}],'reason':'Клиент изменил состав','quoted_total':1800}
    result=await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)
    assert result.status_code==200,result.text
    assert result.json()['cash_given_amount']==2000 and result.json()['change_amount']==200

def test_new_checkout_cash_validation_remains_strict():
    with pytest.raises(HTTPException) as exc:cash_values(22000,20000)
    assert exc.value.status_code==422
    assert cash_values(16000,20000)==(20000,4000)
