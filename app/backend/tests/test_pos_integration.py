"""The cashier's bonus lookup answers only with the key and never shows more than the balance."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import routers.pos_integration as pos

pytestmark = pytest.mark.asyncio
KEY = "k" * 40


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("POS_INTEGRATION_KEY", KEY)
    a = FastAPI()
    a.include_router(pos.router)

    async def fake_db():
        class DB:
            async def commit(self):
                pass
        yield DB()
    a.dependency_overrides[pos.get_db] = fake_db
    return a


async def _ask(app, phone, key=KEY):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        return await c.post("/api/v1/integrations/pos/bonus", json={"phone": phone}, headers={"X-Api-Key": key})


async def test_needs_the_key(app):
    assert (await _ask(app, "87071234567", key="wrong")).status_code == 401


async def test_unknown_phone(app, monkeypatch):
    async def nobody(db, phone):
        return None
    monkeypatch.setattr(pos, "find_user_by_phone", nobody)
    assert (await _ask(app, "87071234567")).json() == {"registered": False}


async def test_balance(app, monkeypatch):
    class U:
        id = "u1"

    async def someone(db, phone):
        return U()

    async def summary(db, user_id):
        return {"balance": "500.00", "expires": [{"amount": "300.00", "at": "2026-12-10T00:00:00+00:00"}], "history": ["secret"]}
    monkeypatch.setattr(pos, "find_user_by_phone", someone)
    monkeypatch.setattr(pos.loyalty, "summary", summary)
    r = (await _ask(app, "87071234567")).json()
    assert r == {"registered": True, "balance": 500, "expires": [{"amount": 300, "at": "2026-12-10T00:00:00+00:00"}]}
