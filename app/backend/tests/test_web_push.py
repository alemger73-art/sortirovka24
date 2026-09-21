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
