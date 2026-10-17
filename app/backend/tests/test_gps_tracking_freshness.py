from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import pytest
from models.logistics import CourierProfile, LogisticsTask
from services import logistics_tracking as service

@pytest.mark.parametrize('stamp', [None, 'broken', '2026-01-01T00:00:00',
    (datetime.now(timezone.utc)-timedelta(minutes=5)).isoformat(),
    (datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()])
async def test_stale_or_invalid_gps_is_not_live(stamp, monkeypatch):
    routing=AsyncMock()
    monkeypatch.setattr(service,'road_eta_minutes',routing)
    result=await service.build_task_tracking(LogisticsTask(status='on_the_way',dropoff_lat=0,dropoff_lng=0),
        CourierProfile(current_lat=0,current_lng=0,location_updated_at=stamp))
    assert result['courier_lat'] is None and result['eta_minutes'] is None
    routing.assert_not_awaited()

@pytest.mark.parametrize('target_lng', [0, None])
async def test_fresh_zero_coordinates_and_incomplete_destination(target_lng, monkeypatch):
    routing=AsyncMock(return_value=(5,100))
    monkeypatch.setattr(service,'road_eta_minutes',routing)
    result=await service.build_task_tracking(LogisticsTask(status='on_the_way',dropoff_lat=0,dropoff_lng=target_lng),
        CourierProfile(current_lat=0,current_lng=0,location_updated_at=datetime.now(timezone.utc).isoformat()))
    assert result['courier_lat']==0 and result['courier_lng']==0
    assert result['eta_minutes']==(5 if target_lng is not None else None)
    assert routing.await_count==(1 if target_lng is not None else 0)
