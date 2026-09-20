import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.partner_auth import PartnerCredentials
from routers.partner_auth import router
from routers.partner_auth import _verify_password


@pytest.fixture
async def env():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=[PartnerCredentials.__table__],
            )
        )
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def dependency():
        async with maker() as db:
            yield db

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = dependency
    token = create_access_token({"role": "admin", "username": "staging-admin"})
    headers = {"Authorization": f"Bearer {token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, maker, headers
    await engine.dispose()


@pytest.mark.asyncio
async def test_dam_access_defaults_to_owner_and_exposes_role(env):
    client, _, headers = env
    response = await client.post(
        "/api/v1/partner-auth/dam_alem/credentials",
        headers=headers,
        json={
            "email": "owner@example.test",
            "password": "StrongOwnerPassword42",
            "display_name": "Владелец",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["access_role"] == "owner"

    rows = await client.get("/api/v1/partner-auth/dam_alem/credentials", headers=headers)
    assert rows.status_code == 200
    assert rows.json()[0]["access_role"] == "owner"


@pytest.mark.asyncio
async def test_admin_can_fix_legacy_roles_but_cannot_remove_last_owner(env):
    client, maker, headers = env
    async with maker() as db:
        db.add_all(
            [
                PartnerCredentials(
                    id=1,
                    partner_type="dam_alem",
                    email="legacy@example.test",
                    password_hash="unused",
                    access_role=None,
                    is_active=True,
                ),
                PartnerCredentials(
                    id=2,
                    partner_type="dam_alem",
                    email="operator@example.test",
                    password_hash="unused",
                    access_role="operator",
                    is_active=True,
                ),
            ]
        )
        await db.commit()

    last_owner = "/api/v1/partner-auth/dam_alem/credentials/1"
    assert (await client.patch(last_owner, headers=headers, json={"access_role": "operator"})).status_code == 409
    assert (await client.patch(last_owner, headers=headers, json={"is_active": False})).status_code == 409

    promoted = await client.patch(
        "/api/v1/partner-auth/dam_alem/credentials/2",
        headers=headers,
        json={"access_role": "owner"},
    )
    assert promoted.status_code == 200, promoted.text
    changed = await client.patch(last_owner, headers=headers, json={"access_role": "operator"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["access_role"] == "operator"


@pytest.mark.asyncio
async def test_admin_resets_password_and_deletes_access_but_keeps_last_owner(env):
    client, maker, headers = env
    async with maker() as db:
        db.add_all([
            PartnerCredentials(id=1, partner_type="dam_alem", email="owner@example.test", password_hash="old", access_role="owner", is_active=True),
            PartnerCredentials(id=2, partner_type="dam_alem", email="worker@example.test", password_hash="old", access_role="operator", is_active=True),
        ])
        await db.commit()
    reset = await client.patch("/api/v1/partner-auth/dam_alem/credentials/2", headers=headers, json={"password": "NewSecurePassword42", "access_role": "operator"})
    assert reset.status_code == 200, reset.text
    async with maker() as db:
        worker = await db.get(PartnerCredentials, 2)
        assert _verify_password("NewSecurePassword42", worker.password_hash)
    deleted = await client.delete("/api/v1/partner-auth/dam_alem/credentials/2", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert (await client.delete("/api/v1/partner-auth/dam_alem/credentials/1", headers=headers)).status_code == 409
