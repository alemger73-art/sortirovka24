import json
from uuid import uuid4
import pytest
from sqlalchemy import select,func
from models.food_orders import Food_orders
from models.food_payment import FoodPayment
from models.food_business import FoodRefund
from models.food_shifts import FoodStaffAction
from tests.test_dam_order_workflow import env,BASE,owner_headers
from tests.test_dam_stage2 import SHIFTS,NO_PURCHASE

@pytest.mark.asyncio
@pytest.mark.parametrize('status,paid_amount,expected_refund',[('cancelled',1200,1200),('done',1400,200)])
async def test_terminal_refund_does_not_block_operator_close_or_return_money(env,status,paid_amount,expected_refund):
    client,maker,operator,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1);order.status=status;order.paid_amount=paid_amount
        await db.commit()
    preview=(await client.get(SHIFTS+'/close-preview',headers=operator)).json()
    assert preview['can_close'] and preview['orders']==[]
    assert preview['refunds_pending_total']==expected_refund
    assert preview['refunds_pending']==[{'id':1,'status':status,'refund_due':expected_refund}]
    closed=await client.post(SHIFTS+'/close',headers=operator,json={'pin':'2222','procurement':NO_PURCHASE})
    assert closed.status_code==200,closed.text
    assert closed.json()['shift']['closing_summary']['refunds_pending']==preview['refunds_pending']
    async with maker() as db:
        order=await db.get(Food_orders,1)
        assert order.paid_amount==paid_amount and order.payment_status=='paid'
        assert await db.scalar(select(func.count()).select_from(FoodRefund))==0
        assert await db.scalar(select(func.count()).select_from(FoodStaffAction).where(FoodStaffAction.action=='refunds_pending_at_close'))==1
    from routers.food_business import city_today
    request={'day':str(city_today()),'amount':expected_refund,'note':'Synthetic actual refund','request_key':str(uuid4())}
    path='/api/v1/dam-alem/business/refunds/1'
    assert (await client.post(path,headers=operator,json=request)).status_code==403
    assert (await client.post(path,headers=owner_headers(),json=request)).status_code==200
    after=(await client.get(SHIFTS+'/close-preview',headers=owner_headers())).json()
    assert after['refunds_pending']==[] and after['refunds_pending_total']==0

@pytest.mark.asyncio
async def test_cancelled_waiting_bank_is_not_active_but_late_money_stays_separate(env):
    client,maker,operator,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1);order.status='cancelled';order.payment_status='pending';order.paid_amount=0
        db.add(FoodPayment(id=str(uuid4()),order_id=1,provider='KASPI',amount=1200,status='WAITING',created_at='2026-10-09T10:00:00Z'))
        await db.commit()
    preview=(await client.get(SHIFTS+'/close-preview',headers=operator)).json()
    assert preview['can_close'] and preview['refunds_pending']==[]

@pytest.mark.asyncio
async def test_active_work_still_blocks_close_with_refund_advisory(env):
    client,maker,operator,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1);order.status='cancelled'
        db.add(Food_orders(id=2,restaurant_id=1,business_id='dam_alem',customer_name='Active test',status='confirmed',payment_status='pending',total_amount=1000,delivery_method='pickup',order_items=json.dumps([])))
        await db.commit()
    preview=(await client.get(SHIFTS+'/close-preview',headers=operator)).json()
    assert not preview['can_close'] and [o['id'] for o in preview['orders']]==[2]
    assert preview['refunds_pending_total']==1200
    assert (await client.post(SHIFTS+'/close',headers=operator,json={'pin':'2222','procurement':NO_PURCHASE})).status_code==409

@pytest.mark.asyncio
@pytest.mark.parametrize('refund', [True,False])
async def test_fractional_financial_followup_totals_are_exact(env,refund):
    client,maker,operator,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1)
        order.status='cancelled' if refund else 'done';order.total_amount=0.1
        order.payment_status='paid' if refund else 'pending';order.paid_amount=0.1 if refund else 0
        db.add(Food_orders(id=2,restaurant_id=1,business_id='dam_alem',customer_name='Fraction test',status=order.status,
            payment_status=order.payment_status,total_amount=0.2,paid_amount=0.2 if refund else 0,delivery_method='pickup',order_items=json.dumps([])))
        await db.commit()
    preview=(await client.get(SHIFTS+'/close-preview',headers=operator)).json()
    assert preview['can_close']
    assert preview['refunds_pending_total' if refund else 'debt_total']==0.3
