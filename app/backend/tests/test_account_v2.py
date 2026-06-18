"""Unit and API tests for account v2 profile (avatar, password, cabinet)."""

from __future__ import annotations

import random
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from services.account_profile import AvatarValidationError, normalize_avatar_url
from services.sms import SMSDeliveryResult


@pytest.fixture
async def client(monkeypatch):
    monkeypatch.setenv("DEBUG", "1")
    monkeypatch.delenv("SMS_PROVIDER", raising=False)

    async def _fake_send(_phone: str, _code: str) -> SMSDeliveryResult:
        return SMSDeliveryResult(delivered=False, pending_moderation=False, provider_message="test")

    monkeypatch.setattr("routers.account_v2.send_verification_code", _fake_send)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def test_normalize_avatar_url_accepts_https():
    url = "https://cdn.example.com/avatars/user.jpg"
    assert normalize_avatar_url(url) == url


def test_normalize_avatar_url_rejects_base64():
    with pytest.raises(AvatarValidationError):
        normalize_avatar_url("data:image/png;base64,abc")


def test_normalize_avatar_url_clear():
    assert normalize_avatar_url("") == ""
    assert normalize_avatar_url("   ") == ""


def test_normalize_avatar_url_none():
    assert normalize_avatar_url(None) is None


async def _register_test_user(client: AsyncClient) -> tuple[str, str]:
    suffix = random.randint(10_000_000, 99_999_999)
    phone = f"+7{suffix}"
    password = "TestPass123!"

    sms = await client.post("/api/v1/account/register/request-sms", json={"phone": phone})
    assert sms.status_code == 200, sms.text
    code = sms.json().get("debug_code")
    assert code, "Expected debug_code in test mode"

    reg = await client.post(
        "/api/v1/account/register/confirm",
        json={
            "name": "Test User",
            "phone": phone,
            "password": password,
            "language": "ru",
            "agreement_accepted": True,
            "privacy_accepted": True,
            "sms_code": code,
        },
    )
    assert reg.status_code == 200, reg.text
    token = reg.json()["token"]
    return token, password


