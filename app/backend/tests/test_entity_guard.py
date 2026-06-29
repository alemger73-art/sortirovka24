"""Local API tests for entity write-protection middleware."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from core.auth import create_access_token
from main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _admin_headers() -> dict[str, str]:
    token = create_access_token({"role": "admin", "username": "pytest-admin"}, expires_minutes=30)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_public_can_read_news(client: AsyncClient):
    response = await client.get("/api/v1/entities/news")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_unauthenticated_food_orders_read_blocked(client: AsyncClient):
    response = await client.get("/api/v1/entities/food_orders")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_can_read_food_orders(client: AsyncClient):
    response = await client.get("/api/v1/entities/food_orders", headers=_admin_headers())
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_unauthenticated_entity_delete_blocked(client: AsyncClient):
    response = await client.delete("/api/v1/entities/news/999999")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_entity_update_blocked(client: AsyncClient):
    response = await client.put(
        "/api/v1/entities/food_categories/1",
        json={"name": "blocked"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_batch_create_blocked(client: AsyncClient):
    response = await client.post(
        "/api/v1/entities/food_orders/batch",
        json={"items": []},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_public_complaint_create_allowed(client: AsyncClient):
    response = await client.post(
        "/api/v1/entities/complaints",
        json={
            "category": "Другое",
            "description": "entity guard public create test",
            "status": "new",
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_public_entity_create_rate_limited(client: AsyncClient):
    payload = {
        "category": "Другое",
        "description": "rate limit probe",
        "status": "new",
    }
    for _ in range(30):
        response = await client.post("/api/v1/entities/complaints", json=payload)
        assert response.status_code in {201, 400, 422}
    blocked = await client.post("/api/v1/entities/complaints", json=payload)
    assert blocked.status_code == 429
