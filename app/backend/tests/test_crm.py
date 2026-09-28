import asyncio
from datetime import timedelta
from decimal import Decimal
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from models.auth import User
from models.crm import Customer, BusinessCustomer, CustomerNote, BusinessLocation
from models.food_orders import Food_orders
from models.loyalty import BonusMember
from models.user_management import Bonus
from services import crm, loyalty as L
from services.cabinet_history import list_owned_history
from tests.test_loyalty import store, order

@pytest.mark.parametrize('raw',['+7 (700) 428-02-80','87004280280','7004280280'])
def test_phone_normalization(raw):
    assert crm.normalize_phone(raw)=='+77004280280'

@pytest.mark.parametrize('raw',['123','+18001234567','NaN','',None])
def test_invalid_phone(raw):
    with pytest.raises(HTTPException): crm.normalize_phone(raw)

@pytest.mark.asyncio
async def test_guest_orders_link_only_after_verified_registration(store):
    async with store() as db:
        c=await crm.resolve(db,'87004280280','Guest',business_id=crm.DAM)
        row=Food_orders(restaurant_id=1,business_id=crm.DAM,customer_id=c.id,customer_phone=c.phone,status='done',total_amount=1000,payment_status='paid',paid_amount=1000)
        db.add(row);await db.flush()
        u=User(id='new-login',phone=c.phone,name='Guest');db.add(u);await db.flush()
        with pytest.raises(HTTPException): await crm.for_account(db,u)
        assert await list_owned_history(db,Food_orders,u)==[]
        u.phone_verified_at=L.now();linked=await crm.for_account(db,u)
        assert linked.id==c.id
        assert [x.id for x in await list_owned_history(db,Food_orders,u)]==[row.id]
        assert await crm.owns_order(db,u,row)
        assert await db.scalar(select(func.count()).select_from(Customer).where(Customer.normalized_phone==c.phone))==1

@pytest.mark.asyncio
async def test_same_customer_two_businesses_isolated_ledger_history_notes(store):
    async with store() as db:
        c=await crm.resolve(db,'87000000000','A',business_id=crm.DAM)
        same=await crm.resolve(db,'+77000000000','Another spelling',business_id='shop-two')
        assert same.id==c.id
        a=await L.account(db,c.id);b=await L.account(db,c.id,business_id='shop-two')
        await L.adjust(db,c.id,500,'DAM compensation','dam-credit',{'role':'owner'})
        await L.adjust(db,c.id,100,'Shop compensation','shop-credit',{'role':'owner'},business_id='shop-two')
        assert a.id!=b.id and a.bonus_balance==500 and b.bonus_balance==100
        membership=await crm.membership(db,c,crm.DAM)
        db.add(CustomerNote(membership_id=membership.id,text='Internal only',author='owner',actor_role='owner'))
        db.add_all([Food_orders(restaurant_id=1,business_id=crm.DAM,customer_id=c.id,delivery_address='DAM address',delivery_method='delivery'),Food_orders(restaurant_id=9,business_id='shop-two',customer_id=c.id,delivery_address='Other address',delivery_method='delivery')]);await db.flush()
        dam=await crm.overview(db,crm.DAM,c.id,include_internal=True)
        shop=await crm.overview(db,'shop-two',c.id,include_internal=True)
        client=await crm.overview(db,crm.DAM,c.id)
        assert dam['addresses']==['DAM address'] and shop['addresses']==['Other address']
        assert len(dam['notes'])==1 and not shop['notes'] and 'notes' not in client
        assert client['loyalty']['balance']==500
        with pytest.raises(HTTPException): await crm.scoped_customer(db,'foreign',c.id)

@pytest.mark.asyncio
async def test_search_never_leaks_global_customers(store):
    async with store() as db:
        c=await crm.resolve(db,'87004280280','Secret',business_id='another')
        assert await crm.search(db,crm.DAM,'8700')==[]
        assert await crm.search(db,'another','8700')==[{'id':c.id,'name':'Secret','phone':c.phone}]
        assert await crm.search(db,'another','Se')==[]

