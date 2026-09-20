import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.food_business import FoodExpense, FoodRefund
from models.food_items import Food_items
from models.food_operations import FoodOperationsSettings, FoodOrderEvent
from models.food_orders import Food_orders
from models.food_restaurants import Food_restaurants
from models.food_shifts import FoodShift, FoodStaffAction
from models.partner_auth import PartnerCredentials
from routers.food_business import router as business_router
from routers.food_operations import router as operations_router
from routers.food_shifts import router as shifts_router
from utils.courier_pin import hash_courier_pin


@pytest.fixture
async def shift_env():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    tables = [m.__table__ for m in (
        PartnerCredentials, Food_orders, FoodOrderEvent, FoodOperationsSettings,
        FoodExpense, FoodRefund, Food_restaurants, Food_items, FoodShift, FoodStaffAction,
    )]
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([
            PartnerCredentials(id=1, partner_type="dam_alem", email="owner@test.local", password_hash="unused", pin_hash=hash_courier_pin("1111"), display_name="Владелец", is_active=True, access_role="owner"),
            PartnerCredentials(id=2, partner_type="dam_alem", email="operator@test.local", password_hash="unused", pin_hash=hash_courier_pin("2222"), display_name="Оператор 1", is_active=True, access_role="operator"),
        ])
        db.add(Food_restaurants(id=1, name="DAM ALEM 2.0"))
        db.add(Food_items(id=1, restaurant_id=1, name="Пицца", price=2000, is_active=True, available=True))
        await db.commit()

    async def dependency():
        async with maker() as db:
            yield db

    app = FastAPI()
    app.include_router(shifts_router)
    app.include_router(business_router)
    app.include_router(operations_router)
    app.dependency_overrides[get_db] = dependency

    def headers(staff_id: int, role: str):
        token = create_access_token({"role": "partner", "type": "partner_session", "partner_type": "dam_alem", "partner_id": staff_id, "access_role": role})
        return {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, maker, headers(1, "owner"), headers(2, "operator")
    await engine.dispose()


@pytest.mark.asyncio
async def test_pin_shift_lifecycle_and_work_gate(shift_env):
    client, maker, owner, operator = shift_env
    shifts = "/api/v1/dam-alem/shifts"
    availability = "/api/v1/dam-alem/business/availability/1"

    assert (await client.patch(availability, headers=operator, json={"available": False})).status_code == 409
    assert (await client.post(shifts + "/open", headers=operator, json={"pin": "9999"})).status_code == 401
    opened = await client.post(shifts + "/open", headers=operator, json={"pin": "2222"})
    assert opened.status_code == 200, opened.text
    shift_id = opened.json()["shift"]["id"]
    assert (await client.post(shifts + "/open", headers=operator, json={"pin": "2222"})).status_code == 409

    # Refresh/re-login is represented by a new request with the same personal session.
    status = (await client.get(shifts + "/me", headers=operator)).json()
    assert status["shift"]["id"] == shift_id and status["shift"]["active"] is True
    assert (await client.patch(availability, headers=operator, json={"available": False})).status_code == 200

    # The owner cannot close another employee's shift through the personal endpoint.
    assert (await client.post(shifts + "/close", headers=owner, json={"pin": "1111"})).status_code == 409
    closed = await client.post(shifts + "/close", headers=operator, json={"pin": "2222"})
    assert closed.status_code == 200 and closed.json()["shift"]["active"] is False
    assert closed.json()["shift"]["duration_seconds"] is not None
    assert (await client.patch(availability, headers=operator, json={"available": True})).status_code == 409

    today = await client.get(shifts + "/today", headers=owner)
    assert today.status_code == 200 and any(row["id"] == shift_id for row in today.json()["items"])
    actions = (await client.get(shifts + "/actions", headers=owner, params={"shift_id": shift_id})).json()["items"]
    assert {row["action"] for row in actions} >= {"shift_opened", "product_availability_changed", "shift_closed"}
    assert all(row["staff_name"] == "Оператор 1" for row in actions)


@pytest.mark.asyncio
async def test_owner_can_manage_personal_pin_without_exposing_it(shift_env):
    client, maker, owner, operator = shift_env
    staff_url = "/api/v1/dam-alem/business/staff"
    rows = await client.get(staff_url, headers=owner)
    assert rows.status_code == 200 and all(row["pin_set"] for row in rows.json())
    assert "pin_hash" not in rows.text and "2222" not in rows.text

    changed = await client.patch(staff_url + "/2", headers=owner, json={"pin": "3333", "name": "Оператор 2"})
    assert changed.status_code == 200, changed.text
    assert (await client.post("/api/v1/dam-alem/shifts/open", headers=operator, json={"pin": "2222"})).status_code == 401
    opened = await client.post("/api/v1/dam-alem/shifts/open", headers=operator, json={"pin": "3333"})
    assert opened.status_code == 200 and opened.json()["shift"]["staff_name"] == "Оператор 2"
