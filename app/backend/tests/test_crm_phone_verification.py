"""Existing-account phone proof reuses OTP; guest history is never linked by a form."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select, func
from models.auth import User
from models.crm import Customer
from models.user_management import PhoneVerification
from routers import account_v2
from services import crm, loyalty as L
from tests.test_dam_order_workflow import env

@pytest.mark.asyncio
async def test_existing_account_sms_links_guest_once_and_ignores_frontend_phone(env, monkeypatch):
    client,maker,_,_=env
    assert (await client.post('/api/v1/account/phone/request-sms')).status_code==401
    async with maker() as db:
        guest=await crm.resolve(db,'+77001234567','Guest',business_id=crm.DAM)
        guest_id=guest.id
        await L.adjust(db,guest.id,500,'Compensation','phone-test',{'id':'owner','role':'owner'})
        user=User(id='unverified',name='Client',phone=guest.phone,is_active=True,status='active',role='user')
        db.add(user);await db.commit()
    monkeypatch.setattr(account_v2,'resolve_account_user',AsyncMock(return_value=user))
    codes=[]
    async def send(phone,code):
        codes.append((phone,code));return SimpleNamespace(pending_moderation=False)
    monkeypatch.setattr(account_v2,'send_verification_code',send)
    monkeypatch.setattr(account_v2,'should_expose_code_on_screen',lambda _:False)
    requested=await client.post('/api/v1/account/phone/request-sms',json={'phone':'+77009998877'})
    assert requested.status_code==200,requested.text
    assert codes[0][0]==user.phone and requested.json()['debug_code'] is None
    assert (await client.post('/api/v1/account/phone/request-sms')).status_code==200
    assert len(codes)==1  # provider isn't called twice during cooldown
    wrong='000000' if codes[0][1]!='000000' else '111111'
    assert (await client.post('/api/v1/account/phone/confirm',json={'code':wrong})).status_code==400
    assert (await client.post('/api/v1/account/phone/confirm',json={'code':codes[0][1],'phone':'+77009998877'})).status_code==422
    async def current(db,auth): return await db.get(User,'unverified')
    monkeypatch.setattr(account_v2,'resolve_account_user',current)
    confirmed=await client.post('/api/v1/account/phone/confirm',json={'code':codes[0][1]})
    assert confirmed.status_code==200,confirmed.text
    assert (await client.post('/api/v1/account/phone/confirm',json={'code':codes[0][1]})).status_code==200
    async with maker() as db:
        linked=await db.get(Customer,guest_id)
        assert linked.user_id=='unverified' and linked.verified_at
        assert await db.scalar(select(func.count()).select_from(Customer).where(Customer.normalized_phone==user.phone))==1
        assert (await L.summary(db,guest_id))['balance']==500
        row=await db.scalar(select(PhoneVerification).where(PhoneVerification.phone==user.phone))
        assert row.is_verified and row.attempts==2

@pytest.mark.asyncio
async def test_expired_otp_and_ambiguous_customer_cannot_link(env,monkeypatch):
    client,maker,_,_=env
    async with maker() as db:
        guest=await crm.resolve(db,'+77001239999','Ambiguous',business_id=crm.DAM);guest.state='REVIEW';gid=guest.id
        db.add(User(id='review-user',name='Client',phone=guest.phone,is_active=True,status='active',role='user'))
        proof=PhoneVerification(phone=guest.phone,code_hash=account_v2._hash_sms_code(guest.phone,'123456'),expires_at=L.now()-timedelta(seconds=1),is_verified=False,attempts=0)
        db.add(proof);await db.commit()
    async def current(db,auth): return await db.get(User,'review-user')
    monkeypatch.setattr(account_v2,'resolve_account_user',current)
    assert (await client.post('/api/v1/account/phone/confirm',json={'code':'123456'})).status_code==400
    async with maker() as db:
        db.add(PhoneVerification(phone=guest.phone,code_hash=account_v2._hash_sms_code(guest.phone,'123456'),expires_at=L.now()+timedelta(minutes=5),is_verified=False,attempts=0));await db.commit()
    assert (await client.post('/api/v1/account/phone/confirm',json={'code':'123456'})).status_code==409
    async with maker() as db:
        assert (await db.get(Customer,gid)).user_id is None
        assert (await db.get(User,'review-user')).phone_verified_at is None
