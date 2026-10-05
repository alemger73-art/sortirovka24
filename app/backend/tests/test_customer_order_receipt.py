import json
from types import SimpleNamespace
import pytest
from services.customer_order_receipt import customer_order_receipt


def test_receipt_exposes_only_saved_public_totals():
    order = SimpleNamespace(total_amount=6350, pricing_snapshot=json.dumps({'breakdown': {'subtotal': 6000, 'service_fee': 600, 'delivery_fee': 500, 'discount': 750}, 'settings': {'promo_codes': 'private'}}))
    assert customer_order_receipt(order) == {'subtotal': 6000, 'service_fee': 600, 'delivery_fee': 500, 'discount': 750}


@pytest.mark.parametrize('snapshot', [None, 'bad json', '[]', '{}', '{"breakdown": null}', '{"breakdown":{"subtotal":6000,"service_fee":600,"delivery_fee":500,"discount":750}}', '{"breakdown":{"subtotal":NaN,"service_fee":0,"delivery_fee":0,"discount":0}}'])
def test_legacy_invalid_or_stale_totals_are_not_invented(snapshot):
    assert customer_order_receipt(SimpleNamespace(total_amount=3000, pricing_snapshot=snapshot)) is None
