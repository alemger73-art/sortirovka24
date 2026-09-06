"""Push alerts to admin panel devices (APK + web toast via polling)."""

from __future__ import annotations

import logging

from services.push_broadcast import ADMIN_DEVICE_USER_ID, broadcast_push

logger = logging.getLogger(__name__)

# Admin deep-link tab ids (used in /admin?tab=…)
TAB_MASTER_REQUESTS = "master-requests"
TAB_BECOME_MASTER = "become-master"
TAB_ANNOUNCEMENTS = "announcements"
TAB_COMPLAINTS = "complaints"
TAB_BUSINESS = "partners-business"
TAB_FOOD = "dam-alem"
TAB_REAL_ESTATE = "real-estate"
TAB_JOBS = "jobs"
TAB_TAXI = "taxi"
TAB_LOGISTICS = "logistics"


def _admin_path(tab: str) -> str:
    return f"/admin?tab={tab}"


async def notify_admin_operators(
    db,
    *,
    title: str,
    body: str,
    tab: str,
) -> None:
    """Send FCM to devices registered via /push/register-admin."""
    try:
        from services.admin_event_hub import admin_event_hub

        admin_event_hub.request_refresh(f"push:{tab}")
    except Exception:
        pass
    try:
        result = await broadcast_push(
            db,
            title=title[:120],
            body=body[:500],
            data={"path": _admin_path(tab), "admin_tab": tab},
            user_id=ADMIN_DEVICE_USER_ID,
        )
        if result.get("total", 0):
            logger.info("Admin push sent tab=%s result=%s", tab, result)
    except Exception as exc:
        logger.warning("Admin push failed tab=%s: %s", tab, exc)


async def alert_new_master_request(db, data: dict) -> None:
    category = (data.get("category") or "мастер").strip()
    await notify_admin_operators(
        db,
        title="Новая заявка на мастера",
        body=f"{category}: {(data.get('problem_description') or '')[:80]}".strip(),
        tab=TAB_MASTER_REQUESTS,
    )


async def alert_new_become_master(db, data: dict) -> None:
    name = (data.get("name") or "Мастер").strip()
    category = (data.get("category") or "").strip()
    await notify_admin_operators(
        db,
        title="Заявка «Стать мастером»",
        body=f"{name} · {category}".strip(" ·"),
        tab=TAB_BECOME_MASTER,
    )


async def alert_new_complaint(db, data: dict) -> None:
    await notify_admin_operators(
        db,
        title="Новая жалоба",
        body=f"{(data.get('category') or 'Жалоба')}: {(data.get('description') or '')[:80]}".strip(),
        tab=TAB_COMPLAINTS,
    )


async def alert_new_announcement(db, data: dict) -> None:
    await notify_admin_operators(
        db,
        title="Объявление на модерации",
        body=(data.get("title") or data.get("description") or "Новое объявление")[:120],
        tab=TAB_ANNOUNCEMENTS,
    )


async def alert_new_business_partner(db, data: dict) -> None:
    await notify_admin_operators(
        db,
        title="Заявка партнёра",
        body=f"{data.get('name', '')} · {data.get('activity', '')}".strip(" ·"),
        tab=TAB_BUSINESS,
    )


async def alert_new_food_order(db, order) -> None:
    restaurant = getattr(order, "restaurant_name", None) or "DAM ALEM 2.0"
    total = getattr(order, "total_amount", None)
    amount = f" · {total:.0f} ₸" if total else ""
    await notify_admin_operators(
        db,
        title="Новый заказ еды",
        body=f"{restaurant}{amount}",
        tab=TAB_FOOD,
    )
