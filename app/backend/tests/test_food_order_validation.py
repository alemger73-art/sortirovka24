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
