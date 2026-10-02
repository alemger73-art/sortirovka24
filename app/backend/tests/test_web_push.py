from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.auth import User
from models.push_devices import PushDevice
from models.user_management import UserSession
from routers import push_notifications


@pytest.fixture
async def web_push_env(tmp_path):
    # Focused runs must register the same complete model graph as application startup.
    import models, importlib, pkgutil
    for _, name, _ in pkgutil.iter_modules(models.__path__):
        importlib.import_module(f'models.{name}')
    engine = create_async_engine("sqlite+aiosqlite:///" + (tmp_path / "push.db").as_posix())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        for user_id in ("alice", "bob"):
            db.add(User(id=user_id, name=user_id.title(), role="user", status="active", is_active=True))
            db.add(UserSession(
                user_id=user_id,
                token_jti=f"{user_id}-push",
                is_active=True,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            ))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db

    app = FastAPI()
    app.include_router(push_notifications.router)
    app.dependency_overrides[get_db] = database
    headers = {
        user_id: {"Authorization": "Bearer " + create_access_token({
            "sub": user_id, "role": "user", "jti": f"{user_id}-push"
        })}
        for user_id in ("alice", "bob")
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, maker, headers
    await engine.dispose()


async def test_web_subscription_requires_login_and_is_owned(web_push_env):
    client, maker, headers = web_push_env
    subscription = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/device-1",
        "expirationTime": None,
        "keys": {"p256dh": "p" * 32, "auth": "a" * 16},
    }
    assert (await client.post("/api/v1/push/register-web", json={"subscription": subscription})).status_code == 401

    registered = await client.post(
        "/api/v1/push/register-web", headers=headers["alice"], json={"subscription": subscription}
    )
    assert registered.status_code == 200, registered.text

    # A different account cannot unregister Alice's browser endpoint.
    response = await client.post(
        "/api/v1/push/unregister-web",
        headers=headers["bob"],
        json={"endpoint": subscription["endpoint"]},
    )
    assert response.status_code == 200
    async with maker() as db:
        device = await db.scalar(select(PushDevice).where(PushDevice.platform == "web"))
        assert device and device.user_id == "alice" and device.is_active is True

    response = await client.post(
        "/api/v1/push/unregister-web",
        headers=headers["alice"],
        json={"endpoint": subscription["endpoint"]},
    )
    assert response.status_code == 200
    async with maker() as db:
        device = await db.scalar(select(PushDevice).where(PushDevice.platform == "web"))
        assert device and device.is_active is False


async def test_native_token_registration_requires_login(web_push_env):
    client, _, headers = web_push_env
    payload = {"token": "native-device-token-123456", "platform": "android"}
    assert (await client.post("/api/v1/push/register", json=payload)).status_code == 401
    assert (await client.post("/api/v1/push/register", headers=headers["alice"], json=payload)).status_code == 200
    assert (await client.post("/api/v1/push/unregister", headers=headers["bob"], json={"token": payload["token"]})).status_code == 200


@pytest.mark.parametrize('endpoint', [
    'https://example.com/push', 'https://fcm.googleapis.com:8443/push',
    'https://name:secret@fcm.googleapis.com/push', 'https://fcm.googleapis.com.evil.test/push',
])
async def test_web_endpoint_rejects_ssrf(web_push_env, endpoint):
    client, _, headers = web_push_env
    result = await client.post('/api/v1/push/register-web', headers=headers['alice'], json={
        'subscription': {'endpoint': endpoint, 'keys': {'p256dh': 'p'*32, 'auth': 'a'*16}}})
    assert result.status_code == 422


async def test_preferences_are_owned_and_news_opt_in(web_push_env):
    client, maker, headers = web_push_env
    for user in ('alice', 'bob'):
        assert (await client.post('/api/v1/push/register-web', headers=headers[user], json={
            'subscription': {'endpoint': 'https://web.push.apple.com/'+user, 'keys': {'p256dh': 'p'*32, 'auth': 'a'*16}},
            'browser': 'safari', 'device_platform': 'ios'})).status_code == 200
    assert (await client.put('/api/v1/push/preferences', json={'news': True})).status_code == 401
    assert (await client.put('/api/v1/push/preferences', headers=headers['alice'], json={'news': True})).status_code == 200
    async with maker() as db:
        rows = (await db.scalars(select(PushDevice))).all()
        assert {r.user_id:r.preferences['news'] for r in rows} == {'alice': True, 'bob': False}
    from services.push_broadcast import push_category_allowed
    assert not push_category_allowed(None, 'NEWS')
    assert not push_category_allowed(None, 'ADVERTISEMENT')
    assert push_category_allowed(None, 'ORDER')
    assert not push_category_allowed({'orders':False}, 'food')


async def test_diagnostics_and_send_require_admin(web_push_env):
    client, _, headers = web_push_env
    assert (await client.get('/api/v1/push/diagnostics-access')).status_code == 403
    assert (await client.get('/api/v1/push/diagnostics-access', headers=headers['alice'])).status_code == 403
    assert (await client.post('/api/v1/push/broadcast', headers=headers['alice'], json={'title':'test','body':'test','user_id':'bob'})).status_code == 403


async def test_analytics_allowlist_and_external_click_rejected(web_push_env):
    client, _, _ = web_push_env
    assert (await client.post('/api/v1/push/analytics', json={'event':'pwa_standalone_open','platform':'ios','browser':'safari','source':'pwa'})).status_code == 202
    assert (await client.post('/api/v1/push/analytics', json={'event':'arbitrary_secret','platform':'ios','browser':'safari','source':'pwa'})).status_code == 422
    from schemas.push import PushBroadcastRequest
    from pydantic import ValidationError
    for path in ('//evil.test', '/\\evil.test', '/ hello'):
        with pytest.raises(ValidationError):
            PushBroadcastRequest(title='test',body='test',path=path)


async def test_invalid_subscriptions_deactivated(web_push_env, monkeypatch):
    from services import push_broadcast as service
    _, maker, _ = web_push_env
    monkeypatch.setattr(service, 'push_enabled', lambda: True)
    monkeypatch.setattr(service, 'web_push_enabled', lambda: True)
    async def expired(*args, **kwargs): return False, True
    monkeypatch.setattr(service, 'send_web_push_subscription', expired)
    async with maker() as db:
        db.add(PushDevice(id='expired', token='{}', platform='web', user_id='alice', is_active=True))
        await db.commit()
        result = await service.broadcast_push(db, user_id='alice', title='test', body='test')
        assert result['failed'] == 1
        assert not (await db.get(PushDevice,'expired')).is_active


async def test_generic_entity_api_never_exposes_subscription_material(monkeypatch):
    from middleware.entity_guard import EntityWriteGuardMiddleware
    app = FastAPI()
    app.add_middleware(EntityWriteGuardMiddleware)
    @app.get('/api/v1/entities/push_devices')
    async def secret(): return {'token': 'must-not-be-returned'}
    monkeypatch.setenv('ENTITY_WRITE_PROTECTION','off')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get('/api/v1/entities/push_devices')
        assert response.status_code == 403
        assert 'must-not-be-returned' not in response.text
