"""Real database contract tests: no frontend arithmetic or financial mocks."""
import asyncio
import os
import uuid
import json
from datetime import timedelta
from decimal import Decimal
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base
from models.auth import User
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.food_shifts import FoodShift
from models.food_restaurants import Food_restaurants
from models.user_management import Bonus
from models.loyalty import BonusMember, BonusReferral, BonusLot, BonusReview
from models.user_notifications import UserNotification
from services import loyalty as L, crm
from models.crm import Customer, BusinessCustomer


@pytest.fixture
async def store(tmp_path):
    pg_url = os.environ.get('LOYALTY_TEST_POSTGRES_URL')
    schema = 'crm_test_' + uuid.uuid4().hex
    if pg_url:
        from sqlalchemy.engine import make_url
        from sqlalchemy import text
        parsed = make_url(pg_url)
        assert parsed.host in ('127.0.0.1', 'localhost') and parsed.database == 'crm_test', 'Disposable local database only'
        admin = create_async_engine(pg_url)
        async with admin.begin() as c:
            await c.execute(text(f'CREATE SCHEMA {schema}'))
        engine = create_async_engine(pg_url, connect_args={'server_settings': {'search_path': schema}})
    else:
        engine = create_async_engine('sqlite+aiosqlite:///'+(tmp_path/'loyalty.db').as_posix(), connect_args={'timeout': 30})
    async with engine.begin() as c:
        await c.run_sync(lambda conn: Base.metadata.create_all(conn, tables=[t for name,t in Base.metadata.tables.items() if name in ('users','bonuses','user_actions','food_orders','food_restaurants','food_order_events','food_shifts','user_notifications','businesses','customers','customer_identities','business_customers','customer_notes','business_locations','customer_migration_issues','channel_confirmations') or name.startswith('bonus_')]))
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add(Food_restaurants(id=1, name='DAM ALEM 2.0', merchant_key='dam_alem'))
        for i, uid in enumerate(('a','b','c')):
            db.add(User(id=uid, phone=f'+7700000000{i}', name=uid, bonus_balance=0, phone_verified_at=L.now()))
        await db.commit()
    yield maker
    await engine.dispose()
    if pg_url:
        async with admin.begin() as c:
            await c.execute(text(f'DROP SCHEMA {schema} CASCADE'))
        await admin.dispose()


async def order(db, uid='a', food=10000, promo=0, delivery=0, spent=0, source='app', fulfillment='pickup', paid=True, completed=True):
    user = await db.get(User, uid)
    snap = await L.price_snapshot(db, food=food, promo=promo, delivery=delivery, service=0, requested=spent, user=user)
    row = Food_orders(restaurant_id=1, customer_id=(await crm.for_account(db,user)).id, business_id=crm.DAM, customer_phone=user.phone, restaurant_name='DAM ALEM 2.0',
        total_amount=float(snap['total_amount']), paid_amount=float(snap['total_amount']) if paid else 0,
        status='done' if completed else 'new', payment_status='paid' if paid else 'pending', payment_method='cash',
        delivery_method=fulfillment, order_source=source, loyalty_snapshot=snap, bonus_points_used=spent,
        bonus_discount_amount=spent, order_items=json.dumps([{'name':'food','price':food,'quantity':1,'sum':food}]))
    db.add(row); await db.flush()
    if spent: await L.spend(db, user, row)
    return row


async def credit(db, value, uid='a', key='seed'):
    await L.adjust(db, uid, value, 'Компенсация клиенту', key, {'id':'owner','role':'owner'})


@pytest.mark.asyncio
@pytest.mark.parametrize('source', ['app','operator','whatsapp'])
@pytest.mark.parametrize('fulfillment', ['delivery','pickup','dine_in'])
async def test_all_nine_channels_share_earning(store, source, fulfillment):
    async with store() as db:
        o = await order(db, source=source, fulfillment=fulfillment)
        await L.settle(db, o); await L.settle(db, o); await db.commit()
        user = await L.account(db,'a')
        assert user.bonus_balance == 600
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='EARN')) == 1
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='WELCOME')) == 1
        assert o.loyalty_snapshot['eligible_amount']=='10000.00'


@pytest.mark.asyncio
@pytest.mark.parametrize('paid,completed', [(False,True),(True,False),(False,False)])
async def test_only_paid_and_completed_qualify(store, paid, completed):
    async with store() as db:
        o=await order(db,paid=paid,completed=completed)
        await L.settle(db,o)
        assert (await L.account(db,'a')).bonus_balance==0


@pytest.mark.asyncio
async def test_partial_payment_does_not_earn(store):
    async with store() as db:
        o=await order(db);o.paid_amount=5000
        await L.settle(db,o)
        assert (await L.account(db,'a')).bonus_balance==0