@pytest.mark.asyncio
async def test_profile_update_persists_avatar_and_fields(client: AsyncClient):
    token, _password = await _register_test_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    avatar_url = f"https://cdn.example.com/avatars/{uuid.uuid4()}.webp"

    update = await client.put(
        "/api/v1/account/me",
        headers=headers,
        json={
            "name": "Updated Name",
            "email": "user@example.com",
            "avatar": avatar_url,
            "language": "kz",
        },
    )
    assert update.status_code == 200, update.text
    body = update.json()
    assert body["name"] == "Updated Name"
    assert body["email"] == "user@example.com"
    assert body["avatar"] == avatar_url
    assert body["language"] == "kz"

    me = await client.get("/api/v1/account/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["avatar"] == avatar_url

    cabinet = await client.get("/api/v1/account/cabinet", headers=headers)
    assert cabinet.status_code == 200
    profile = cabinet.json()["profile"]
    assert profile["name"] == "Updated Name"
    assert profile["avatar"] == avatar_url


@pytest.mark.asyncio
async def test_profile_update_rejects_base64_avatar(client: AsyncClient):
    token, _password = await _register_test_user(client)
    headers = {"Authorization": f"Bearer {token}"}

    update = await client.put(
        "/api/v1/account/me",
        headers=headers,
        json={"avatar": "data:image/png;base64,abc"},
    )
    assert update.status_code == 400


@pytest.mark.asyncio
async def test_change_password(client: AsyncClient):
    token, password = await _register_test_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    new_password = "NewSecure99!"

    bad = await client.post(
        "/api/v1/account/me/change-password",
        headers=headers,
        json={"current_password": "wrong", "new_password": new_password},
    )
    assert bad.status_code == 400

    ok = await client.post(
        "/api/v1/account/me/change-password",
        headers=headers,
        json={"current_password": password, "new_password": new_password},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["success"] is True

    phone = (await client.get("/api/v1/account/me", headers=headers)).json()["phone"]

    login_old = await client.post(
        "/api/v1/account/login",
        json={"phone": phone, "password": password},
    )
    assert login_old.status_code == 401

    login_new = await client.post(
        "/api/v1/account/login",
        json={"phone": phone, "password": new_password},
    )
    assert login_new.status_code == 200


@pytest.mark.asyncio
async def test_set_password_rejects_when_password_exists(client: AsyncClient):
    token, _password = await _register_test_user(client)
    headers = {"Authorization": f"Bearer {token}"}

    dup = await client.post(
        "/api/v1/account/me/set-password",
        headers=headers,
        json={"new_password": "AnotherPass99!"},
    )
    assert dup.status_code == 400
    me = await client.get("/api/v1/account/me", headers=headers)
    assert me.json().get("has_password") is True


@pytest.mark.asyncio
async def test_complaint_create_links_user_id(client: AsyncClient):
    token, _password = await _register_test_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    me = await client.get("/api/v1/account/me", headers=headers)
    user_id = me.json()["id"]

    created = await client.post(
        "/api/v1/entities/complaints",
        headers=headers,
        json={
            "category": "Другое",
            "address": "Test street",
            "description": "Integration test complaint",
            "phone": me.json()["phone"],
            "status": "new",
            "created_at": "2026-06-14T00:00:00Z",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json().get("user_id") == user_id

    cabinet = await client.get("/api/v1/account/cabinet", headers=headers)
    ids = [c["id"] for c in cabinet.json().get("complaints", [])]
    assert created.json()["id"] in ids


@pytest.mark.asyncio
async def test_delivery_addresses_crud(client: AsyncClient):
    token, _password = await _register_test_user(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Empty list initially
    empty = await client.get("/api/v1/account/me/addresses", headers=headers)
    assert empty.status_code == 200, empty.text
    assert empty.json() == []

    # First created address becomes default automatically
    created = await client.post(
        "/api/v1/account/me/addresses",
        headers=headers,
        json={"label": "Дом", "address": "ул. Жекибаева 129", "comment": "подъезд 2"},
    )
    assert created.status_code == 201, created.text
    first = created.json()
    assert first["is_default"] is True
    assert first["label"] == "Дом"

    # Second address, explicitly default -> first one loses default
    created2 = await client.post(
        "/api/v1/account/me/addresses",
        headers=headers,
        json={"label": "Работа", "address": "пер. Урановый 10", "is_default": True},
    )
    assert created2.status_code == 201, created2.text
    second = created2.json()
    assert second["is_default"] is True

    listing = (await client.get("/api/v1/account/me/addresses", headers=headers)).json()
    defaults = [a for a in listing if a["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == second["id"]

    # Update + set default back to the first
    updated = await client.put(
        f"/api/v1/account/me/addresses/{first['id']}",
        headers=headers,
        json={"address": "ул. Жекибаева 130", "is_default": True},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["address"] == "ул. Жекибаева 130"
    assert updated.json()["is_default"] is True

    # Address appears in cabinet payload
    cabinet = await client.get("/api/v1/account/cabinet", headers=headers)
    assert cabinet.status_code == 200
    addr_ids = [a["id"] for a in cabinet.json().get("addresses", [])]
    assert first["id"] in addr_ids and second["id"] in addr_ids

    # Delete the default -> remaining one is promoted
    deleted = await client.delete(f"/api/v1/account/me/addresses/{first['id']}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    after = (await client.get("/api/v1/account/me/addresses", headers=headers)).json()
    assert len(after) == 1
    assert after[0]["id"] == second["id"]
    assert after[0]["is_default"] is True


@pytest.mark.asyncio
async def test_clear_avatar(client: AsyncClient):
    token, _password = await _register_test_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    avatar_url = "https://cdn.example.com/avatars/clear-test.jpg"

    await client.put("/api/v1/account/me", headers=headers, json={"avatar": avatar_url})
    cleared = await client.put("/api/v1/account/me", headers=headers, json={"avatar": ""})
    assert cleared.status_code == 200
    assert cleared.json()["avatar"] in (None, "")
