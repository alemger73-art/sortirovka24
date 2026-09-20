"""PIN hashing and regression guards for retired API modules."""

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
async def test_retired_delivery_api_is_not_exposed(client: AsyncClient):
    response = await client.post(
        "/api/v1/park/courier/login", json={"pin_code": "1234"}
    )
    assert response.status_code == 404
