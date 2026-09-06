"""DAM ALEM order validation: prices, modifiers, system fields, delivery zone."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from services.food_order_validation import validate_food_order


def _product(**kw):
    defaults = dict(
        id=10,
        name="Донер Куриный",
        price=1500.0,
        is_active=True,
        available=True,
        restaurant_id=1,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _option(**kw):
    defaults = dict(id=5, name="Сыр", price=200.0, is_active=True, group_id=3)
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _link(**kw):
    defaults = dict(food_item_id=10, modifier_group_id=3)
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _svc(items):
    svc = MagicMock()
    svc.get_list = AsyncMock(return_value={"items": items, "total": len(items)})
    svc.get_by_id = AsyncMock(return_value=None)
    return svc


def _settings_rows(pairs: dict[str, str]):
    return [SimpleNamespace(setting_key=k, setting_value=v) for k, v in pairs.items()]


SQUARE_ZONE = {
    "id": "sort",
    "name": "Сортировка",
    "price": 600,
    "polygon": [
        [49.97, 73.20],
        [49.97, 73.23],
        [49.99, 73.23],
        [49.99, 73.20],
    ],
}
EXPENSIVE_ZONE = {
    "id": "city",
    "name": "В город",
    "price": 2500,
    "polygon": [
        [50.10, 73.20],
        [50.10, 73.30],
        [50.20, 73.30],
        [50.20, 73.20],
    ],
}


def _base_order(**extra):
    data = {
        "customer_name": "Али",
        "customer_phone": "+77001234567",
        "delivery_method": "pickup",
        "delivery_address": "",
        "order_items": '[{"id":10,"name":"Донер Куриный","price":1500,"quantity":1,"modifiers":[],"modTotal":0}]',
        "total_amount": 1500,
        "payment_method": "cash",
        "restaurant_id": 1,
        "status": "done",
        "user_id": 99999,
        "created_at": "2000-01-01T00:00:00Z",
        "payment_status": "paid",
    }
    data.update(extra)
    return data


@pytest.fixture
def catalog_patches():
    rest = MagicMock()
    rest.get_by_id = AsyncMock(return_value=SimpleNamespace(min_order=0, id=1))
    with (
        patch("services.food_order_validation.Food_itemsService", return_value=_svc([_product()])),
        patch("services.food_order_validation.Modifier_optionsService", return_value=_svc([_option()])),
        patch(
            "services.food_order_validation.Item_modifier_groupsService",
            return_value=_svc([_link()]),
        ),
        patch(
            "services.food_order_validation.Food_settingsService",
            return_value=_svc(_settings_rows({"min_order_amount": "0", "service_fee_rate": "0"})),
        ),
        patch("services.food_order_validation.Food_restaurantsService", return_value=rest),
    ):
        yield


@pytest.mark.asyncio
async def test_valid_order_forces_system_fields(catalog_patches):
    sanitized, items, total = await validate_food_order(MagicMock(), _base_order())
    assert sanitized["status"] == "new"
    assert sanitized["payment_status"] == "pending"
    assert sanitized["user_id"] is None
    assert sanitized["created_at"] != "2000-01-01T00:00:00Z"
    assert total == 1500
    assert items[0]["price"] == 1500


@pytest.mark.asyncio
async def test_rejects_base_price_tamper(catalog_patches):
    data = _base_order(
        order_items='[{"id":10,"name":"Донер Куриный","price":10,"quantity":1,"modifiers":[],"modTotal":0}]',
        total_amount=10,
    )
    with pytest.raises(HTTPException) as exc:
        await validate_food_order(MagicMock(), data)
    assert exc.value.status_code == 400
    assert "цена" in exc.value.detail.lower() or "изменилась" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_rejects_unknown_modifier(catalog_patches):
    data = _base_order(
        order_items='[{"id":10,"name":"Донер Куриный","price":1500,"quantity":1,"modifiers":[{"option_id":999,"name":"X","price":0}],"modTotal":0}]',
        total_amount=1500,
    )
    with pytest.raises(HTTPException) as exc:
        await validate_food_order(MagicMock(), data)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_rejects_modifier_not_on_item(catalog_patches):
    """Modifier exists in catalog but is linked to another dish."""
    foreign_opt = _option(id=77, name="Чужой", group_id=99)
    data = _base_order(
        order_items=(
            '[{"id":10,"name":"Донер Куриный","price":1500,"quantity":1,'
            '"modifiers":[{"option_id":77,"name":"Чужой","price":0}],"modTotal":0}]'
        ),
        total_amount=1500,
    )
    rest = MagicMock()
    rest.get_by_id = AsyncMock(return_value=SimpleNamespace(min_order=0, id=1))
    with (
        patch("services.food_order_validation.Food_itemsService", return_value=_svc([_product()])),
        patch(
            "services.food_order_validation.Modifier_optionsService",
            return_value=_svc([_option(), foreign_opt]),
        ),
        patch(
            "services.food_order_validation.Item_modifier_groupsService",
            return_value=_svc([_link()]),
        ),
        patch(
            "services.food_order_validation.Food_settingsService",
            return_value=_svc(_settings_rows({"min_order_amount": "0", "service_fee_rate": "0"})),
        ),
        patch("services.food_order_validation.Food_restaurantsService", return_value=rest),
    ):
        with pytest.raises(HTTPException) as exc:
            await validate_food_order(MagicMock(), data)
        assert exc.value.status_code == 400
        assert "не относится" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_rejects_modifier_price_tamper(catalog_patches):
    data = _base_order(
        order_items='[{"id":10,"name":"Донер Куриный","price":1500,"quantity":1,"modifiers":[{"option_id":5,"name":"Сыр","price":1}],"modTotal":1}]',
        total_amount=1501,
    )
    with pytest.raises(HTTPException) as exc:
        await validate_food_order(MagicMock(), data)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_modifier_uses_db_price_not_client(catalog_patches):
    data = _base_order(
        order_items='[{"id":10,"name":"Донер Куриный","price":1500,"quantity":1,"modifiers":[{"option_id":5,"name":"Сыр","price":1}],"modTotal":200}]',
        total_amount=1700,
    )
    sanitized, items, total = await validate_food_order(MagicMock(), data)
    assert items[0]["modifiers"][0]["price"] == 200
    assert total == 1700


@pytest.mark.asyncio
async def test_status_done_is_overwritten(catalog_patches):
    sanitized, _, _ = await validate_food_order(MagicMock(), _base_order(status="done"))
    assert sanitized["status"] == "new"


@pytest.mark.asyncio
async def test_payment_status_paid_is_overwritten(catalog_patches):
    sanitized, _, _ = await validate_food_order(MagicMock(), _base_order(payment_status="paid"))
    assert sanitized["payment_status"] == "pending"


@pytest.mark.asyncio
async def test_foreign_user_id_ignored(catalog_patches):
    account = SimpleNamespace(id="42", phone="+77001234567")
    sanitized, _, _ = await validate_food_order(
        MagicMock(),
        _base_order(user_id=99999),
        account_user=account,
    )
    assert sanitized["user_id"] == 42


@pytest.mark.asyncio
async def test_rejects_coords_outside_delivery_zone(catalog_patches):
    settings = _settings_rows({
        "min_order_amount": "0",
        "service_fee_rate": "0",
        "delivery_zones": json.dumps([SQUARE_ZONE, EXPENSIVE_ZONE]),
        "store_lat": "49.9774",
        "store_lng": "73.2137",
    })
    with (
        patch("services.food_order_validation.Food_itemsService", return_value=_svc([_product()])),
        patch("services.food_order_validation.Modifier_optionsService", return_value=_svc([])),
        patch("services.food_order_validation.Item_modifier_groupsService", return_value=_svc([])),
        patch("services.food_order_validation.Food_settingsService", return_value=_svc(settings)),
        patch(
            "services.food_order_validation.Food_restaurantsService",
            return_value=_svc([]),
        ) as rest_factory,
        patch(
            "services.food_order_validation.geocode_address",
            new=AsyncMock(return_value=(51.0, 71.0)),
        ),
    ):
        rest_factory.return_value.get_by_id = AsyncMock(return_value=SimpleNamespace(min_order=0))
        data = _base_order(
            delivery_method="delivery",
            delivery_address="ул. Тестовая 1",
            delivery_zone="Сортировка",
            delivery_fee=600,
            service_fee=0,
            delivery_lat=51.0,
            delivery_lng=71.0,
            total_amount=2100,
        )
        with pytest.raises(HTTPException) as exc:
            await validate_food_order(
                MagicMock(),
                data,
                delivery_fee_hint=600,
                service_fee_hint=0,
                zone_name="Сортировка",
            )
        assert exc.value.status_code == 400
        assert "доставк" in exc.value.detail.lower() or "зон" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_delivery_zone_name_does_not_pick_cheap_fee():
    settings = _settings_rows({
        "min_order_amount": "0",
        "service_fee_rate": "0",
        "delivery_zones": json.dumps([SQUARE_ZONE, EXPENSIVE_ZONE]),
        "store_lat": "49.9774",
        "store_lng": "73.2137",
    })
    rest = MagicMock()
    rest.get_by_id = AsyncMock(return_value=SimpleNamespace(min_order=0))
    with (
        patch("services.food_order_validation.Food_itemsService", return_value=_svc([_product()])),
        patch("services.food_order_validation.Modifier_optionsService", return_value=_svc([])),
        patch("services.food_order_validation.Item_modifier_groupsService", return_value=_svc([])),
        patch("services.food_order_validation.Food_settingsService", return_value=_svc(settings)),
        patch("services.food_order_validation.Food_restaurantsService", return_value=rest),
        patch(
            "services.food_order_validation.geocode_address",
            new=AsyncMock(return_value=(50.15, 73.25)),
        ),
    ):
        data = _base_order(
            delivery_method="delivery",
            delivery_address="далеко",
            delivery_zone="Сортировка",
            total_amount=4000,
            delivery_lat=50.15,
            delivery_lng=73.25,
        )
        sanitized, _, total = await validate_food_order(
            MagicMock(),
            data,
            delivery_fee_hint=2500,
            service_fee_hint=0,
            zone_name="Сортировка",
        )
        assert total == 4000
        assert sanitized["status"] == "new"


@pytest.mark.asyncio
async def test_server_geocode_overrides_cheap_client_coords():
    """Client cannot claim a cheap zone by sending mismatched lat/lng."""
    settings = _settings_rows({
        "min_order_amount": "0",
        "service_fee_rate": "0",
        "delivery_zones": json.dumps([SQUARE_ZONE, EXPENSIVE_ZONE]),
        "store_lat": "49.9774",
        "store_lng": "73.2137",
    })
    rest = MagicMock()
    rest.get_by_id = AsyncMock(return_value=SimpleNamespace(min_order=0))
    with (
        patch("services.food_order_validation.Food_itemsService", return_value=_svc([_product()])),
        patch("services.food_order_validation.Modifier_optionsService", return_value=_svc([])),
        patch("services.food_order_validation.Item_modifier_groupsService", return_value=_svc([])),
        patch("services.food_order_validation.Food_settingsService", return_value=_svc(settings)),
        patch("services.food_order_validation.Food_restaurantsService", return_value=rest),
        # Address geocodes into expensive zone; client lies with cheap-zone coords.
        patch(
            "services.food_order_validation.geocode_address",
            new=AsyncMock(return_value=(50.15, 73.25)),
        ),
    ):
        data = _base_order(
            delivery_method="delivery",
            delivery_address="ул. Дальняя 1",
            total_amount=2100,
            delivery_lat=49.98,
            delivery_lng=73.215,
        )
        with pytest.raises(HTTPException) as exc:
            await validate_food_order(
                MagicMock(),
                data,
                delivery_fee_hint=600,
                service_fee_hint=0,
            )
        assert exc.value.status_code == 400
        assert "доставк" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_omitting_fee_hints_cannot_zero_delivery_with_zones():
    """Legacy marketplace bypass must not apply when delivery zones are configured."""
    settings = _settings_rows({
        "min_order_amount": "0",
        "service_fee_rate": "0",
        "delivery_zones": json.dumps([SQUARE_ZONE]),
        "store_lat": "49.9774",
        "store_lng": "73.2137",
    })
    rest = MagicMock()
    rest.get_by_id = AsyncMock(return_value=SimpleNamespace(min_order=0))
    with (
        patch("services.food_order_validation.Food_itemsService", return_value=_svc([_product()])),
        patch("services.food_order_validation.Modifier_optionsService", return_value=_svc([])),
        patch("services.food_order_validation.Item_modifier_groupsService", return_value=_svc([])),
        patch("services.food_order_validation.Food_settingsService", return_value=_svc(settings)),
        patch("services.food_order_validation.Food_restaurantsService", return_value=rest),
        patch(
            "services.food_order_validation.geocode_address",
            new=AsyncMock(return_value=(49.98, 73.215)),
        ),
    ):
        data = _base_order(
            delivery_method="delivery",
            delivery_address="ул. Жекибаева 129",
            delivery_lat=49.98,
            delivery_lng=73.215,
            # Attacker omits fee hints and claims subtotal-only total
            total_amount=1500,
        )
        with pytest.raises(HTTPException) as exc:
            await validate_food_order(MagicMock(), data)
        assert exc.value.status_code == 400
        assert "сумм" in exc.value.detail.lower() or "доставк" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_legacy_marketplace_without_zones_still_allows_subtotal_only():
    settings = _settings_rows({
        "min_order_amount": "0",
        "service_fee_rate": "0",
    })
    rest = MagicMock()
    rest.get_by_id = AsyncMock(return_value=SimpleNamespace(min_order=0))
    with (
        patch("services.food_order_validation.Food_itemsService", return_value=_svc([_product()])),
        patch("services.food_order_validation.Modifier_optionsService", return_value=_svc([])),
        patch("services.food_order_validation.Item_modifier_groupsService", return_value=_svc([])),
        patch("services.food_order_validation.Food_settingsService", return_value=_svc(settings)),
        patch("services.food_order_validation.Food_restaurantsService", return_value=rest),
    ):
        data = _base_order(
            delivery_method="delivery",
            delivery_address="ул. Любая 1",
            total_amount=1500,
        )
        sanitized, _, total = await validate_food_order(MagicMock(), data)
        assert total == 1500
        assert sanitized["status"] == "new"


@pytest.mark.asyncio
async def test_missing_customer_name(catalog_patches):
    with pytest.raises(HTTPException) as exc:
        await validate_food_order(MagicMock(), _base_order(customer_name=""))
    assert exc.value.status_code == 400
    assert "имя" in exc.value.detail.lower()
