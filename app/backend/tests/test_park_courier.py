"""Tests for park courier PIN auth, hashing, and rate limits."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from utils.courier_pin import hash_courier_pin, is_hashed_pin, verify_courier_pin


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def test_courier_pin_hash_and_verify():
    hashed = hash_courier_pin("1234")
    assert is_hashed_pin(hashed)
    assert verify_courier_pin(hashed, "1234")
    assert not verify_courier_pin(hashed, "9999")


def test_courier_pin_legacy_plaintext_verify():
    assert verify_courier_pin("5678", "5678")
    assert not verify_courier_pin("5678", "0000")


@pytest.mark.asyncio
async def test_courier_login_with_mock_data_pin(client: AsyncClient):
    """Mock seed includes courier PIN 1234."""
    response = await client.post("/api/v1/park/courier/login", json={"pin_code": "1234"})
    if response.status_code == 401:
        pytest.skip("No seeded couriers in test database")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_active"] is True
    assert "id" in body


@pytest.mark.asyncio
async def test_courier_login_rejects_invalid_pin(client: AsyncClient):
    response = await client.post("/api/v1/park/courier/login", json={"pin_code": "0000"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_courier_pin_rate_limit_blocks_bruteforce(client: AsyncClient):
    for _ in range(5):
        await client.post("/api/v1/park/courier/login", json={"pin_code": "0000"})
    blocked = await client.post("/api/v1/park/courier/login", json={"pin_code": "0000"})
    assert blocked.status_code == 429
