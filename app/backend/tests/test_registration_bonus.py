"""Real account ledger and HTTP checkout; no real SMS, OAuth or money."""
import asyncio
import json
from uuid import uuid4
import pytest
from sqlalchemy import select, func
from models.auth import User
from models.user_management import Bonus
from models.food_orders import Food_orders
from models.crm import Customer
from services import loyalty as L, registration_bonus as R
from tests.test_dam_order_workflow import env
from tests.test_google_checkout_history import login


async def customer(maker, *, verified=False):
    uid, headers = await login(maker, phone='+7700'+str(uuid4().int)[0:7] if verified else None, verified=verified)
    async with maker() as db:
        await R.grant(db, await db.get(User, uid))
        await db.commit()
    return uid, headers


def body(spent=300, quantity=1):
    return {'legal_version':'2026-10-09','legal_accepted':True,'request_key': str(uuid4()), 'restaurant_id': 1,
        'customer_name': 'Registration test', 'customer_phone': '+77003334455',
        'delivery_method': 'pickup', 'payment_method': 'cash',
        'order_items': json.dumps([{'id': 1, 'quantity': quantity}]),
        'bonus_points_to_use': spent, 'total_amount': 1500*quantity-spent}


@pytest.mark.asyncio
async def test_google_registration_awards_once_and_admin_lists_it(env):
    client, maker, _, _ = env
    from routers.account_v2 import _get_or_create_google_user
    args=dict(google_sub=str(uuid4()),email='new-google@test.invalid',name='New Google',avatar=None,agreements_accepted=True)
    async with maker() as db:
        user, created=await _get_or_create_google_user(db,**args)
        assert created and user.bonus_balance == 300 and user.phone is None
        again, created=await _get_or_create_google_user(db,**args)
        assert not created and again.id == user.id
        assert await R.balance(db,user.id)==300
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.user_id==user.id,Bonus.kind=='REGISTRATION'))==1
        assert await db.scalar(select(Customer).where(Customer.user_id==user.id)) is None
    _, admin_headers=await login(maker)
    async with maker() as db:
        admin=await db.scalar(select(User).where(User.google_sub.is_not(None),User.id!=user.id))
        admin.role='admin';await db.commit()
    registrations=await client.get('/api/v1/account/admin/registrations',headers=admin_headers)
    assert registrations.status_code==200,registrations.text
    assert any(row['user_id']==user.id for row in registrations.json())


@pytest.mark.asyncio
@pytest.mark.parametrize('verified',[False,True])
async def test_phone_registration_has_welcome_credit(env,verified):
    _, maker, _, _ = env
    from routers.account_v2 import _create_user_and_login
    from schemas.account_v2 import RegisterV2Request
    from starlette.requests import Request
    request=Request({'type':'http','headers':[],'client':('127.0.0.1',1),'method':'POST','path':'/test'})
    async with maker() as db:
        payload=RegisterV2Request(legal_version='2026-10-09',name='Phone test',phone='+77007770001',password='Isolated-test-428!',agreement_accepted=True,privacy_accepted=True)
        result=await _create_user_and_login(payload,request,db,phone_verified=verified,passwordless=verified)
        assert await R.balance(db,result.user_id)==300
        user=await db.get(User,result.user_id)
        await R.grant(db,user);await db.commit()
        assert user.bonus_balance==300


@pytest.mark.asyncio
async def test_google_credit_spend_replay_cancel_and_no_contact_takeover(env):
    client, maker, _, _ = env
    uid,headers=await customer(maker)
    state=await client.get('/api/v1/dam-alem/loyalty/me',headers=headers)
    assert state.status_code==200,state.text
    assert state.json()['balance']==300 and state.json()['registration_balance']==300
    request=body()
    made=await client.post('/api/v1/entities/food_orders',headers=headers,json=request)
    assert made.status_code==201,made.text
    oid=made.json()['id']
    repeat=await client.post('/api/v1/entities/food_orders',headers=headers,json=request)
    assert repeat.status_code==201 and repeat.json()['id']==oid
    async with maker() as db:
        order=await db.get(Food_orders,oid)
        assert order.total_amount==1200 and order.bonus_points_used==300
        assert await R.balance(db,uid)==0
        contact=await db.get(Customer,order.customer_id)
        assert contact.user_id is None and contact.verified_at is None
        order.status='cancelled'
        await L.settle(db,order);await L.settle(db,order);await db.commit()
        assert await R.balance(db,uid)==300
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='REGISTRATION_RETURN'))==1
    outsider,foreign_headers=await login(maker,phone='+77003334455')
    foreign=await client.get('/api/v1/dam-alem/loyalty/me',headers=foreign_headers)
    assert foreign.status_code==200 and foreign.json()['balance']==0
    assert (await client.get(f'/api/v1/account/orders/food/{oid}',headers=foreign_headers)).status_code==404


