"""Items marked «только для оператора» are sold by staff in the hall and never offered to delivery customers."""
import json

import pytest
from fastapi import HTTPException

from models.food_settings import Food_settings
from services.food_order_validation import validate_food_order
from tests.test_dam_order_workflow import env  # noqa: F401
from tests.test_dam_zone_tariffs import BASE as ZBASE, body, configure


async def mark_staff_only(maker, ids='[1]'):
    async with maker() as db:
        db.add(Food_settings(setting_key='staff_only_item_ids', setting_value=ids))
        await db.commit()


@pytest.mark.asyncio
async def test_catalog_flags_staff_only_items(env):  # noqa: F811
    from services import menu_configuration as menu
    _, maker, _, _ = env
    await mark_staff_only(maker)
    async with maker() as db:
        products = (await menu.catalog(db))['products']
    assert next(p for p in products if p['id'] == 1)['staff_only'] is True


@pytest.mark.asyncio
async def test_customer_cannot_order_staff_only_item(env):  # noqa: F811
    _, maker, _, _ = env
    await configure(maker)
    await mark_staff_only(maker)
    async with maker() as db:
        with pytest.raises(HTTPException) as error:
            await validate_food_order(db, {**body(), 'restaurant_id': 1, 'total_amount': 2000,
                                          'order_items': json.dumps([{'id': 1, 'quantity': 1}])})
    assert error.value.status_code == 400 and 'только в зале' in error.value.detail


@pytest.mark.asyncio
async def test_operator_still_sells_staff_only_item(env):  # noqa: F811
    client, maker, headers, _ = env
    await configure(maker)
    await mark_staff_only(maker)
    quote = await client.post(ZBASE + '/manual/quote', headers=headers, json=body())
    assert quote.status_code == 200, quote.text


def test_broken_setting_means_no_staff_only_items():
    from services.menu_configuration import parse_staff_only
    assert parse_staff_only('not json') == set() and parse_staff_only('{"a":1}') == set()
    assert parse_staff_only('[5, "7"]') == {5, 7}
