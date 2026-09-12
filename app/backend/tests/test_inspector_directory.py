import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from routers.inspector_directory import router, InspectorDirectory, get_db, require_panel_admin
from models.module_settings import ModuleSettings

@pytest.mark.asyncio
async def test_directory_public_read_admin_write_and_conflict():
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        for table in [InspectorDirectory.__table__,ModuleSettings.__table__]:
            await conn.run_sync(table.create)
    app=FastAPI(); app.include_router(router)
    async def db():
        async with AsyncSession(engine) as session: yield session
    app.dependency_overrides[get_db]=db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        first=await client.get('/api/v1/inspector-directory')
        assert first.status_code==200
        data=first.json()
        assert data['duty_phone']=='' and data['department_name']=='' and data['revision']==0
        assert (await client.put('/api/v1/inspector-directory',json=data)).status_code==401
        app.dependency_overrides[require_panel_admin]=lambda:{'role':'admin','username':'test'}
        invalid={**data,'map_url':'javascript:alert(1)'}
        assert (await client.put('/api/v1/inspector-directory',json=invalid)).status_code==422
        saved=await client.put('/api/v1/inspector-directory',json={**data,'department_name':'Тестовый отдел','duty_phone':'+7 (7212) 12-34-56'})
        assert saved.status_code==200 and saved.json()['revision']==1
        assert (await client.put('/api/v1/inspector-directory',json=data)).status_code==409
        second=await client.put('/api/v1/inspector-directory',json={**saved.json(),'notice':'Приём по записи'})
        assert second.status_code==200 and second.json()['revision']==2
        assert (await client.put('/api/v1/inspector-directory',json=saved.json())).status_code==409
        final=(await client.get('/api/v1/inspector-directory')).json()
        assert final['notice']=='Приём по записи' and final['department_name']=='Тестовый отдел'
    await engine.dispose()


@pytest.mark.asyncio
async def test_inspector_coverage_and_photo_validation_roundtrip():
    import json
    from pydantic import ValidationError
    from models.inspectors import Inspectors
    from services.inspectors import InspectorsService
    from routers.inspectors import InspectorsData, InspectorsUpdateData, InspectorsResponse
    with pytest.raises(ValidationError):
        InspectorsData(full_name='Тестовый инспектор')
    with pytest.raises(ValidationError):
        InspectorsUpdateData(photo_url='')
    with pytest.raises(ValidationError):
        InspectorsUpdateData(coverage='not-json')
    coverage=json.dumps([{'street':'Абая','houses':'2–40 (четные)'}],ensure_ascii=False)
    data=InspectorsData(full_name='Тестовый инспектор',photo_url='inspectors/test.jpg',coverage=coverage)
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Inspectors.__table__.create)
    async with AsyncSession(engine) as db:
        service=InspectorsService(db)
        created=await service.create(data.model_dump(exclude_unset=True))
        fetched=await service.get_by_id(created.id)
        response=InspectorsResponse.model_validate(fetched)
        assert json.loads(response.coverage)[0]['houses']=='2–40 (четные)'
        update=InspectorsUpdateData(coverage='[{"street":"Абая","houses":"Все дома"}]')
        updated=await service.update(created.id,update.model_dump(exclude_unset=True))
        assert updated.photo_url=='inspectors/test.jpg'
        assert json.loads(updated.coverage)[0]['houses']=='Все дома'
    await engine.dispose()
