"""Tests for master onboarding, cabinet, and request notifications."""

from __future__ import annotations

import random
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from core.auth import create_access_token
from main import app
from services.sms import SMSDeliveryResult


@pytest.fixture
async def client(monkeypatch):
    monkeypatch.setenv("DEBUG", "1")
    monkeypatch.delenv("SMS_PROVIDER", raising=False)

    async def _fake_send(_phone: str, _code: str) -> SMSDeliveryResult:
        return SMSDeliveryResult(delivered=False, pending_moderation=False, provider_message="test")

    monkeypatch.setattr("routers.account_v2.send_verification_code", _fake_send)
    monkeypatch.setattr("services.push_broadcast.broadcast_push", AsyncMock(return_value=None))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _admin_headers() -> dict[str, str]:
    token = create_access_token({"role": "admin", "username": "pytest-admin"}, expires_minutes=30)
    return {"Authorization": f"Bearer {token}"}


async def _register(client: AsyncClient) -> tuple[str, str]:
    phone = f"+7{random.randint(10_000_000, 99_999_999)}"
    password = "TestPass123!"
    sms = await client.post("/api/v1/account/register/request-sms", json={"phone": phone})
    code = sms.json()["debug_code"]
    reg = await client.post(
        "/api/v1/account/register/confirm",
        json={
            "name": "Master Applicant",
            "phone": phone,
            "password": password,
            "language": "ru",
            "agreement_accepted": True,
            "privacy_accepted": True,
            "sms_code": code,
        },
    )
    return reg.json()["token"], phone


@pytest.mark.asyncio
async def test_become_master_request_visible_in_cabinet(client: AsyncClient):
    token, phone = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/entities/become_master_requests",
        headers=headers,
        json={
            "name": "Master Applicant",
            "category": "Сантехник",
            "phone": phone,
            "whatsapp": phone,
            "district": "Сортировка",
            "description": "Сантехник с 10-летним стажем. Установка, ремонт, замена труб.",
            "status": "pending",
            "created_at": "2026-01-01 12:00:00",
        },
    )
    assert create.status_code == 201, create.text

    cabinet = await client.get("/api/v1/account/cabinet", headers=headers)
    assert cabinet.status_code == 200, cabinet.text
    rows = cabinet.json().get("become_master_requests") or []
    assert any(r["status"] == "pending" and r["category"] == "Сантехник" for r in rows)


@pytest.mark.asyncio
async def test_approve_become_master_promotes_role_and_opens_cabinet(client: AsyncClient):
    token, phone = await _register(client)
    user_headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/entities/become_master_requests",
        headers=user_headers,
        json={
            "name": "Approved Master",
            "category": "Электрик",
            "phone": phone,
            "whatsapp": phone,
            "district": "Сортировка",
            "description": "Электрик с опытом более 8 лет. Монтаж, ремонт, замена проводки.",
            "status": "pending",
            "created_at": "2026-01-01 12:00:00",
        },
    )
    assert create.status_code == 201, create.text
    req_id = create.json()["id"]

    approve = await client.post(
        f"/api/v1/account/admin/masters/approve-become-request/{req_id}",
        headers=_admin_headers(),
    )
    assert approve.status_code == 200, approve.text
    assert approve.json().get("success") is True

    me = await client.get("/api/v1/account/me", headers=user_headers)
    assert me.status_code == 200, me.text
    assert me.json()["role"] == "master"

    cabinet = await client.get("/api/v1/account/master/cabinet", headers=user_headers)
    assert cabinet.status_code == 200, cabinet.text
    assert cabinet.json()["profile"]["listing_id"] is not None
    assert cabinet.json()["profile"]["verified"] is True


@pytest.mark.asyncio
async def test_master_request_create_and_cabinet_visibility(client: AsyncClient, monkeypatch):
    master_token, master_phone = await _register(client)
    admin_headers = _admin_headers()

    master_headers = {"Authorization": f"Bearer {master_token}"}
    create_req = await client.post(
        "/api/v1/entities/become_master_requests",
        headers=master_headers,
        json={
            "name": "Working Master",
            "category": "Сантехник",
            "phone": master_phone,
            "whatsapp": master_phone,
            "district": "Сортировка",
            "description": "Сантехник с большим опытом работы в Сортировке.",
            "status": "pending",
            "created_at": "2026-01-01 12:00:00",
        },
    )
    assert create_req.status_code == 201, create_req.text
    req_id = create_req.json()["id"]
    await client.post(
        f"/api/v1/account/admin/masters/approve-become-request/{req_id}",
        headers=admin_headers,
    )
    cabinet_before = await client.get("/api/v1/account/master/cabinet", headers=master_headers)
    listing_id = cabinet_before.json()["profile"]["listing_id"]

    client_token, client_phone = await _register(client)
    request_create = await client.post(
        "/api/v1/entities/master_requests",
        json={
            "category": "Сантехник",
            "problem_description": "Протекает кран на кухне",
            "address": "ул. Примерная 1",
            "phone": client_phone,
            "client_name": "Client User",
            "master_id": listing_id,
            "status": "new",
            "created_at": "2026-01-02 10:00:00",
        },
    )
    assert request_create.status_code == 201, request_create.text

    cabinet_after = await client.get("/api/v1/account/master/cabinet", headers=master_headers)
    requests = cabinet_after.json().get("requests") or []
    assert any(r["status"] == "new" and "кран" in (r.get("problem_description") or "").lower() for r in requests)

    request_id = request_create.json()["id"]
    status_update = await client.put(
        f"/api/v1/account/master/requests/{request_id}/status",
        headers=master_headers,
        json={"status": "in_progress"},
    )
    assert status_update.status_code == 200, status_update.text
