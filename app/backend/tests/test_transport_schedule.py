import json
import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from pydantic import ValidationError
from core.transport_validation import Journey, DaySchedule
from models.bus_routes import Bus_routes
from models.module_settings import ModuleSettings
from routers.bus_routes import router, get_db, transport_admin, require_panel_admin

def test_timetable_rejects_invented_or_ambiguous_times():
    for data in [{'times':'25:00'}, {'times':'06:10, 06:10'}, {'times':'06:10','interval':'10 minutes'}, {'first':'06:00'}, {'not_running':True,'times':'06:00'}]:
        with pytest.raises(ValidationError): DaySchedule(**data)
    assert DaySchedule(first='23:00',last='01:30').last == '01:30'
    assert Journey().inbound.stops == []
    with pytest.raises(ValidationError): Journey.model_validate({'outbound':{'stops':[],'weekday':{'times':'06:00'}}})

@pytest.mark.asyncio
async def test_transport_publication_directions_and_legacy_preservation():
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as connection:
        for table in [Bus_routes.__table__,ModuleSettings.__table__]: await connection.run_sync(table.create)
    async with AsyncSession(engine) as session:
        session.add(Bus_routes(route_number='27',route_name='Legacy demo',is_active=True));await session.commit()
    app=FastAPI();app.include_router(router)
    async def db():
        async with AsyncSession(engine) as session: yield session
    app.dependency_overrides[get_db]=db
    base='/api/v1/entities/bus_routes'
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.get(base)).json()['total']==0
        assert (await client.get(base+'/1')).status_code==404
        assert (await client.post(base,json={'route_number':'T1','route_name':'Test'})).status_code==401
        app.dependency_overrides[require_panel_admin]=lambda:{'role':'admin','username':'test'}
        app.dependency_overrides[transport_admin]=lambda:True
        assert (await client.get(base)).json()['total']==1
        created=await client.post(base,json={'route_number':'T1','route_name':'Test','is_active':False})
        assert created.status_code==201,created.text
        identifier=created.json()['id']
        assert (await client.put(f'{base}/{identifier}',json={'is_active':True})).status_code==422
        journey={'outbound':{'stops':['Test A','Test B'],'weekday':{'times':'06:10, 06:40'}},'inbound':{'stops':['Test B','Test C','Test A'],'sunday':{'not_running':True}}}
        payload={'is_active':True,'journey_json':json.dumps(journey),'source_url':'https://example.org/schedule','verified_at':'2026-09-12'}
        assert (await client.put(f'{base}/{identifier}',json={**payload,'source_url':'javascript:alert(1)'})).status_code==422
        assert (await client.put(f'{base}/{identifier}',json=payload)).status_code==200
        app.dependency_overrides[transport_admin]=lambda:False
        result=(await client.get(base)).json()
        assert result['total']==1
        saved=json.loads(result['items'][0]['journey_json'])
        assert saved['inbound']['stops']==['Test B','Test C','Test A']
        assert saved['outbound']['saturday']['times']==''
        assert saved['inbound']['sunday']['not_running'] is True
        assert (await client.put(f'{base}/{identifier}',json={'source_url':''})).status_code==422
        assert (await client.put(f'{base}/{identifier}',json={'is_active':False})).status_code==200
        assert (await client.get(base)).json()['total']==0
    await engine.dispose()
