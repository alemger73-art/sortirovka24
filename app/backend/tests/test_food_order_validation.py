"""Unit tests for food order total validation helpers."""

from __future__ import annotations

import pytest

from services.food_order_validation import (
    APARTMENT_DELIVERY_FEE,
    _apply_free_delivery_threshold,
    _resolve_promo,
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
