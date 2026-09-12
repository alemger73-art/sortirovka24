import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from models.directory_entries import Directory_entries
from models.module_settings import ModuleSettings
from routers.directory_entries import router, get_db, require_panel_admin, directory_admin

@pytest.mark.asyncio
async def test_directory_drafts_validation_and_public_roundtrip():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        for table in [Directory_entries.__table__, ModuleSettings.__table__]:
            await conn.run_sync(table.create)
    async with AsyncSession(engine) as session:
        session.add(Directory_entries(entry_name=None, category='Legacy', phone='1414'))
        await session.commit()
    app = FastAPI(); app.include_router(router)
    async def db():
        async with AsyncSession(engine) as session: yield session
    app.dependency_overrides[get_db] = db
    base = '/api/v1/entities/directory_entries'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        assert (await client.post(base, json={'entry_name':'Test', 'category':'Other'})).status_code == 401
        app.dependency_overrides[require_panel_admin] = lambda: {'role':'admin','username':'test'}
        assert (await client.post(base, json={'entry_name':'Test','category':'Other','website':'javascript:alert(1)'})).status_code == 422
        assert (await client.post(base, json={'entry_name':'Test','category':'Other','is_published':True})).status_code == 422
        created = await client.post(base, json={'entry_name':'Test','category':'Other','phone':'+7 (7212) 11-22-33','is_published':False})
        assert created.status_code == 201, created.text
        identifier = created.json()['id']
        assert (await client.get(base)).json()['total'] == 0
        assert (await client.get(base+'/all')).json()['total'] == 0
        assert (await client.get(f'{base}/{identifier}')).status_code == 404
        app.dependency_overrides[directory_admin] = lambda: True
        assert (await client.get(base)).json()['total'] == 2
        patch = {'is_published':True,'source_url':'https://example.org/contact','verified_at':'2026-09-12','opening_hours':'Weekdays','map_url':'https://example.org/map','whatsapp':'+77011112233'}
        result = await client.put(f'{base}/{identifier}', json=patch)
        assert result.status_code == 200, result.text
        app.dependency_overrides[directory_admin] = lambda: False
        assert (await client.get(base)).json()['items'][0]['opening_hours'] == 'Weekdays'
        assert (await client.get(f'{base}/{identifier}')).json()['source_url'] == patch['source_url']
        assert (await client.put(f'{base}/{identifier}', json={'source_url':''})).status_code == 422
        assert (await client.put(f'{base}/{identifier}', json={'verified_at':'2099-01-01'})).status_code == 422
        assert (await client.put(f'{base}/{identifier}', json={'is_published':False})).status_code == 200
        assert (await client.get(base)).json()['total'] == 0
    await engine.dispose()
