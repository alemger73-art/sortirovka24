from unittest.mock import AsyncMock

import pytest

from services import gastronom_delivery


@pytest.mark.asyncio
async def test_geocode_ignores_remote_first_match(monkeypatch):
    remote = (49.1475092, 56.4753203)
    local = (49.8365, 73.0850)
    search = AsyncMock(side_effect=[remote, local])
    monkeypatch.setattr(gastronom_delivery, "_nominatim_search", search)

    result = await gastronom_delivery.geocode_address("Локомотивная 13")

    assert result == local
    assert search.await_count == 2


@pytest.mark.asyncio
async def test_geocode_returns_none_when_only_match_is_remote(monkeypatch):
    remote = (49.1475092, 56.4753203)
    monkeypatch.setattr(
        gastronom_delivery,
        "_nominatim_search",
        AsyncMock(return_value=remote),
    )

    result = await gastronom_delivery.geocode_address("Несуществующая 999")

    assert result is None
