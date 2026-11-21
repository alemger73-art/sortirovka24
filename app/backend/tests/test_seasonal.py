"""Seasonal decoration settings: public defaults, admin-only edits, input is cleaned."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from services.seasonal import DEFAULTS, clean


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_public_settings_have_every_switch(client: AsyncClient):
    data = (await client.get("/api/v1/seasonal")).json()
    assert set(DEFAULTS) <= set(data)
    assert data["starts_at"] <= data["ends_at"]


@pytest.mark.asyncio
async def test_admin_update_requires_auth(client: AsyncClient):
    response = await client.put("/api/v1/seasonal/admin", json={"settings": {"enabled": False}})
    assert response.status_code == 401


def test_clean_drops_unknown_keys_and_bad_values():
    out = clean({"enabled": 0, "snow_intensity": 9, "starts_at": "nonsense", "title_ru": "  ", "evil": "<script>"})
    assert out["enabled"] is False and out["snow_intensity"] == 3
    assert out["starts_at"] == DEFAULTS["starts_at"] and out["title_ru"] == DEFAULTS["title_ru"]
    assert "evil" not in out
