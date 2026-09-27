import unittest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient,ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from sqlalchemy import select,func
from core.database import Base,get_db
from core.auth import create_access_token
from models.partner_auth import PartnerCredentials
from models.food_shifts import FoodShift,FoodStaffAction
from routers.dam_workstation import router
from routers.food_business import router as business
from utils.courier_pin import hash_courier_pin

class WorkstationTest(unittest.IsolatedAsyncioTestCase):
 async def test_authorization_pin_and_idempotent_shift(self):
  with patch('core.auth._get_jwt_secret_key',return_value='workstation-test-only-secret'):
   engine=create_async_engine('sqlite+aiosqlite:///:memory:')
   async with engine.begin() as c: await c.run_sync(lambda x:Base.metadata.create_all(x,tables=[m.__table__ for m in [PartnerCredentials,FoodShift,FoodStaffAction]]))
   maker=async_sessionmaker(engine,expire_on_commit=False)
   async with maker() as s:
    s.add_all([PartnerCredentials(id=1,partner_type='dam_alem',email='owner',password_hash='test-hash',access_role='owner',is_active=True),PartnerCredentials(id=2,partner_type='dam_alem',email='operator',display_name='Operator',password_hash='test-hash',pin_hash=hash_courier_pin('5938'),access_role='operator',is_active=True)])
    await s.commit()
   async def db():
    async with maker() as s:yield s
   app=FastAPI();app.include_router(router);app.include_router(business);app.dependency_overrides[get_db]=db
   def h(id):return {'Authorization':'Bearer '+create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':id})}
   async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
    root='/api/v1/dam-alem/workstation'
    self.assertEqual((await c.post(root+'/authorize',headers=h(2))).status_code,403)
    r=await c.post(root+'/authorize',headers=h(1));self.assertEqual(r.status_code,200,r.text)
    device={'Authorization':'Bearer '+r.json()['device_token']}
    self.assertEqual((await c.get('/api/v1/dam-alem/business/staff',headers=device)).status_code,403)
    self.assertEqual((await c.post(root+'/enter',json={'pin':'5938'})).status_code,401)
    self.assertEqual((await c.post(root+'/enter',json={'pin':'0000'},headers=device)).status_code,403)
    first=await c.post(root+'/enter',json={'pin':'5938'},headers=device);self.assertEqual(first.status_code,200,first.text)
    second=await c.post(root+'/enter',json={'pin':'5938'},headers=device);self.assertEqual(second.json()['shift']['id'],first.json()['shift']['id']);self.assertTrue(second.json()['resumed'])
    self.assertEqual((await c.get('/api/v1/dam-alem/business/staff',headers={'Authorization':'Bearer '+first.json()['token']})).status_code,403)
    async with maker() as s:
     self.assertEqual(await s.scalar(select(func.count()).select_from(FoodShift)),1)
     owner=await s.get(PartnerCredentials,1);owner.password_hash='changed';await s.commit()
    self.assertEqual((await c.post(root+'/enter',json={'pin':'5938'},headers=device)).status_code,401)
   await engine.dispose()
