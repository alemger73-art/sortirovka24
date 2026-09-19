import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base
from models.auth import User
from models.module_settings import ModuleSettings
from models.user_notifications import UserNotification
from services.cabinet_modules import availability, source_visible
from services.user_notifications import list_user_notifications, unread_notification_count
from services.logistics_courier import (submit_courier_application, approve_courier_application,
    reject_courier_application, courier_access_info, assert_courier_cabinet_access)
from routers.account_v2 import _to_user_response
from routers.logistics import CourierApplyRequest
from pydantic import ValidationError


@pytest.fixture
async def session():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
    await engine.dispose()


@pytest.mark.asyncio
async def test_disabled_history_notifications_and_unread_restore(session):
    db = session
    flag = ModuleSettings(key='gastronom', value='false')
    db.add(flag)
    db.add_all([
        UserNotification(user_id='u', category='store', entity_type='gastronom_orders', title='Old order', event_key='1', is_read=False),
        UserNotification(user_id='u', category='food', title='Food order', event_key='2', is_read=False),
        UserNotification(user_id='other', category='food', title='Private', event_key='3', is_read=False),
    ])
    await db.commit()
    assert not source_visible('gastronom', await availability(db))
    assert len(await list_user_notifications(db, 'u')) == 1
    assert await unread_notification_count(db, 'u') == 1
    flag.value = 'true'
    await db.commit()
    assert source_visible('gastronom', await availability(db))
    assert len(await list_user_notifications(db, 'u')) == 2
    assert await unread_notification_count(db, 'u') == 2


@pytest.mark.asyncio
async def test_courier_rejection_resubmission_approval_and_profile(session):
    db = session
    user = User(id='u', name='Tester', phone='+77001234567', role='user', status='active', language='ru', bonus_balance=0)
    db.add(user)
    await db.commit()
    body = dict(full_name='Tester', phone=user.phone, vehicle_type='foot', photo_url='/photo', id_photo_url='/id')
    with pytest.raises(HTTPException):
        await assert_courier_cabinet_access(db, user)
    app = await submit_courier_application(db, user, **body)
    assert app.status == 'pending'
    with pytest.raises(ValueError, match='рассмотрении'):
        await submit_courier_application(db, user, **body)
    await reject_courier_application(db, user.id, 'Документ нечитаемый')
    assert (await courier_access_info(db, user))['status'] == 'rejected'
    assert not (await courier_access_info(db, user))['can_access_cabinet']
    await submit_courier_application(db, user, **body)
    await approve_courier_application(db, user.id)
    assert user.role == 'courier'
    assert _to_user_response(user).role == 'courier'
    assert (await courier_access_info(db, user))['can_access_cabinet']
    with pytest.raises(ValueError):
        await submit_courier_application(db, user, **body)
    with pytest.raises(ValueError, match='обработана'):
        await reject_courier_application(db, user.id)
    assert (await assert_courier_cabinet_access(db, user)).is_verified


def test_application_rejects_injected_permissions():
    with pytest.raises(ValidationError):
        CourierApplyRequest(full_name='Test', role='courier', status='approved', is_verified=True)


@pytest.mark.asyncio
async def test_courier_api_cannot_self_approve(session):
    from fastapi import FastAPI
    from httpx import AsyncClient, ASGITransport
    from datetime import datetime, timedelta, timezone
    from core.database import get_db
    from core.auth import create_access_token
    from models.user_management import UserSession
    from routers.logistics import router
    db = session
    db.add(User(id='resident', name='Resident', phone='+77002223344', role='user', status='active'))
    db.add(UserSession(user_id='resident', token_jti='test-jti', is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    await db.commit()
    app = FastAPI()
    app.include_router(router)
    from routers.taxi import router as taxi_router
    app.include_router(taxi_router)
    from models.taxi import TaxiSettings
    db.add(TaxiSettings(key="enabled", value="false"))
    await db.commit()
    async def dependency():
        yield db
    app.dependency_overrides[get_db] = dependency
    token = create_access_token({'sub':'resident', 'jti':'test-jti', 'role':'user'})
    headers = {'Authorization': 'Bearer ' + token}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        assert (await client.get('/api/v1/logistics/admin/applications', headers=headers)).status_code == 403
        assert (await client.post('/api/v1/logistics/admin/applications/resident/approve', headers=headers, json={})).status_code == 403
        assert (await client.post('/api/v1/logistics/admin/applications/resident/reject', headers=headers, json={})).status_code == 403
        assert (await client.get('/api/v1/logistics/courier/cabinet', headers=headers)).status_code == 403
        assert (await client.post('/api/v1/logistics/courier/application', headers=headers, json={'full_name':'Resident','role':'courier'})).status_code == 422

        assert (await client.get('/api/v1/taxi/rides/my', headers=headers)).status_code == 404
        user = await db.get(User, 'resident')
        user.status = 'blocked'
        await db.commit()
        assert (await client.get('/api/v1/logistics/courier/access', headers=headers)).status_code == 403
