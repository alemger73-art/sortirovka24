"""GPS address: OpenStreetMap's «Карагандинская городская администрация» is shown as plain «Караганда»."""
import pytest

from services import gastronom_delivery


class _Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {"address": {"road": "Локомотивная улица", "house_number": "82", "city": "Карагандинская городская администрация"}}


class _Client:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, *args, **kwargs):
        return _Response()


@pytest.mark.asyncio
async def test_city_administration_is_shown_as_karaganda(monkeypatch):
    monkeypatch.setattr(gastronom_delivery.httpx, "AsyncClient", _Client)
    label, city = await gastronom_delivery.reverse_geocode(49.97, 73.21)
    assert label == "Локомотивная улица 82, Караганда" and city == "Караганда"
