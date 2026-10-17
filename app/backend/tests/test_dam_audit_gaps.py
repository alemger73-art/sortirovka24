"""Account-owned notifications must not depend on the delivery contact phone."""
import json
from uuid import uuid4
import pytest
from sqlalchemy import select, func
from models.food_orders import Food_orders
from models.user_notifications import UserNotification
from services.user_notifications import notify_food_order_status as original_status
from services.user_notifications import notify_food_order_created as original_created
from services.user_notifications import notify_logistics_task_status as original_logistics
from types import SimpleNamespace
from unittest.mock import AsyncMock
from tests.test_dam_order_workflow import env
from tests.test_google_checkout_history import login

@pytest.mark.asyncio
@pytest.mark.parametrize('status', ['confirmed', 'preparing', 'ready', 'in_progress', 'done', 'cancelled'])
async def test_google_checkout_owner_receives_operator_status_without_sms(env, status):
    client,maker,_,patch=env
    uid,headers=await login(maker)
    response=await client.post('/api/v1/entities/food_orders',headers=headers,json={
        'legal_version':'2026-10-09','legal_accepted':True,
        'request_key':str(uuid4()),'restaurant_id':1,'customer_name':'Audit Google',
        'customer_phone':'+77003334455','delivery_method':'pickup','payment_method':'cash',
        'order_items':json.dumps([{'id':2,'quantity':2}]),'total_amount':600})
    assert response.status_code==201,response.text
    phone_recipient = AsyncMock(side_effect=AssertionError('Checkout owner must take precedence over contact phone'))
    patch.setattr('services.user_notifications.notify_user_by_phone',phone_recipient)
    async with maker() as db:
        order=await db.get(Food_orders,response.json()['id'])
        await original_created(db, order)
        assert await db.scalar(select(func.count()).select_from(UserNotification).where(
            UserNotification.user_id==uid,UserNotification.event_key==f'food:created:{order.id}'))==1
        order.status=status;await db.commit()
        await original_status(db,order,'new',status)
        await original_status(db,order,'new',status)
        assert await db.scalar(select(func.count()).select_from(UserNotification).where(
            UserNotification.user_id==uid,UserNotification.event_key==f'food:status:{order.id}:{status}'))==1
        task=SimpleNamespace(id=123,source_id=order.id,source_type='food_orders',
            vertical='food',merchant_name='DAM ALEM',customer_phone=order.customer_phone)
        await original_logistics(db,task,'assigned','on_the_way')
        assert await db.scalar(select(func.count()).select_from(UserNotification).where(
            UserNotification.user_id==uid,UserNotification.event_key=='logistics:123:on_the_way'))==1
        phone_recipient.assert_not_called()

@pytest.mark.asyncio
async def test_conflicting_checkout_owners_do_not_leak_order_notifications(env):
    from models.food_payment import FoodPayment
    client,maker,_,patch=env
    uid,headers=await login(maker)
    other,_=await login(maker)
    response=await client.post('/api/v1/entities/food_orders',headers=headers,json={
        'legal_version':'2026-10-09','legal_accepted':True,
        'request_key':str(uuid4()),'restaurant_id':1,'customer_name':'Conflict test',
        'customer_phone':'+77003334455','delivery_method':'pickup','payment_method':'cash',
        'order_items':json.dumps([{'id':2,'quantity':2}]),'total_amount':600})
    assert response.status_code==201,response.text
    phone_recipient=AsyncMock(side_effect=AssertionError('Conflicting ownership must not fall back to phone'))
    patch.setattr('services.user_notifications.notify_user_by_phone',phone_recipient)
    async with maker() as db:
        oid=response.json()['id']
        payment=await db.scalar(select(FoodPayment).where(FoodPayment.order_id==oid))
        db.add(FoodPayment(id=str(uuid4()),order_id=oid,user_id=other,provider=payment.provider,
            amount=payment.amount,status=payment.status,created_at=payment.created_at))
        await db.commit()
        order=await db.get(Food_orders,oid)
        await original_status(db,order,'new','confirmed')
        assert await db.scalar(select(func.count()).select_from(UserNotification).where(
            UserNotification.event_key==f'food:status:{oid}:confirmed'))==0
    phone_recipient.assert_not_called()