@pytest.mark.asyncio
async def test_full_customer_journey_spend_cancel_referral(store):
    async with store() as db:
        first=await order(db);await L.settle(db,first)
        second=await order(db,spent=600);await L.settle(db,second)
        assert (await L.account(db,'a')).bonus_balance==282
        cancelled=await order(db,spent=200,completed=False)
        cancelled.status='cancelled';await L.settle(db,cancelled);await L.settle(db,cancelled)
        assert (await L.account(db,'a')).bonus_balance==282
        code=(await L.member(db,await db.get(User,'a'))).referral_code
        await L.bind_referrer(db,await db.get(User,'b'),code)
        invited=await order(db,'b');await L.settle(db,invited);await L.settle(db,invited)
        assert (await L.account(db,'a')).bonus_balance==582
        assert (await L.account(db,'b')).bonus_balance==600
        await db.commit()


@pytest.mark.asyncio
async def test_promo_bonus_delivery_and_gift_base(store):
    async with store() as db:
        await credit(db,1000)
        o=await order(db,food=10000,promo=1000,delivery=600,spent=1000)
        o.order_items=json.dumps([{'price':10000,'quantity':1},{'price':0,'quantity':1,'is_gift':True}])
        await L.settle(db,o)
        assert o.total_amount==8600
        assert Decimal(o.loyalty_snapshot['bonus_earned'])==540 # includes welcome
        assert (await L.account(db,'a')).bonus_balance==540


@pytest.mark.asyncio
async def test_max_twenty_percent_and_frontend_tamper(store):
    async with store() as db:
        await credit(db,10000)
        for quantity in (2001,999999,-1):
            with pytest.raises(HTTPException):
                await order(db,spent=quantity)
        o=await order(db,spent=2000)
        assert o.total_amount==8000


@pytest.mark.asyncio
@pytest.mark.parametrize('value', ['NaN','Infinity','-Infinity','1e99','abc'])
async def test_invalid_money(value):
    with pytest.raises(HTTPException):L.amount(value)


@pytest.mark.asyncio
async def test_no_negative_manual_or_spend(store):
    async with store() as db:
        with pytest.raises(HTTPException):await credit(db,-1)
        with pytest.raises(HTTPException):await L.adjust(db,'a',1,'','x',{'role':'owner'})


@pytest.mark.asyncio
async def test_fifo_expiration_and_expired_spend(store):
    async with store() as db:
        await L.policy(db,lock=True);u=await L.account(db,'a')
        await L.post(db,u,'WELCOME',300,'short','Short',expires_at=L.now()+timedelta(days=1))
        await L.post(db,u,'EARN',500,'long','Long',expires_at=L.now()+timedelta(days=30))
        await order(db,spent=400,completed=False)
        lots=(await db.scalars(select(BonusLot).order_by(BonusLot.id))).all()
        assert [x.remaining for x in lots]==[0,400]
        await L.expire(db,u,L.now()+timedelta(days=31))
        assert u.bonus_balance==0
        with pytest.raises(HTTPException):await order(db,spent=1)


@pytest.mark.asyncio
async def test_cancel_preserves_original_expiry(store):
    async with store() as db:
        await L.policy(db,lock=True);u=await L.account(db,'a')
        await L.post(db,u,'EARN',500,'short','Short',expires_at=L.now()+timedelta(days=1))
        o=await order(db,spent=500,completed=False)
        lot=await db.scalar(select(BonusLot));lot.expires_at=L.now()-timedelta(days=1)
        o.status='cancelled';await L.settle(db,o)
        assert u.bonus_balance==0
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='EXPIRE'))==1


@pytest.mark.asyncio
async def test_referral_self_cycle_and_immutable(store):
    async with store() as db:
        await L.policy(db,lock=True)
        users={k:await L.account(db,k) for k in ('a','b','c')}
        codes={k:(await L.member(db,u)).referral_code for k,u in users.items()}
        with pytest.raises(HTTPException):await L.bind_referrer(db,users['a'],codes['a'])
        await L.bind_referrer(db,users['b'],codes['a'])
        await L.bind_referrer(db,users['b'],codes['a'])
        await L.bind_referrer(db,users['c'],codes['b'])
        with pytest.raises(HTTPException):await L.bind_referrer(db,users['a'],codes['b'])
        with pytest.raises(HTTPException):await L.bind_referrer(db,users['a'],codes['c'])
        with pytest.raises(HTTPException):await L.bind_referrer(db,users['b'],codes['c'])


@pytest.mark.asyncio
async def test_same_phone_and_phone_change_cannot_repeat_welcome(store):
    async with store() as db:
        o=await order(db);await L.settle(db,o)
        u=await db.get(User,'a');old=u.phone;u.phone='+77000009999';await db.flush()
        with pytest.raises(HTTPException): await order(db)
        b=await db.get(User,'b');b.phone=old;await db.flush()
        with pytest.raises(HTTPException): await order(db,'b')
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='WELCOME'))==1


