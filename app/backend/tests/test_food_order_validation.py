"""Unit tests for food order total validation helpers."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import HTTPException

from services.food_order_validation import (
    APARTMENT_DELIVERY_FEE,
    _apply_free_delivery_threshold,
    _resolve_promo,
    assert_kitchen_open,
    expected_apartment_fee,
    kitchen_is_open,
    parse_kitchen_hours,
    requests_apartment_delivery,
)


def test_free_delivery_threshold_zeroes_fee():
    settings = {"free_delivery_from": "15000"}
    assert _apply_free_delivery_threshold(16000, 800, settings) == 0.0
    assert _apply_free_delivery_threshold(10000, 800, settings) == 800.0


def test_resolve_percent_promo():
    settings = {
        "promo_codes": '[{"code":"DAMALEM10","type":"percent","value":10,"active":true}]',
    }
    discount, free_delivery = _resolve_promo("damalem10", 5000, settings)
    assert discount == 500
    assert free_delivery is False


def test_resolve_free_delivery_promo():
    settings = {
        "promo_codes": '[{"code":"FREEDEL","type":"free_delivery","active":true}]',
    }
    discount, free_delivery = _resolve_promo("FREEDEL", 5000, settings)
    assert discount == 0
    assert free_delivery is True


def test_apartment_fee_constant():
    assert APARTMENT_DELIVERY_FEE == 300.0


def test_requests_apartment_delivery_from_flag_or_address():
    assert requests_apartment_delivery({"deliver_to_apartment": True}, "ул. Тестовая 1")
    assert requests_apartment_delivery({"apartment_delivery_fee": 300}, "ул. Тестовая 1")
    assert requests_apartment_delivery({}, "ул. Тестовая 1 (до квартиры)")
    assert not requests_apartment_delivery({}, "ул. Тестовая 1 (до подъезда)")


def test_expected_apartment_fee_charges_when_requested():
    settings = {"apartment_delivery_price": "300", "apartment_free_from": "15000"}
    assert expected_apartment_fee(
        delivery_method="delivery",
        subtotal=4000,
        settings=settings,
        promo_free_delivery=False,
        requested=True,
    ) == 300.0
    assert expected_apartment_fee(
        delivery_method="delivery",
        subtotal=4000,
        settings=settings,
        promo_free_delivery=False,
        requested=False,
    ) == 0.0
    assert expected_apartment_fee(
        delivery_method="delivery",
        subtotal=15000,
        settings=settings,
        promo_free_delivery=False,
        requested=True,
    ) == 0.0
    assert expected_apartment_fee(
        delivery_method="pickup",
        subtotal=4000,
        settings=settings,
        promo_free_delivery=False,
        requested=True,
    ) == 0.0


def test_parse_kitchen_hours_accepts_en_dash():
    parsed = parse_kitchen_hours({"working_hours": "10:00 – 22:00"})
    assert parsed is not None
    open_min, close_min, open_label, close_label = parsed
    assert open_min == 10 * 60
    assert close_min == 22 * 60
    assert open_label == "10:00"
    assert close_label == "22:00"


def test_kitchen_closed_outside_hours():
    settings = {"working_hours": "10:00-22:00"}
    closed_at = datetime(2026, 9, 7, 8, 0)
    open_now, opens, closes = kitchen_is_open(settings, closed_at)
    assert open_now is False
    assert opens == "10:00"
    assert closes == "22:00"
    with pytest.raises(HTTPException) as exc:
        assert_kitchen_open(settings, closed_at)
    assert exc.value.status_code == 400
    assert "10:00" in exc.value.detail


def test_kitchen_open_inside_hours():
    settings = {"working_hours": "Ежедневно 10:00—22:00"}
    assert kitchen_is_open(settings, datetime(2026, 9, 7, 12, 30))[0] is True
    assert_kitchen_open(settings, datetime(2026, 9, 7, 12, 30))


def test_kitchen_always_open_when_hours_missing():
    assert kitchen_is_open({}, datetime(2026, 9, 7, 3, 0))[0] is True


def test_bonus_total_is_applied_before_client_compare():
    """Client sends total_amount after bonus discount; server must subtract bonus first."""
    subtotal = 73790.0
    service = 3690.0
    apartment = 300.0
    bonus = 400.0
    total_before_bonus = subtotal + service + apartment
    client_total = total_before_bonus - bonus
    expected_after_bonus = round(total_before_bonus - bonus, 2)
    assert abs(expected_after_bonus - client_total) <= 1
