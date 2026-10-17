import json
import pytest
from sqlalchemy import select,func
from core.database import db_manager
from models.business_partner_requests import Business_partner_requests
from models.user_management import UserAction
from pytest_asyncio import fixture

@fixture
async def isolated_full_app_client(monkeypatch):
    from fastapi import FastAPI
    from httpx import AsyncClient,ASGITransport
    from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
    from core.database import Base,get_db
    from routers.business_partner import router
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(lambda connection: Base.metadata.create_all(connection,tables=[Business_partner_requests.__table__,UserAction.__table__]))
    maker=async_sessionmaker(engine,expire_on_commit=False)
    monkeypatch.setattr(db_manager,'async_session_maker',maker)
    async def database():
        async with maker() as db: yield db
    app=FastAPI();app.include_router(router);app.dependency_overrides[get_db]=database
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client: yield client
    await engine.dispose()

BASE={'name':'Проверочная мастерская','phone':'+77009998877','whatsapp':'+77009998877','activity':'Ремонт техники','contact_name':'Проверка','coverage':'Выезжаем в район','website':'https://example.com','description':'Тест формы','consent':True}

@pytest.mark.asyncio
async def test_consent_and_fields_required_without_creating_lead(isolated_full_app_client):
    client=isolated_full_app_client
    for payload in [{k:v for k,v in BASE.items() if k!='consent'},{**BASE,'consent':False},{**BASE,'name':'  '},{**BASE,'website':'javascript:alert(1)'},{**BASE,'whatsapp':'bad'}]:
        response=await client.post('/api/v1/business/apply',json=payload)
        assert response.status_code in (400,422),response.text
    async with db_manager.async_session_maker() as db:
        assert await db.scalar(select(func.count()).select_from(Business_partner_requests))==0

@pytest.mark.asyncio
async def test_application_persists_contacts_and_consent(isolated_full_app_client,monkeypatch):
    from routers import business_partner
    from services import admin_alerts
    async def no_message(*args,**kwargs): pass
    monkeypatch.setattr(business_partner,'notify_new_business_partner',no_message)
    monkeypatch.setattr(admin_alerts,'alert_new_business_partner',no_message)
    response=await isolated_full_app_client.post('/api/v1/business/apply',json=BASE)
    assert response.status_code==200,response.text
    identifier=response.json()['id']
    async with db_manager.async_session_maker() as db:
        row=await db.get(Business_partner_requests,identifier)
        assert row.whatsapp==BASE['whatsapp'] and row.status=='new'
        assert BASE['contact_name'] in row.description and BASE['coverage'] in row.description and BASE['website'] in row.description
        action=await db.scalar(select(UserAction).where(UserAction.entity_id==str(identifier),UserAction.action=='partner_lead_created'))
        proof=json.loads(action.payload)['consent']
        assert proof['accepted'] is True and proof['version']=='business-partnership-20261010' and proof['at']==row.created_at