@pytest.mark.asyncio
async def test_concurrent_first_customer_creation_one_identity(store):
    async def create():
        async with store() as db:
            c=await crm.resolve(db,'87004280280','Guest',business_id=crm.DAM)
            account=await L.account(db,c.id)
            await db.commit();return c.id,account.id
    assert len(set(await asyncio.gather(create(),create())))==1

@pytest.mark.asyncio
async def test_guest_earning_before_app_then_balance_linked(store):
    async with store() as db:
        c=await crm.resolve(db,'87004280280','Guest',business_id=crm.DAM)
        snap=await L.price_snapshot(db,food=10000,promo=0,delivery=0,service=0,user=c)
        o=Food_orders(restaurant_id=1,business_id=crm.DAM,customer_id=c.id,customer_phone=c.phone,status='done',total_amount=10000,paid_amount=10000,payment_status='paid',loyalty_snapshot=snap)
        db.add(o);await db.flush();await L.settle(db,o)
        assert (await L.summary(db,c.id))['balance']==600
        u=User(id='guest-login',phone=c.phone,name='Guest',phone_verified_at=L.now());db.add(u);await db.flush()
        assert (await L.summary(db,u.id))['balance']==600
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='WELCOME'))==1

@pytest.mark.asyncio
async def test_cross_business_referral_rejected(store):
    async with store() as db:
        a=await L.account(db,'a',business_id='another')
        with pytest.raises(HTTPException): await L.bind_referrer(db,await db.get(User,'b'),a.referral_code)

@pytest.mark.asyncio
async def test_disabled_autoenroll_and_spending(store):
    async with store() as db:
        await L.configure(db,{'auto_enroll':False},{'role':'owner'})
        o=await order(db);await L.settle(db,o)
        assert (await L.account(db,'a')).bonus_balance==0
        assert not (await L.account(db,'a')).enabled

@pytest.mark.asyncio
async def test_wrong_customer_payload_is_replaced_from_contact(store):
    async with store() as db:
        victim=await crm.for_account(db,await db.get(User,'a'),business_id=crm.DAM)
        o=Food_orders(restaurant_id=1,business_id='malicious',customer_id=victim.id,customer_phone='+77000000001',customer_name='B',delivery_method='pickup',order_source='app')
        db.add(o);await db.flush();await crm.attach_order(db,o)
        assert o.business_id==crm.DAM and o.customer_id!=victim.id

@pytest.mark.asyncio
async def test_location_snapshot_does_not_guess_coordinates(store):
    async with store() as db:
        await crm.ensure_business(db)
        db.add(BusinessLocation(id='dam:main',business_id=crm.DAM,name='DAM',address='Park',landmark='Fountain',active=True));await db.flush()
        location=await crm.pickup_location(db)
        assert location['address']=='Park' and location['latitude'] is None



@pytest.mark.asyncio
async def test_paginated_timeline_is_business_scoped(store):
    from services.crm_timeline import history
    from models.food_operations import FoodOrderEvent
    async with store() as db:
        c=await crm.resolve(db,'+77007778899','History',business_id=crm.DAM)
        await crm.membership(db,c,'other')
        own=Food_orders(restaurant_id=1,business_id=crm.DAM,customer_id=c.id,created_at=L.now().isoformat())
        foreign=Food_orders(restaurant_id=9,business_id='other',customer_id=c.id,created_at=L.now().isoformat())
        db.add_all([own,foreign]);await db.flush()
        db.add_all([FoodOrderEvent(order_id=own.id,actor='operator',message='Our kitchen',created_at=L.now().isoformat()),FoodOrderEvent(order_id=foreign.id,actor='operator',message='Foreign secret',created_at=L.now().isoformat())])
        await db.flush()
        first=await history(db,crm.DAM,c.id,limit=2)
        second=await history(db,crm.DAM,c.id,offset=first['next_offset'],limit=20)
        assert len(first['items'])==2 and second['next_offset'] is None
        all_items=first['items']+second['items']
        assert 'Our kitchen' in [x['title'] for x in all_items]
        assert 'Foreign secret' not in str(all_items)
        assert len({(x['kind'],x['id']) for x in all_items})==len(all_items)
