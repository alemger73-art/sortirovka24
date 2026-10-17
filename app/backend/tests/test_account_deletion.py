"""Real HTTP + SQLite erasure checks; no production DB, SMS or file provider."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import os
import bcrypt
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select, func, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.account_deletion import AccountDeletionRequest
from models.auth import User
from models.user_management import UserSession, UserAction, Order
from models.user_addresses import UserAddress
from models.user_preferences import User_preferences
from models.announcements import Announcements
from models.crm import Business, Customer, BusinessCustomer
try:
    from models.analytics import AnalyticsEvent, AnalyticsIdentity
except ModuleNotFoundError:
    AnalyticsEvent = AnalyticsIdentity = None
from routers.account_deletion import router
import importlib
import pkgutil
import models


@pytest.fixture
async def context(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-deletion-secret-never-used-in-production")
    for module in pkgutil.iter_modules(models.__path__):
        importlib.import_module(f"models.{module.name}")
    qa_url = os.environ.get("DELETION_PRIVATE_QA_URL")
    if qa_url:
        assert qa_url.rsplit("/",1)[-1].startswith("s24_deletion_qa_")
    engine = create_async_engine(qa_url or "sqlite+aiosqlite:///:memory:")
    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, _):
        if not qa_url:
            connection.execute("PRAGMA foreign_keys=ON")
    async with engine.begin() as connection:
        if qa_url:
            # Only the private local empty-schema clone is allowed here.
            names = (await connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != 'alembic_version'"))).scalars().all()
            await connection.execute(text('TRUNCATE ' + ','.join('"'+n.replace('"','""')+'"' for n in names) + ' CASCADE'))
        else:
            await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = database
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, maker
    await engine.dispose()


async def identity(maker, *, role="user", password=True, old=False):
    uid, jti = str(uuid4()), str(uuid4())
    now = datetime.now(timezone.utc)
    async with maker() as db:
        db.add(User(id=uid, name="Test Owner", phone="+7700" + str(int(uuid4().hex[:8], 16)).zfill(7)[-7:],
                    email=uid + "@example.test", role=role, status="active", is_active=True,
                    password_hash=bcrypt.hashpw(b"DeletionTest123!", bcrypt.gensalt(rounds=4)).decode() if password else None,
                    phone_verified_at=now))
        await db.flush()
        db.add(UserSession(user_id=uid, token_jti=jti, is_active=True, expires_at=now + timedelta(days=1),
                           created_at=now - timedelta(hours=1) if old else now))
        await db.commit()
    token = create_access_token({"sub": uid, "jti": jti, "role": role})
    return uid, {"Authorization": "Bearer " + token}


def completion(**changes):
    result = {"confirmed": True, "related_data_processed": True, "provider_files_processed": True,
              "backups_and_processors_recorded": True,
              "evidence": "Test fixture: related records and provider files reviewed; no real external services.",
              "retained_records": [{"category": "operational_records", "legal_basis": "Test-only retention decision; no real personal data.",
                                     "delete_after": "After test fixture disposal"}]}
    result.update(changes)
    return result


@pytest.mark.asyncio
async def test_auth_confirmation_and_private_status(context):
    client, maker = context
    uid, headers = await identity(maker)
    assert (await client.post("/api/v1/account-deletion/me", json={"confirmed": True})).status_code == 401
    assert (await client.post("/api/v1/account-deletion/me", headers=headers, json={"confirmed": False})).status_code == 422
    assert (await client.post("/api/v1/account-deletion/me", headers=headers, json={"confirmed": True, "password": "wrong"})).status_code == 403
    response = await client.get("/api/v1/account-deletion/me", headers=headers)
    assert response.json() == {"request": None}
    assert response.headers["cache-control"] == "no-store"
    assert (await client.get("/api/v1/account-deletion/admin", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_request_is_durable_idempotent_and_scoped(context):
    client, maker = context
    uid, headers = await identity(maker)
    other, other_headers = await identity(maker)
    async with maker() as db:
        db.add(Business(id="test", name="Test", slug="test"))
        await db.flush()
        db.add(Customer(id="customer", user_id=uid, normalized_phone="77001112233", name="Test Owner"))
        await db.flush()
        db.add(BusinessCustomer(id="member", business_id="test", customer_id="customer", first_source="web", marketing_opt_in=True))
        await db.commit()
    body = {"confirmed": True, "password": "DeletionTest123!"}
    first = await client.post("/api/v1/account-deletion/me", headers=headers, json=body)
    assert first.status_code == 202, first.text
    second = await client.post("/api/v1/account-deletion/me", headers=headers, json=body)
    assert second.json() == first.json()
    assert (await client.get("/api/v1/account-deletion/me", headers=other_headers)).json() == {"request": None}
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(AccountDeletionRequest)) == 1
        assert (await db.get(User, uid)).status == "active"
        assert (await db.get(User, other)).name == "Test Owner"
        assert (await db.get(BusinessCustomer, "member")).marketing_opt_in is False


@pytest.mark.asyncio
async def test_passwordless_requires_fresh_login(context):
    client, maker = context
    _, stale = await identity(maker, password=False, old=True)
    _, fresh = await identity(maker, password=False)
    assert (await client.post("/api/v1/account-deletion/me", headers=stale, json={"confirmed": True})).status_code == 403
    assert (await client.post("/api/v1/account-deletion/me", headers=fresh, json={"confirmed": True})).status_code == 202


@pytest.mark.asyncio
async def test_completion_scrubs_profile_revokes_tokens_and_preserves_other_user(context):
    client, maker = context
    uid, headers = await identity(maker)
    other, _ = await identity(maker)
    _, admin = await identity(maker, role="admin")
    async with maker() as db:
        db.add_all([UserAddress(user_id=uid, address="private address"), UserAddress(user_id=other, address="other address"),
                    User_preferences(user_id=uid, theme="dark"), Announcements(user_id=uid, title="private ad"),
                    UserAction(user_id=uid, action="profile_updated", payload='{"phone":"private"}')])
        await db.commit()
    result = await client.post("/api/v1/account-deletion/me", headers=headers, json={"confirmed": True, "password": "DeletionTest123!"})
    rid = result.json()["request"]["id"]
    assert (await client.post(f"/api/v1/account-deletion/admin/{rid}/complete", headers=headers, json=completion())).status_code == 403
    bad = await client.post(f"/api/v1/account-deletion/admin/{rid}/complete", headers=admin, json=completion(provider_files_processed=False))
    assert bad.status_code == 422
    response = await client.post(f"/api/v1/account-deletion/admin/{rid}/complete", headers=admin, json=completion())
    assert response.status_code == 200, response.text
    assert response.json()["request"]["status"] == "completed"
    assert (await client.get("/api/v1/account-deletion/me", headers=headers)).status_code == 401
    async with maker() as db:
        user = await db.get(User, uid)
        assert user.status == "deleted" and not user.is_active
        assert all(getattr(user, field) is None for field in ["phone", "email", "google_sub", "name", "avatar_url", "password_hash"])
        assert await db.scalar(select(func.count()).select_from(UserSession).where(UserSession.user_id == uid)) == 0
        assert await db.scalar(select(func.count()).select_from(UserAddress).where(UserAddress.user_id == uid)) == 0
        assert await db.scalar(select(func.count()).select_from(Announcements).where(Announcements.user_id == uid)) == 0
        assert (await db.get(User, other)).status == "active"
        assert await db.scalar(select(func.count()).select_from(UserAddress).where(UserAddress.user_id == other)) == 1


@pytest.mark.asyncio
async def test_unfinished_operations_and_missing_retention_block_completion(context):
    client, maker = context
    uid, headers = await identity(maker)
    _, admin = await identity(maker, role="admin")
    async with maker() as db:
        db.add(Order(user_id=uid, status="preparing", order_type="food", amount=500))
        await db.commit()
    rid = (await client.post("/api/v1/account-deletion/me", headers=headers, json={"confirmed": True, "password": "DeletionTest123!"})).json()["request"]["id"]
    response = await client.post(f"/api/v1/account-deletion/admin/{rid}/complete", headers=admin, json=completion())
    assert response.status_code == 409
    async with maker() as db:
        row = await db.scalar(select(Order).where(Order.user_id == uid))
        row.status = "done"
        await db.commit()
    response = await client.post(f"/api/v1/account-deletion/admin/{rid}/complete", headers=admin, json=completion(retained_records=[]))
    assert response.status_code == 422
    async with maker() as db:
        assert (await db.get(User, uid)).status == "active"
        assert (await db.get(AccountDeletionRequest, rid)).status == "pending"


@pytest.mark.asyncio
async def test_no_phone_does_not_match_every_legacy_park_order(context):
    from models.park_orders import Park_orders
    from services.account_deletion import review_inventory
    _, maker = context
    uid, _ = await identity(maker, password=False)
    async with maker() as db:
        user = await db.get(User, uid)
        user.phone = None
        user.phone_verified_at = None
        db.add(Park_orders(status="new", customer_phone="+77001112233"))
        await db.commit()
        assert (await review_inventory(db, user))["active_operations"] == {}


@pytest.mark.asyncio
async def test_retention_decision_keeps_legal_receipt_and_erases_crm_and_linked_analytics(context):
    if AnalyticsEvent is None:
        pytest.skip("Optional analytics module is absent from this deployment")
    client, maker = context
    uid, headers = await identity(maker)
    _, admin = await identity(maker, role="admin")
    now = datetime.now(timezone.utc)
    async with maker() as db:
        db.add(Customer(id="customer", user_id=uid, normalized_phone="77001112233", name="Private name", verified_at=now))
        db.add(UserAction(user_id=uid, action="legal_acceptance", payload='{"version":"test"}'))
        db.add(AnalyticsIdentity(session_id="analytics-session", anonymous_id="anonymous", user_id=uid, environment="test"))
        db.add(AnalyticsEvent(id="event", event_name="screen_view", occurred_at=now, session_id="analytics-session",
                              environment="test", release_sha="test", actor_type="user", provenance="client"))
        await db.commit()
    rid = (await client.post("/api/v1/account-deletion/me", headers=headers, json={"confirmed": True, "password": "DeletionTest123!"})).json()["request"]["id"]
    assert (await client.post(f"/api/v1/account-deletion/admin/{rid}/complete", headers=admin, json=completion())).status_code == 422
    decisions = completion()["retained_records"]
    decisions += [{"category": "legal_receipts", "legal_basis": "Test fixture requires the legal receipt to remain.", "delete_after": "After test fixture disposal"}]
    response = await client.post(f"/api/v1/account-deletion/admin/{rid}/complete", headers=admin, json=completion(retained_records=decisions))
    assert response.status_code == 200, response.text
    async with maker() as db:
        customer = await db.get(Customer, "customer")
        assert customer.user_id is None and customer.name == "Deleted customer" and customer.normalized_phone != "77001112233"
        assert await db.scalar(select(func.count()).select_from(AnalyticsEvent)) == 0
        assert await db.scalar(select(func.count()).select_from(AnalyticsIdentity)) == 0
        assert await db.scalar(select(func.count()).select_from(UserAction).where(UserAction.user_id == uid)) == 1


@pytest.mark.asyncio
async def test_revoked_session_and_forged_admin_cannot_use_queue(context):
    client, maker = context
    uid, headers = await identity(maker)
    async with maker() as db:
        session = await db.scalar(select(UserSession).where(UserSession.user_id == uid))
        session.is_active = False
        await db.commit()
    assert (await client.get("/api/v1/account-deletion/me", headers=headers)).status_code == 401
    forged = create_access_token({"sub": "admin:forged", "role": "admin", "username": "forged"})
    assert (await client.get("/api/v1/account-deletion/admin", headers={"Authorization": "Bearer " + forged})).status_code == 401


@pytest.mark.asyncio
async def test_generic_entity_api_cannot_read_or_modify_deletion_queue():
    from middleware.entity_guard import EntityWriteGuardMiddleware
    app = FastAPI()
    app.add_middleware(EntityWriteGuardMiddleware)
    @app.api_route("/api/v1/entities/account_deletion_requests", methods=["GET", "POST", "DELETE"])
    async def must_not_run():
        raise AssertionError("Generic queue access must be blocked")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for method in ("GET", "POST", "DELETE"):
            response = await client.request(method, "/api/v1/entities/account_deletion_requests")
            assert response.status_code == 403
