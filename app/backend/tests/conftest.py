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
    yield
    account_v2.LOGIN_ATTEMPTS.clear()
    account_v2.SMS_REQUEST_ATTEMPTS.clear()
    rate_limit._RATE_BUCKETS.clear()