@pytest.mark.asyncio
async def test_registration_credit_is_dam_only_and_subject_to_food_cap(env):
    _, maker, _, _ = env
    uid,_=await customer(maker)
    from fastapi import HTTPException
    async with maker() as db:
        user=await db.get(User,uid)
        with pytest.raises(HTTPException):
            await L.price_snapshot(db,food=1000,promo=0,delivery=500,service=0,requested=300,user=user)
        with pytest.raises(HTTPException):
            await L.price_snapshot(db,food=1500,promo=0,delivery=0,service=0,requested=300,user=user,business_id='restaurant-other')
        assert await R.balance(db,uid)==300


@pytest.mark.asyncio
async def test_ten_accounts_checkout_together(env):
    client,maker,_,_=env
    people=[await customer(maker) for _ in range(10)]
    responses=await asyncio.gather(*[client.post('/api/v1/entities/food_orders',headers=h,json=body()) for _,h in people])
    assert all(r.status_code==201 for r in responses),[(r.status_code,r.text) for r in responses]
    assert len({r.json()['id'] for r in responses})==10
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='REGISTRATION_SPEND'))==10
        assert all([await R.balance(db,uid)==0 for uid,_ in people])


@pytest.mark.asyncio
async def test_two_concurrent_orders_cannot_spend_same_welcome_credit(env):
    client,maker,_,_=env
    uid,headers=await customer(maker)
    results=await asyncio.gather(*[client.post('/api/v1/entities/food_orders',headers=headers,json=body()) for _ in range(2)])
    assert sorted(r.status_code for r in results)==[201,409],[(r.status_code,r.text) for r in results]
    async with maker() as db:
        assert await R.balance(db,uid)==0
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='REGISTRATION_SPEND'))==1


@pytest.mark.asyncio
async def test_mixed_wallet_spend_and_actual_full_refund_restore_both(env):
    client,maker,_,_=env
    uid,headers=await customer(maker,verified=True)
    async with maker() as db:
        user=await db.get(User,uid)
        await L.adjust(db,uid,200,'Test compensation','test-mixed',{'role':'owner'})
        phone=user.phone
        await db.commit()
    request=body(spent=500,quantity=2);request['customer_phone']=phone
    result=await client.post('/api/v1/entities/food_orders',headers=headers,json=request)
    assert result.status_code==201,result.text
    async with maker() as db:
        order=await db.get(Food_orders,result.json()['id'])
        member=await L.account(db,uid)
        assert member.bonus_balance==0 and await R.balance(db,uid)==0
        assert order.loyalty_snapshot['registration_spent']=='300.00'
        assert (await db.scalar(select(Bonus).where(Bonus.idempotency_key==f'spend:{order.id}'))).points==-200
        order.status='done';order.payment_status='paid';order.paid_amount=order.total_amount
        await L.settle(db,order)
        await L.refund(db,order,order.total_amount,{'role':'owner'})
        await L.refund(db,order,order.total_amount,{'role':'owner'})
        await db.commit()
        assert member.bonus_balance==200 and await R.balance(db,uid)==300


@pytest.mark.asyncio
async def test_failed_checkout_rolls_back_and_owner_sees_registration_liability(env):
    client,maker,_,_=env
    uid,headers=await customer(maker)
    request=body();request['total_amount']=1
    assert (await client.post('/api/v1/entities/food_orders',headers=headers,json=request)).status_code==400
    async with maker() as db:
        assert await R.balance(db,uid)==300
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='REGISTRATION_SPEND'))==0
    from core.auth import create_access_token
    owner={'Authorization':'Bearer '+create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':2,'sub':'owner'})}
    response=await client.get('/api/v1/dam-alem/loyalty/owner',headers=owner)
    assert response.status_code==200,response.text
    assert response.json()['liability']==300 and response.json()['totals']['REGISTRATION']==300
    history=await client.get('/api/v1/dam-alem/loyalty/owner/history',headers=owner)
    assert history.status_code==200 and any(row['type']=='REGISTRATION' for row in history.json())
    export=await client.get('/api/v1/dam-alem/loyalty/owner/export',headers=owner)
    assert export.status_code==200 and 'REGISTRATION' in export.text
