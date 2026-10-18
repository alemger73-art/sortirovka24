"""Release 1.2: a customer point inside a zone is used when the geocoder cannot find the address."""
import json
import pytest
from fastapi import HTTPException
import services.food_order_validation as v

ZONE = [{"id": "z1", "name": "Сортировка", "price": 500, "courier_payout": 600,
         "polygon": [[49.98, 73.20], [49.98, 73.23], [49.96, 73.23], [49.96, 73.20]]}]
SETTINGS = {"delivery_zones": json.dumps(ZONE, ensure_ascii=False)}


@pytest.mark.asyncio
async def test_point_in_zone_used_when_geocoder_fails(monkeypatch):
    async def none(*a, **k): return None
    monkeypatch.setattr(v, 'geocode_address', none)
    assert await v._resolve_trusted_delivery_coords(SETTINGS, 'мкр. Сортировка, дом 5', 49.97, 73.215, require_server_geocode=True) == (49.97, 73.215)


@pytest.mark.asyncio
async def test_point_outside_zone_still_refused(monkeypatch):
    async def none(*a, **k): return None
    monkeypatch.setattr(v, 'geocode_address', none)
    with pytest.raises(HTTPException):
        await v._resolve_trusted_delivery_coords(SETTINGS, 'где-то далеко 1', 49.80, 73.09, require_server_geocode=True)


@pytest.mark.asyncio
async def test_gps_preferred_when_close_to_geocode(monkeypatch):
    async def near(*a, **k): return (49.9705, 73.2155)
    monkeypatch.setattr(v, 'geocode_address', near)
    assert await v._resolve_trusted_delivery_coords(SETTINGS, 'ул. Деповская 12', 49.97, 73.215, require_server_geocode=True) == (49.97, 73.215)


@pytest.mark.asyncio
async def test_far_gps_ignored_in_favour_of_geocode(monkeypatch):
    async def far(*a, **k): return (49.90, 73.10)
    monkeypatch.setattr(v, 'geocode_address', far)
    assert await v._resolve_trusted_delivery_coords(SETTINGS, 'ул. Ермекова 58', 49.97, 73.215, require_server_geocode=True) == (49.90, 73.10)
