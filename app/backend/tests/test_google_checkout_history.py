import json
from datetime import datetime,timedelta,timezone
from uuid import uuid4
import pytest
from sqlalchemy import select
from models.auth import User
from models.user_management import UserSession
from models.food_payment import FoodPayment
from models.food_orders import Food_orders
from models.crm import Customer
from core.auth import create_access_token
from tests.test_dam_order_workflow import env

async def login(maker, *, phone=None, verified=False):
    uid=str(uuid4());jti=str(uuid4())
    async with maker() as db:
        db.add(User(id=uid,name='Google test',email=f'{uid}@test.invalid',google_sub=uid,phone=phone,phone_verified_at=datetime.now(timezone.utc) if verified else None,role='user',status='active',is_active=True))
        db.add(UserSession(user_id=uid,token_jti=jti,is_active=True,expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
        await db.commit()
    return uid,{'Authorization':'Bearer '+create_access_token({'sub':uid,'jti':jti,'role':'user'})}

@pytest.mark.asyncio
@pytest.mark.parametrize('phone',[None,'+77003334455'])
async def test_google_without_sms_sees_own_checkout_and_receipt(env,phone):
    client,maker,_,_=env
    uid,headers=await login(maker,phone=phone)
    body={'request_key':'google-history-'+str(uuid4()),'restaurant_id':1,'customer_name':'Google test','customer_phone':'+77003334455','delivery_method':'pickup','payment_method':'cash','order_items':json.dumps([{'id':2,'quantity':2}]),'total_amount':600,'user_id':99999}
    body.update(legal_version='2026-10-09',legal_accepted=True)
    created=await client.post('/api/v1/entities/food_orders',headers=headers,json=body)
    assert created.status_code==201,created.text
    oid=created.json()['id']
    async with maker() as db:
        payment=await db.scalar(select(FoodPayment).where(FoodPayment.order_id==oid))
        assert payment.user_id==uid
        customer=await db.get(Customer,(await db.get(Food_orders,oid)).customer_id)
        assert customer.user_id is None and customer.verified_at is None # no unverified CRM/bonus takeover
    history=await client.get('/api/v1/account/cabinet',headers=headers)
    assert history.status_code==200,history.text
    assert any(o['id']==f'food_{oid}' for o in history.json()['orders'])
    receipt=await client.get(f'/api/v1/account/orders/food/{oid}',headers=headers)
    assert receipt.status_code==200,receipt.text
    assert receipt.json()['amount']==600
    other,other_headers=await login(maker)
    assert (await client.get(f'/api/v1/account/orders/food/{oid}',headers=other_headers)).status_code==404
    assert not any(o['id']==f'food_{oid}' for o in (await client.get('/api/v1/account/cabinet',headers=other_headers)).json()['orders'])
    repeated=await client.post('/api/v1/entities/food_orders',headers=headers,json=body)
    assert repeated.status_code==201 and repeated.json()['id']==oid

@pytest.mark.asyncio
async def test_unverified_google_cannot_claim_old_phone_orders(env):
    client,maker,_,_=env
    uid,headers=await login(maker,phone='+77000000000')
    history=await client.get('/api/v1/account/cabinet',headers=headers)
    assert history.status_code==200
    assert not any(o['id']=='food_1' for o in history.json()['orders'])
    assert (await client.get('/api/v1/account/orders/food/1',headers=headers)).status_code==404
