"""Release 1.2: only wrong PINs count toward the 15-minute lockout."""
import pytest
from fastapi import HTTPException
from utils import rate_limit
from utils.rate_limit import ensure_failures_below, register_failure
from tests.test_dam_order_workflow import env  # noqa
from tests.test_dam_courier_workflow import assigned, login, COURIER


def test_failures_only_helpers(monkeypatch):
    monkeypatch.setattr(rate_limit, '_RATE_BUCKETS', {})
    for _ in range(20):
        ensure_failures_below('k', window_seconds=900, max_failures=6, message='x')  # successes never count
    for _ in range(6):
        register_failure('k', window_seconds=900)
    with pytest.raises(HTTPException) as exc:
        ensure_failures_below('k', window_seconds=900, max_failures=6, message='x')
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_courier_can_log_in_many_times(env, monkeypatch):
    monkeypatch.setattr(rate_limit, '_RATE_BUCKETS', {})
    client, *_ = env
    await assigned(env)
    for _ in range(10):
        await login(client)  # raises/asserts if refused
    for _ in range(6):
        r = await client.post(COURIER + '/pin-login', json={'pin': '0000'})
        assert r.status_code == 401
    r = await client.post(COURIER + '/pin-login', json={'pin': '0000'})
    assert r.status_code == 429
