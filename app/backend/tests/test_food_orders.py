"""Local API tests for food order endpoints."""

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
async def test_food_orders_list_requires_admin(client: AsyncClient):
    response = await client.get("/api/v1/entities/food_orders")
    assert response.status_code == 401

    response = await client.get("/api/v1/entities/food_orders", headers=_admin_headers())
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    assert "total" in body


@pytest.mark.asyncio
async def test_food_order_create_requires_valid_payload(client: AsyncClient):
    response = await client.post(
        "/api/v1/entities/food_orders",
        json={"customer_name": "", "customer_phone": ""},
    )
    assert response.status_code in {400, 422}


@pytest.mark.asyncio
async def test_food_order_delete_requires_admin(client: AsyncClient):
    response = await client.delete("/api/v1/entities/food_orders/999999")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_food_order_batch_requires_admin(client: AsyncClient):
    response = await client.post(
        "/api/v1/entities/food_orders/batch",
        json={"items": [{"customer_name": "x", "customer_phone": "+77001234567"}]},
    )
    assert response.status_code == 401
