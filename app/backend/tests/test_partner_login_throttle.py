import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base, get_db
from models.partner_auth import PartnerCredentials, PartnerLoginAttempt
from routers.partner_auth import router


@pytest.mark.asyncio
async def test_login_failures_are_limited_across_database_sessions():
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c,tables=[PartnerCredentials.__table__,PartnerLoginAttempt.__table__]))
    maker=async_sessionmaker(engine)
    app=FastAPI();app.include_router(router)
    async def dependency():
        async with maker() as db: yield db
    app.dependency_overrides[get_db]=dependency
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        for _ in range(10):
            response=await client.post('/api/v1/partner-auth/dam_alem/login',json={'login':'unknown@example.test','password':'bad-password'})
            assert response.status_code==200 and not response.json()['success']
        response=await client.post('/api/v1/partner-auth/dam_alem/login',json={'login':'UNKNOWN@example.test','password':'bad-password'})
        assert response.status_code==429
        assert response.headers['retry-after']=='900'
    await engine.dispose()
