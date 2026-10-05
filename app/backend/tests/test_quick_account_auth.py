"""Authentication regression tests with an isolated in-memory DB and no SMS."""
import os
import unittest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from routers import account_v2 as account
from models.auth import User, OIDCState
from models.user_management import PhoneVerification, UserSession, UserAction
from services.sms import SMSDeliveryResult


class QuickAccountAuthTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine('sqlite+aiosqlite:///:memory:')
        async with self.engine.begin() as connection:
            for model in [User, OIDCState, PhoneVerification, UserSession, UserAction]:
                await connection.run_sync(model.__table__.create)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async def database():
            async with self.sessions() as db:
                yield db
        app = FastAPI(); app.include_router(account.router)
        app.dependency_overrides[account.get_db] = database
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url='http://test')
        self.codes = {}
        async def send(phone, code):
            self.codes[phone] = code
            return SMSDeliveryResult(delivered=True, pending_moderation=False)
        self.patches = [patch.object(account, 'send_verification_code', send),
            patch.object(account, '_maybe_promote_master_role', AsyncMock()),
            patch('services.crm.lock', AsyncMock()), patch('services.crm.for_account', AsyncMock()),
            patch.dict(os.environ, {'JWT_SECRET_KEY':'test-only-quick-auth-secret', 'ENVIRONMENT':'production'})]
        for p in self.patches: p.start()
        from utils.rate_limit import _RATE_BUCKETS
        _RATE_BUCKETS.clear()
    async def asyncTearDown(self):
        await self.client.aclose(); await self.engine.dispose()
        for p in reversed(self.patches): p.stop()

    async def request_code(self, phone='+77001234567', path='signin'):
        r = await self.client.post(f'/api/v1/account/{path}/request-sms', json={'phone':phone})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(r.json().get('debug_code'))
        return self.codes[phone]
    async def confirm(self, code, phone='+77001234567', accepted=True):
        return await self.client.post('/api/v1/account/signin/confirm',json={'phone':phone,'code':code,'agreement_accepted':accepted,'privacy_accepted':accepted})

    async def test_passwordless_registration_and_code_replay(self):
        code = await self.request_code()
        result = await self.confirm(code)
        self.assertEqual(result.status_code, 200, result.text)
        async with self.sessions() as db:
            user = await db.get(User, result.json()['user_id'])
            self.assertIsNone(user.password_hash); self.assertIsNotNone(user.phone_verified_at)
        self.assertEqual((await self.confirm(code)).status_code, 400)

    async def test_existing_account_preserves_identity_password_and_bonus(self):
        async with self.sessions() as db:
            db.add(User(id='old', phone='+77001234567', name='Existing', password_hash='original', bonus_balance=375, role='user', status='active', is_active=True))
            await db.commit()
        result = await self.confirm(await self.request_code(), accepted=False)
        self.assertEqual(result.status_code, 200, result.text); self.assertEqual(result.json()['user_id'], 'old')
        async with self.sessions() as db:
            user = await db.get(User, 'old'); self.assertEqual(user.password_hash,'original'); self.assertEqual(user.bonus_balance,375)

    async def test_consent_required_for_new_account(self):
        code = await self.request_code()
        self.assertEqual((await self.confirm(code, accepted=False)).status_code,400)
        self.assertEqual((await self.confirm(code)).status_code,200)

    async def test_wrong_code_and_cross_purpose_code_rejected(self):
        code = await self.request_code()
        wrong = '000000' if code != '000000' else '111111'
        self.assertEqual((await self.confirm(wrong)).status_code,400)
        async with self.sessions() as db:
            with self.assertRaises(Exception):
                await account._consume_phone_code(db, '+77001234567', code)
        self.assertEqual((await self.confirm(code)).status_code,200)

    async def test_legacy_verification_cannot_sign_in(self):
        code = await self.request_code(path='register')
        self.assertEqual((await self.confirm(code)).status_code,400)

    async def test_staff_and_blocked_account_cannot_use_sms_signin(self):
        for role, status, phone in [('admin','active','+77001234568'),('user','blocked','+77001234569')]:
            async with self.sessions() as db:
                db.add(User(id=phone, phone=phone, role=role, status=status, is_active=True)); await db.commit()
            result = await self.confirm(await self.request_code(phone),phone)
            self.assertEqual(result.status_code,403)

    async def test_google_email_does_not_silently_merge_accounts(self):
        async with self.sessions() as db:
            db.add(User(id='old',email='owner@example.com'));await db.commit()
            with self.assertRaises(account.GoogleOAuthError):
                await account._get_or_create_google_user(db,google_sub='new',email='owner@example.com',name='Owner',avatar=None,agreements_accepted=True)
            self.assertIsNone((await db.get(User,'old')).google_sub)

    async def test_google_registration_needs_consent(self):
        async with self.sessions() as db:
            with self.assertRaises(account.GoogleOAuthError):
                await account._get_or_create_google_user(db,google_sub='new',email=None,name='Owner',avatar=None)

    async def test_google_callback_consent_and_single_use_state(self):
        with patch.object(account,'google_oauth_enabled',return_value=True), patch.object(account,'exchange_google_code',AsyncMock(return_value={'access_token':'test'})), patch.object(account,'fetch_google_userinfo',AsyncMock(return_value={'sub':'google-owner','email':'google@example.com','email_verified':True})), patch.object(account,'build_google_authorization_url',return_value='https://accounts.google.com/test'):
            await self.client.get('/api/v1/account/google/start?agreement_accepted=true&privacy_accepted=true')
            async with self.sessions() as db:
                state=(await db.execute(select(OIDCState))).scalar_one().state
            r=await self.client.get('/api/v1/account/google/callback',params={'state':state,'code':'test'})
            self.assertIn('#token=',r.headers['location'])
            repeat=await self.client.get('/api/v1/account/google/callback',params={'state':state,'code':'test'})
            self.assertIn('?error=',repeat.headers['location'])
            async with self.sessions() as db:
                user=(await db.execute(select(User).where(User.google_sub=='google-owner'))).scalar_one()
                self.assertIsNone(user.phone);self.assertIsNone(user.password_hash)

    async def test_attach_phone_after_google_and_preserve_account(self):
        async with self.sessions() as db:
            user=User(id='google-account',google_sub='google-owner',name='Google Owner',role='user',status='active',is_active=True)
            db.add(user);await db.commit()
            from starlette.requests import Request
            session=await account._issue_account_session(user,Request({'type':'http','headers':[],'client':('127.0.0.1',0)}),db)
        headers={'Authorization':f'Bearer {session.token}'}
        phone='+77001234567'
        r=await self.client.post('/api/v1/account/phone/link/request-sms',json={'phone':phone},headers=headers)
        self.assertEqual(r.status_code,200,r.text)
        r=await self.client.post('/api/v1/account/phone/link/confirm',json={'phone':phone,'code':self.codes[phone]},headers=headers)
        self.assertEqual(r.status_code,200,r.text)
        async with self.sessions() as db:
            user=await db.get(User,'google-account');self.assertEqual(user.phone,phone);self.assertIsNotNone(user.phone_verified_at)
        result = await self.confirm(await self.request_code(phone), phone, accepted=False)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['user_id'], 'google-account')
        async with self.sessions() as db:
            google_user, _ = await account._get_or_create_google_user(db, google_sub='google-owner', email=None, name='Owner', avatar=None)
            self.assertEqual(google_user.id, result.json()['user_id'])
        self.assertEqual((await self.client.post('/api/v1/account/phone/link/request-sms',json={'phone':'+77001234568'},headers=headers)).status_code,409)


    async def test_occupied_phone_cannot_be_attached_to_google_account(self):
        from starlette.requests import Request
        async with self.sessions() as db:
            google = User(id='google-new', google_sub='google-sub', role='user', status='active', is_active=True)
            phone = User(id='phone-existing', phone='+77001234567', bonus_balance=375, role='user', status='active', is_active=True)
            db.add_all([google, phone]); await db.commit()
            session = await account._issue_account_session(google, Request({'type':'http','headers':[],'client':('127.0.0.1',0)}), db)
        headers = {'Authorization':f'Bearer {session.token}'}
        result = await self.client.post('/api/v1/account/phone/link/request-sms', json={'phone':phone.phone}, headers=headers)
        self.assertEqual(result.status_code,409)
        self.assertEqual(self.codes,{})
        async with self.sessions() as db:
            self.assertIsNone((await db.get(User,'google-new')).phone)
            self.assertEqual((await db.get(User,'phone-existing')).bonus_balance,375)

class PhoneInputNormalizationTests(unittest.TestCase):
    def test_phone_formats_share_identity(self):
        from utils.phone import normalize_phone
        for value in ['7001234567','87001234567','77001234567','+7 (700) 123-45-67','8 (700) 123-45-67']:
            self.assertEqual(normalize_phone(value),'+77001234567',value)

if __name__ == '__main__': unittest.main()
