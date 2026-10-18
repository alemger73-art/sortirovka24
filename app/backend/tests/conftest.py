"""Shared pytest fixtures for backend tests.

The account router keeps login/SMS rate-limit counters in module-level
dictionaries. Without resetting them between tests, requests accumulate across
the whole pytest session and trip the per-IP SMS limit (429), causing unrelated
tests to fail. This autouse fixture isolates each test.
"""

import pytest


@pytest.fixture(autouse=True)
def _reset_account_rate_limiters():
    from routers import account_v2
    from utils import rate_limit

    account_v2.LOGIN_ATTEMPTS.clear()
    account_v2.SMS_REQUEST_ATTEMPTS.clear()
    rate_limit._RATE_BUCKETS.clear()
    from routers import food_orders as food_orders_router

    food_orders_router._ORDER_RATE.clear()
    yield
    account_v2.LOGIN_ATTEMPTS.clear()
    account_v2.SMS_REQUEST_ATTEMPTS.clear()
    rate_limit._RATE_BUCKETS.clear()
    food_orders_router._ORDER_RATE.clear()


@pytest.fixture(autouse=True)
def _google_signup_for_legacy_tests(monkeypatch, request):
    """Production closes new Google sign-ups; older tests exercise the full Google
    flow, so they run with it switched on. test_google_signup_closed checks the default."""
    if "google_signup_closed" not in request.node.name:
        monkeypatch.setenv("GOOGLE_SIGNUP_ENABLED", "1")
