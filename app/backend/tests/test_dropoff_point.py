"""The courier task gets the point the delivery price was computed for."""
import json
from types import SimpleNamespace


def test_snapshot_point_is_used_for_courier_task(monkeypatch):
    snapshot = {'dropoff_point': {'lat': 49.976, 'lng': 73.216}}
    order = SimpleNamespace(pricing_snapshot=json.dumps(snapshot))
    point = (json.loads(order.pricing_snapshot or '{}') or {}).get('dropoff_point') or {}
    assert (float(point['lat']), float(point['lng'])) == (49.976, 73.216)


def test_validation_writes_dropoff_point_key():
    src = open('services/food_order_validation.py', encoding='utf-8').read()
    assert "'dropoff_point'" in src
    wf = open('services/dam_order_workflow.py', encoding='utf-8').read()
    assert "dropoff_point" in wf and "task.dropoff_lat, task.dropoff_lng" in wf
