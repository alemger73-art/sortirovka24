import unittest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient,ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from core.database import Base,get_db
from core.auth import create_access_token
from models.partner_auth import PartnerCredentials,PartnerLoginAttempt
from models.food_shifts import FoodShift,FoodStaffAction
from routers.food_business import router
from routers.partner_auth import router as auth_router

class StaffAccessTest(unittest.IsolatedAsyncioTestCase):
 async def test_create_edit_login_and_permissions(self):
  with patch('core.auth._get_jwt_secret_key',return_value='local-staff-access-test-secret'):
   engine=create_async_engine('sqlite+aiosqlite:///:memory:')
   async with engine.begin() as c: await c.run_sync(lambda x:Base.metadata.create_all(x,tables=[m.__table__ for m in [PartnerCredentials,PartnerLoginAttempt,FoodShift,FoodStaffAction]]))
   maker=async_sessionmaker(engine,expire_on_commit=False)
   async def db():
    async with maker() as s: yield s
   app=FastAPI();app.include_router(router);app.include_router(auth_router);app.dependency_overrides[get_db]=db
   headers={'Authorization':'Bearer '+create_access_token({'role':'admin','username':'test'})}
   async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
    path='/api/v1/dam-alem/business/staff'
    body={'name':'Operator Test','email':'operator1','password':'LocalTesting-Password1','pin':'5837','role':'operator'}
    r=await c.post(path,json=body,headers=headers);self.assertEqual(r.status_code,200,r.text);id=r.json()['id']
    self.assertEqual((await c.post(path,json=body,headers=headers)).status_code,409)
    self.assertEqual((await c.patch(f'{path}/{id}',json={'email':'12345'},headers=headers)).status_code,422)
    r=await c.patch(f'{path}/{id}',json={'email':'operator2','password':'LocalTesting-Password2'},headers=headers);self.assertEqual(r.status_code,200,r.text)
    async def login(name,password):return await c.post('/api/v1/partner-auth/dam_alem/login',json={'login':name,'password':password})
    self.assertFalse((await login('operator1',body['password'])).json()['success'])
    r=await login('operator2','LocalTesting-Password2');self.assertTrue(r.json()['success'],r.text)
    operator={'Authorization':'Bearer '+r.json()['jwt_token']}
    self.assertEqual((await c.get(path,headers=operator)).status_code,403)
    self.assertEqual((await c.patch(f'{path}/{id}',json={'role':'owner'},headers=operator)).status_code,403)
    rows=(await c.get(path,headers=headers)).json();self.assertEqual(rows[0]['email'],'operator2')
    await c.patch(f'{path}/{id}',json={'active':False},headers=headers)
    self.assertFalse((await login('operator2','LocalTesting-Password2')).json()['success'])
   await engine.dispose()
