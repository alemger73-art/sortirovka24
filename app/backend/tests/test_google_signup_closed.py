import asyncio
import pytest
from routers import account_v2


def test_google_signup_closed_by_default(monkeypatch):
    monkeypatch.delenv("GOOGLE_SIGNUP_ENABLED", raising=False)
    assert account_v2._google_signup_enabled() is False

    class Result:
        def scalar_one_or_none(self): return None

    class DB:
        async def execute(self, *a, **k): return Result()

    with pytest.raises(account_v2.GoogleOAuthError) as err:
        asyncio.run(account_v2._get_or_create_google_user(DB(), google_sub="g1", email="new@example.com",
            name="New", avatar=None, agreements_accepted=True))
    assert "Регистрация через Google закрыта" in str(err.value)
