"""Live tracking for logistics tasks."""

from __future__ import annotations

from typing import Any, Dict, Optional

from models.logistics import CourierProfile, LogisticsTask
from services.taxi_routing import road_eta_minutes

STATUS_LABELS = {
    "pending": "Заказ принят. Готовится…",
    "ready": "Ищем курьера…",
    "assigned": "Курьер назначен",
    "picked_up": "Курьер забрал заказ",
    "on_the_way": "Курьер в пути",
    "delivered": "Доставлено",
    "cancelled": "Отменено",
}


async def build_task_tracking(
    task: LogisticsTask,
    courier: Optional[CourierProfile],
) -> Dict[str, Any]:
    tracking: Dict[str, Any] = {
        "courier_lat": None,
        "courier_lng": None,
        "eta_minutes": None,
        "eta_label": STATUS_LABELS.get(task.status, task.status),
        "phase": task.status,
    }

    if courier and courier.current_lat is not None and courier.current_lng is not None:
        tracking["courier_lat"] = courier.current_lat
        tracking["courier_lng"] = courier.current_lng

    if task.status in ("assigned", "picked_up", "on_the_way") and courier:
        target_lat = task.dropoff_lat if task.status in ("picked_up", "on_the_way") else task.pickup_lat
        target_lng = task.dropoff_lng if task.status in ("picked_up", "on_the_way") else task.pickup_lng
        if target_lat is not None and courier.current_lat is not None:
            eta, _ = await road_eta_minutes(courier.current_lat, courier.current_lng, target_lat, target_lng)
            tracking["eta_minutes"] = eta
            if task.status == "assigned":
                tracking["eta_label"] = f"Курьер едет за заказом · ~{eta} мин"
            else:
                tracking["eta_label"] = f"Курьер рядом · ~{eta} мин"

    return tracking
