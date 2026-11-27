"""ДАМ АЛЕМ dishes follow the cashier's menu: links, prices, new dishes, the stop list; other dishes untouched."""
import json

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import Base
from models.food_categories import Food_categories
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from services import pos_menu_sync as sync

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def maker():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[Food_restaurants.__table__, Food_categories.__table__, Food_items.__table__])
    make = async_sessionmaker(engine, expire_on_commit=False)
    async with make() as db:
        db.add_all([Food_restaurants(id=1, name="DAM ALEM", business_id="dam_alem"), Food_restaurants(id=2, name="Другой", business_id="other")])
        db.add_all([Food_categories(id=10, restaurant_id=1, name="Пиццы", is_active=True),
                    Food_categories(id=26, restaurant_id=1, name="Напитки", is_active=True),
                    Food_categories(id=90, restaurant_id=2, name="Чужая", is_active=True)])
        db.add_all([
            Food_items(id=187, restaurant_id=1, category_id=10, name="Пепперони", price=3200, is_active=True, available=True,
                       image_url="/food/dam/187.webp?v=1", weight="30 см", description="Острая", sales_department="kitchen", menu_version=1),
            Food_items(id=233, restaurant_id=1, category_id=26, name="Coca-Cola 0,5 л", price=650, is_active=True, available=True,
                       image_url="food/abc.webp", menu_version=1),
            Food_items(id=500, restaurant_id=2, category_id=90, name="Чужое блюдо", price=100, is_active=True, menu_version=1),
        ])
        await db.commit()
    yield make
    await engine.dispose()


def _menu(*items, categories=None, version="v1"):
    categories = categories or [{"id": 4, "name": "Пицца", "point": "kitchen", "hidden": False, "site_category_id": 10, "sort": 4},
                                {"id": 5, "name": "Комбо", "point": "kitchen", "hidden": False, "site_category_id": 10, "sort": 5},
                                {"id": 7, "name": "Напитки", "point": "bar", "hidden": False, "site_category_id": None, "sort": 7}]
    return {"version": version, "categories": categories, "items": list(items)}


def _item(pos_id, name, price, category_id=4, site_id=None, on_site=True, on_sale=True, photo_url=None, **extra):
    return {"id": pos_id, "category_id": category_id, "name": name, "site_name": extra.get("site_name", name), "price": price,
            "description": extra.get("description"), "weight": extra.get("weight"), "point": "bar" if category_id == 7 else "kitchen",
            "sort": 1, "site_id": site_id, "on_sale": on_sale, "on_site": on_site, "photo_url": photo_url}


async def _row(maker, row_id):
    async with maker() as db:
        return await db.get(Food_items, row_id)


async def test_existing_site_dish_is_linked_and_nothing_changes_when_fields_match(maker):
    pizza = _item(1, "Пепперони", 3200, site_id=187, weight="30 см", description="Острая")
    async with maker() as db:
        report = await sync.apply_menu(db, _menu(pizza))
    assert report["items"] == {1: 187} and report["categories"] == {}
    assert report["images"] == {1: "https://www.sortirovka24.kz/food/dam/187.webp?v=1"}
    row = await _row(maker, 187)
    assert (row.price, row.menu_version, row.image_url) == (3200, 1, "/food/dam/187.webp?v=1")


async def test_new_price_stop_list_and_photo_reach_the_site(maker):
    async with maker() as db:
        await sync.apply_menu(db, _menu(_item(1, "Пепперони", 3200, site_id=187, weight="30 см", description="Острая")))
    photo = "https://www.sortirovka24.kz/kassa/api/public/photos/1?v=3"
    async with maker() as db:
        report = await sync.apply_menu(db, _menu(_item(1, "Пепперони", 3400, site_id=187, on_sale=False, photo_url=photo,
                                                       weight="30 см", description="Острая", site_name="Пицца Пепперони")))
    row = await _row(maker, 187)
    assert (row.price, row.available, row.is_active, row.image_url, row.name, row.menu_version) == (3400, False, True, photo, "Пицца Пепперони", 2)
    assert 1 not in report["images"]                                   # the cashier has its own photo now


async def test_a_dish_taken_off_the_site_is_hidden_not_deleted(maker):
    async with maker() as db:
        await sync.apply_menu(db, _menu(_item(1, "Пепперони", 3200, site_id=187, on_site=False, weight="30 см", description="Острая")))
    row = await _row(maker, 187)
    assert row.is_active is False and row.archived_at is None


async def test_new_dishes_are_created_in_the_linked_or_a_new_category(maker):
    menu = _menu(_item(2, "Гавайская", 3500), _item(3, "Вода 0,5", 500, category_id=7), _item(4, "Только касса", 100, on_site=False),
                 _item(6, "Комбо куриный", 3700, category_id=5))
    async with maker() as db:
        report = await sync.apply_menu(db, menu)
    assert set(report["items"]) == {2, 3, 6}                           # a café-only dish is not put on the site
    hawaii, water = await _row(maker, report["items"][2]), await _row(maker, report["items"][3])
    assert (hawaii.category_id, hawaii.restaurant_id, hawaii.business_id, hawaii.price, hawaii.is_active) == (10, 1, "dam_alem", 3500, True)
    async with maker() as db:
        drinks = await db.get(Food_categories, water.category_id)
    assert (drinks.name, drinks.restaurant_id, water.sales_department) == ("Напитки", 1, "bar")
    assert drinks.id not in (10, 26) and report["categories"] == {4: 10, 5: 10, 7: drinks.id}   # two may share one
    async with maker() as db:                                           # the next round finds the links, creates nothing more
        again = await sync.apply_menu(db, menu)
        count = len((await db.execute(select(Food_items))).scalars().all())
    assert again["items"] == report["items"] and count == 6


async def test_dishes_not_from_the_cashier_and_other_businesses_are_left_alone(maker):
    async with maker() as db:
        report = await sync.apply_menu(db, _menu(_item(5, "Чужое", 1, site_id=500, on_site=False)))
    assert report["items"] == {}
    cola, other = await _row(maker, 233), await _row(maker, 500)
    assert (cola.price, cola.menu_version, other.price) == (650, 1, 100)


async def test_sync_round_asks_once_and_reports_links(maker):
    calls = []
    menu = _menu(_item(1, "Пепперони", 3300, site_id=187, weight="30 см", description="Острая"))

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, request.headers.get("x-api-key")))
        if request.method == "GET":
            return httpx.Response(200, json=menu)
        assert json.loads(request.content)["items"] == {"1": 187}
        return httpx.Response(200, json={"ok": True})

    key = "k" * 40
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        version = await sync.sync_once(client, maker, "http://pos/api/integration/menu", key, None)
        assert version == "v1" and calls[-1] == ("POST", "/api/integration/menu/links", key)
        again = await sync.sync_once(client, maker, "http://pos/api/integration/menu", key, version)
    assert again == "v1" and [c[0] for c in calls] == ["GET", "POST", "GET"]   # unchanged menu: nothing written
    assert (await _row(maker, 187)).price == 3300


async def test_switched_off_without_settings(monkeypatch):
    monkeypatch.delenv("POS_MENU_URL", raising=False)
    assert sync.settings() is None
    monkeypatch.setenv("POS_MENU_URL", "http://damalem-pos:8000/api/integration/menu")
    monkeypatch.setenv("POS_INTEGRATION_KEY", "short")
    assert sync.settings() is None
