"""Tests for master/partner cabinet access control."""

from __future__ import annotations

import random

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
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


async def _register(client: AsyncClient) -> tuple[str, str]:
    phone = f"+7{random.randint(10_000_000, 99_999_999)}"
    password = "TestPass123!"
    sms = await client.post("/api/v1/account/register/request-sms", json={"phone": phone})
    code = sms.json()["debug_code"]
    reg = await client.post(
        "/api/v1/account/register/confirm",
        json={
            "name": "Role Test",
            "phone": phone,
            "password": password,
            "language": "ru",
            "agreement_accepted": True,
            "privacy_accepted": True,
            "sms_code": code,
        },
    )
    return reg.json()["token"], reg.json()["user_id"]


@pytest.mark.asyncio
async def test_master_cabinet_forbidden_for_regular_user(client: AsyncClient):
    token, _uid = await _register(client)
    resp = await client.get(
        "/api/v1/account/master/cabinet",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_partner_cabinet_forbidden_for_regular_user(client: AsyncClient):
    token, _uid = await _register(client)
    resp = await client.get(
        "/api/v1/account/partner/cabinet",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