@pytest.mark.asyncio
async def test_old_policy_and_rounding(store):
    async with store() as db:
        o=await order(db,food=7999,completed=False)
        await L.configure(db,{'cashback_rate':2}, {'id':'owner','role':'owner'})
        o.status='done';await L.settle(db,o)
        assert Decimal(o.loyalty_snapshot['bonus_earned'])==540 # includes welcome
        newer=await order(db);await L.settle(db,newer)
        assert Decimal(newer.loyalty_snapshot['bonus_earned'])==200
        await L.settle(db,o)
        assert o.loyalty_snapshot['bonus_rate']=='3'


@pytest.mark.asyncio
async def test_refund_partial_full_and_duplicate(store):
    async with store() as db:
        o=await order(db);await L.settle(db,o)
        await L.refund(db,o,5000)
        assert (await L.account(db,'a')).bonus_balance==450
        await L.refund(db,o,5000)
        assert (await L.account(db,'a')).bonus_balance==450
        await L.refund(db,o,10000)
        assert (await L.account(db,'a')).bonus_balance==0
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='EARN'))==1
        repeat=await order(db);await L.settle(db,repeat)
        assert (await L.account(db,'a')).bonus_balance==300 # lifetime welcome not reissued


@pytest.mark.asyncio
async def test_refund_after_spend_has_debt_not_negative_available(store):
    async with store() as db:
        o=await order(db);await L.settle(db,o)
        await order(db,spent=600,completed=False)
        await L.refund(db,o,10000)
        u=await L.account(db,'a');assert u.bonus_balance==0 and u.bonus_debt==600
        await credit(db,700)
        assert u.bonus_balance==100 and u.bonus_debt==0


@pytest.mark.asyncio
async def test_referral_revoked_on_full_refund(store):
    async with store() as db:
        a=await L.account(db,'a');code=(await L.member(db,a)).referral_code
        await L.bind_referrer(db,await db.get(User,'b'),code)
        o=await order(db,'b');await L.settle(db,o)
        assert a.bonus_balance==300
        await L.refund(db,o,10000)
        assert a.bonus_balance==0


@pytest.mark.asyncio
async def test_fraud_review_no_ip_block_and_owner_review(store):
    async with store() as db:
        await L.configure(db,{'customer_daily_order_limit':1},{'role':'owner'})
        first=await order(db);await L.settle(db,first)
        second=await order(db);await L.settle(db,second)
        review=await db.scalar(select(BonusReview))
        assert review.status=='REVIEW' and (await L.account(db,'a')).bonus_balance==600
        await L.resolve_review(db,review.id,True,'Проверен реальный заказ',{'role':'owner'})
        await L.resolve_review(db,review.id,True,'Повтор',{'role':'owner'})
        assert (await L.account(db,'a')).bonus_balance==900


@pytest.mark.asyncio
async def test_test_order_no_rewards(store):
    async with store() as db:
        o=await order(db);o.loyalty_snapshot={**o.loyalty_snapshot,'test_order':True}
        await L.settle(db,o)
        assert (await L.account(db,'a')).bonus_balance==0


@pytest.mark.asyncio
async def test_concurrent_earning_and_welcome(store):
    async with store() as db:
        a=await order(db,completed=False);b=await order(db,completed=False)
        ids=[a.id,b.id];await db.commit()
    async def finish(oid):
        async with store() as db:
            o=await db.get(Food_orders,oid);o.status='done'
            await L.settle(db,o);await db.commit()
    await asyncio.gather(finish(ids[0]),finish(ids[0]),finish(ids[1]))
    async with store() as db:
        assert (await L.account(db,'a')).bonus_balance==900
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='WELCOME'))==1
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='EARN'))==2


@pytest.mark.asyncio
async def test_concurrent_double_spend(store):
    async with store() as db:
        await credit(db,1000)
        a=await order(db,completed=False);b=await order(db,completed=False)
        for o in (a,b):
            o.bonus_points_used=1000;o.loyalty_snapshot={**o.loyalty_snapshot,'bonus_spent':'1000'}
        ids=[a.id,b.id];await db.commit()
    ready=asyncio.Event();loaded=0
    async def spend(oid):
        nonlocal loaded
        async with store() as db:
            o=await db.get(Food_orders,oid);u=await db.get(User,'a')
            loaded+=1
            if loaded==2:ready.set()
            await ready.wait()
            try:
                await L.spend(db,u,o);await db.commit();return True
            except HTTPException:
                await db.rollback();return False
    result=await asyncio.gather(*(spend(i) for i in ids))
    assert sorted(result)==[False,True]
    async with store() as db:
        assert (await L.account(db,'a')).bonus_balance==0
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='SPEND'))==1
