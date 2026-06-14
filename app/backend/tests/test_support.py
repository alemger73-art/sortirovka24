"""Local API tests for support settings (no external server required)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_support_settings_public(client: AsyncClient):
    response = await client.get("/api/v1/support/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["promo_enabled"] is True
    assert data["recipient"]
    assert data["iban"]
    assert data["contact_email"]
    assert "kaspi_qr_url" in data


@pytest.mark.asyncio
async def test_support_admin_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/support/admin/settings")
    assert response.status_code == 401

    response = await client.put(
        "/api/v1/support/admin/settings",
        json={"settings": {"recipient": "Test"}},
    )
    assert response.status_code == 401
