"""Site orders at the Dam Alem till: pulled with the site's own sums, moved through the site's own workflow.
Named «simple_flow»: production runs DÄM ALEM without couriers, the operator delivers (see conftest)."""
import json

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import insert, select

import routers.pos_integration as pos
from models.food_operations import FoodOrderEvent
from models.food_orders import Food_orders
from services.pos_menu_sync import ensure_tables, item_links
from tests.test_dam_order_workflow import env  # noqa: F401

pytestmark = pytest.mark.asyncio
KEY = "k" * 40


@pytest.fixture
async def till(env, monkeypatch):  # noqa: F811
    _, maker, _, _ = env
    monkeypatch.setenv("POS_INTEGRATION_KEY", KEY)
    app = FastAPI()
    app.include_router(pos.router)

    async def db():
        async with maker() as session:
            yield session
    app.dependency_overrides[pos.get_db] = db
    async with maker() as session:
        await ensure_tables(session)
        await session.execute(insert(item_links).values(pos_item_id=501, food_item_id=1))   # Pizza is cashier dish 501
        order = await session.get(Food_orders, 1)
        order.created_at = order.created_at or "2099-01-01T00:00:00+00:00"
        order.payment_method, order.payment_status, order.paid_amount = "cash", "pending", 0
        order.order_items = json.dumps([{"id": 1, "name": "Pizza", "price": 1000, "quantity": 2, "modTotal": 100, "sum": 2200,
                                         "modifiers": [{"name": "сырный бортик"}]},
                                        {"id": 2, "name": "Drink", "price": 300, "quantity": 1, "sum": 300}])
        order.pricing_snapshot = json.dumps({"breakdown": {"subtotal": 2500, "delivery_fee": 600, "discount": 250},
                                             "delivery_tariff": {"zone_name": "СОРТИРОВКА "}, "promo_code": "DAMALEM10",
                                             "requested_apartment": True})
        order.total_amount = 2850
        await session.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t", headers={"X-Api-Key": KEY}) as c:
        c.maker = maker
        yield c


async def _pull(till, after=0, open_ids=()):
    r = await till.post("/api/v1/integrations/pos/site-orders/pull", json={"after_id": after, "open_ids": list(open_ids)})
    assert r.status_code == 200, r.text
    return r.json()


async def test_simple_flow_the_till_gets_the_order_with_the_sites_own_sums(till):
    got = await _pull(till)
    assert len(got["new"]) == 1
    o = got["new"][0]
    assert (o["id"], o["status"], o["kind"], o["zone"], o["to_door"], o["payment_method"], o["paid"]) == (1, "new", "delivery", "СОРТИРОВКА", True, "cash", 0)
    assert o["lines"] == [
        {"food_item_id": 1, "pos_item_id": 501, "name": "Pizza", "qty": 2, "unit_price": 1100, "note": "сырный бортик", "department": None},
        {"food_item_id": 2, "pos_item_id": None, "name": "Drink", "qty": 1, "unit_price": 300, "note": None, "department": None}]
    assert (o["delivery_fee"], o["discount"], o["total"]) == (600, 250, 2850)          # 2 500 + 600 − 250 = 2 850, as on the site
    assert o["discount_note"] == "Скидка на сайте: промокод DAMALEM10"
    assert (await _pull(till, after=1))["new"] == []                                    # never offered twice
    assert (await till.post("/api/v1/integrations/pos/site-orders/pull", json={"after_id": 0}, headers={"X-Api-Key": "x"})).status_code == 401


async def test_simple_flow_the_till_moves_the_order_through_the_sites_workflow(till):
    push = "/api/v1/integrations/pos/site-orders/1/status"
    assert (await till.post(push, json={"status": "cooking"})).json()["status"] == "preparing"
    assert (await till.post(push, json={"status": "cooking"})).json()["status"] == "preparing"    # repeated: nothing changes
    assert (await till.post(push, json={"status": "on_way"})).json()["status"] == "in_progress"  # «ready» stepped through
    done = (await till.post(push, json={"status": "done"})).json()
    assert (done["status"], done["payment_status"]) == ("done", "paid")                          # cash taken at the door
    changed = (await _pull(till, after=1, open_ids=[1]))["changed"]
    assert changed == [{"id": 1, "status": "done", "payment_status": "paid", "paid": 2850, "cancellation_reason": None}]
    async with till.maker() as db:
        events = [e.message for e in (await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id == 1).order_by(FoodOrderEvent.id))).all()]
        actors = {e.actor for e in (await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id == 1))).all()}
    assert any("Готовится" in m or "preparing" in m.lower() for m in events) and "Касса Dam Alem" in actors


async def test_simple_flow_pickup_skips_the_road_and_cancel_needs_nothing_more(till):
    async with till.maker() as db:
        order = await db.get(Food_orders, 1)
        order.delivery_method = "pickup"
        await db.commit()
    assert (await _pull(till))["new"][0]["kind"] == "takeaway"
    push = "/api/v1/integrations/pos/site-orders/1/status"
    assert (await till.post(push, json={"status": "done"})).json()["status"] == "done"
    assert (await till.post(push, json={"status": "cancelled", "reason": "x"})).json()["status"] == "done"   # a closed order stays closed


async def test_simple_flow_a_cancel_from_the_till_reaches_the_site_with_its_reason(till):
    r = (await till.post("/api/v1/integrations/pos/site-orders/1/status", json={"status": "cancelled", "reason": "Нет продуктов"})).json()
    assert r["status"] == "cancelled"
    assert (await _pull(till, open_ids=[1]))["changed"][0]["cancellation_reason"] == "Нет продуктов"
    assert (await _pull(till))["new"] == []                                             # a cancelled order is not offered


async def test_simple_flow_only_dam_orders_and_only_known_statuses(till):
    assert (await till.post("/api/v1/integrations/pos/site-orders/999/status", json={"status": "cooking"})).status_code == 404
    assert (await till.post("/api/v1/integrations/pos/site-orders/1/status", json={"status": "eaten"})).status_code == 422
