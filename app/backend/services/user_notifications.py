"""
Personal cabinet notifications — in-app history + FCM push to user's devices.

Event categories and typical triggers:
- food: order accepted, confirmed, cancelled, delivered
- logistics: courier assigned, picked up, en route, delivered
- taxi: driver assigned, arrived, trip started, completed, cancelled
- store: order processing, ready/delivered, cancelled (gastronom/pharmacy/volna/prorab)
- bonus: points awarded or refunded
- master: request taken, completed; new request (to master); become-master approved/rejected
"""

from __future__ import annotations

import logging
from typing import Any

from models.auth import User
from models.user_notifications import UserNotification
from services.bonus_rewards import find_user_by_phone
from services.push_broadcast import broadcast_push
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

STORE_LABELS = {
    "gastronom": "Гастроном",
    "pharmacy": "Аптека",
    "volna": "VOLNA",
    "prorab": "Прораб",
    "park": "Фуд-парк",
}

STORE_PATHS = {
    "gastronom": "/gastronom",
    "pharmacy": "/apteka",
    "volna": "/volna",
    "prorab": "/prorab",
    "park": "/food/park",
}


async def send_user_notification(
    db: AsyncSession,
    *,
    user_id: str,
    category: str,
    event_key: str,
    title: str,
    body: str,
    path: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    push: bool = True,
) -> UserNotification | None:
    existing = (
        await db.execute(
            select(UserNotification).where(
                UserNotification.user_id == str(user_id),
                UserNotification.event_key == event_key,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    row = UserNotification(
        user_id=str(user_id),
        category=category,
        event_key=event_key,
        title=title.strip()[:255],
        body=(body or "").strip()[:2000] or None,
        path=path,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        is_read=False,
    )
    db.add(row)
    await db.flush()

    if push:
        try:
            data: dict[str, str] = {"path": path or "/cabinet?tab=notifications", "category": category}
            if entity_type:
                data["entity_type"] = entity_type
            if entity_id is not None:
                data["entity_id"] = str(entity_id)
            await broadcast_push(
                db,
                title=title,
                body=body,
                data=data,
                user_id=str(user_id),
            )
        except Exception as exc:
            logger.warning("[Notify] FCM push skipped: %s", exc)

    await db.commit()
    await db.refresh(row)
    return row


async def notify_user_by_phone(
    db: AsyncSession,
    *,
    phone: str | None,
    category: str,
    event_key: str,
    title: str,
    body: str,
    path: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    user = await find_user_by_phone(db, phone)
    if not user:
        return
    try:
        await send_user_notification(
            db,
            user_id=str(user.id),
            category=category,
            event_key=event_key,
            title=title,
            body=body,
            path=path,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    except Exception as exc:
        logger.warning("[Notify] by phone failed (%s): %s", event_key, exc)
        await db.rollback()


async def notify_user_by_id(
    db: AsyncSession,
    *,
    user_id: str | None,
    category: str,
    event_key: str,
    title: str,
    body: str,
    path: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    if not user_id:
        return
    try:
        await send_user_notification(
            db,
            user_id=str(user_id),
            category=category,
            event_key=event_key,
            title=title,
            body=body,
            path=path,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    except Exception as exc:
        logger.warning("[Notify] by id failed (%s): %s", event_key, exc)
        await db.rollback()


# ── Food (DAM ALEM) ──────────────────────────────────────────────────────────

FOOD_STATUS_MESSAGES: dict[str, tuple[str, str]] = {
    "confirmed": ("Заказ подтверждён", "Кухня приняла заказ и начала готовить"),
    "done": ("Заказ готов", "Можно забирать в ресторане"),
    "cancelled": ("Заказ отменён", "Если списали бонусы — они вернутся на баланс"),
}


async def notify_food_order_created(db: AsyncSession, order: Any) -> None:
    order_id = int(order.id)
    name = (getattr(order, "restaurant_name", None) or "DAM ALEM").strip()
    total = getattr(order, "total_amount", None)
    amount_txt = f" · {int(total):,} ₸".replace(",", " ") if total else ""
    await notify_user_by_phone(
        db,
        phone=getattr(order, "customer_phone", None),
        category="food",
        event_key=f"food:created:{order_id}",
        title="Заказ принят",
        body=f"{name} · заказ №{order_id}{amount_txt}",
        path=f"/cabinet/orders/food/{order_id}",
        entity_type="food_orders",
        entity_id=str(order_id),
    )


async def notify_food_order_status(db: AsyncSession, order: Any, old_status: str | None, new_status: str | None) -> None:
    if not new_status or new_status == old_status:
        return
    tpl = FOOD_STATUS_MESSAGES.get(new_status)
    if not tpl:
        return
    order_id = int(order.id)
    if new_status == "done" and getattr(order, "delivery_method", "delivery") != "pickup":
        return
    title, body = tpl
    name = (getattr(order, "restaurant_name", None) or "DAM ALEM").strip()
    await notify_user_by_phone(
        db,
        phone=getattr(order, "customer_phone", None),
        category="food",
        event_key=f"food:status:{order_id}:{new_status}",
        title=title,
        body=f"{name} · №{order_id}. {body}",
        path=f"/delivery/food/{order_id}" if new_status not in ("done", "cancelled") else f"/cabinet/orders/food/{order_id}",
        entity_type="food_orders",
        entity_id=str(order_id),
    )


# ── Logistics / courier ───────────────────────────────────────────────────────

LOGISTICS_STATUS_MESSAGES: dict[str, tuple[str, str]] = {
    "assigned": ("Курьер назначен", "Курьер едет за вашим заказом"),
    "picked_up": ("Заказ забран", "Курьер забрал заказ и скоро выедет к вам"),
    "on_the_way": ("Курьер в пути", "Скоро будем у вашего адреса"),
    "delivered": ("Доставлено!", "Приятного аппетита!"),
    "cancelled": ("Доставка отменена", "Свяжитесь с поддержкой, если нужна помощь"),
}


async def notify_logistics_task_status(db: AsyncSession, task: Any, old_status: str | None, new_status: str | None) -> None:
    if not new_status or new_status == old_status:
        return
    tpl = LOGISTICS_STATUS_MESSAGES.get(new_status)
    if not tpl:
        return
    title, body = tpl
    source_id = int(task.source_id)
    path = f"/delivery/food/{source_id}" if getattr(task, "vertical", "food") == "food" else "/cabinet?tab=orders"
    merchant = (getattr(task, "merchant_name", None) or "").strip()
    if merchant:
        body = f"{merchant}. {body}"
    await notify_user_by_phone(
        db,
        phone=getattr(task, "customer_phone", None),
        category="logistics",
        event_key=f"logistics:{task.id}:{new_status}",
        title=title,
        body=body,
        path=path,
        entity_type="logistics_tasks",
        entity_id=str(task.id),
    )


# ── Taxi ──────────────────────────────────────────────────────────────────────

TAXI_STATUS_MESSAGES: dict[str, tuple[str, str]] = {
    "accepted": ("Водитель назначен", "Машина уже едет к вам"),
    "driver_arrived": ("Водитель подъехал!", "Выходите — машина на месте"),
    "in_progress": ("Поездка началась", "Приятной дороги!"),
    "completed": ("Поездка завершена", "Спасибо! Можете оценить водителя"),
    "cancelled": ("Поездка отменена", "Закажите снова, когда будете готовы"),
}


async def notify_taxi_ride_status(db: AsyncSession, ride: Any, new_status: str) -> None:
    tpl = TAXI_STATUS_MESSAGES.get(new_status)
    if not tpl:
        return
    title, body = tpl
    ride_id = int(ride.id)
    dest = (getattr(ride, "to_address", None) or "").strip()
    if dest and new_status in ("accepted", "driver_arrived"):
        body = f"{body} · {dest[:80]}"
    await notify_user_by_id(
        db,
        user_id=getattr(ride, "user_id", None),
        category="taxi",
        event_key=f"taxi:{ride_id}:{new_status}",
        title=title,
        body=body,
        path=f"/taxi/ride/{ride_id}",
        entity_type="taxi_rides",
        entity_id=str(ride_id),
    )


# ── Store orders ──────────────────────────────────────────────────────────────

STORE_STATUS_MESSAGES: dict[str, tuple[str, str]] = {
    "processing": ("Заказ в обработке", "Магазин собирает ваш заказ"),
    "in_progress": ("Заказ в обработке", "Магазин собирает ваш заказ"),
    "done": ("Заказ готов", "Можно забирать или ждать доставку"),
    "completed": ("Заказ выполнен", "Спасибо за покупку!"),
    "delivered": ("Заказ доставлен", "Спасибо за покупку!"),
    "cancelled": ("Заказ отменён", "Оформите новый заказ в приложении"),
}


async def notify_store_order_status(
    db: AsyncSession,
    *,
    store_type: str,
    order: Any,
    new_status: str,
) -> None:
    tpl = STORE_STATUS_MESSAGES.get(new_status)
    if not tpl:
        return
    title, body = tpl
    order_id = int(order.id)
    label = STORE_LABELS.get(store_type, store_type)
    await notify_user_by_phone(
        db,
        phone=getattr(order, "customer_phone", None),
        category="store",
        event_key=f"store:{store_type}:{order_id}:{new_status}",
        title=f"{label}: {title}",
        body=body,
        path=f"/cabinet/orders/{store_type}/{order_id}",
        entity_type=f"{store_type}_orders",
        entity_id=str(order_id),
    )


async def notify_store_order_created(db: AsyncSession, *, store_type: str, order: Any) -> None:
    order_id = int(order.id)
    label = STORE_LABELS.get(store_type, store_type)
    total = getattr(order, "total_amount", None) or getattr(order, "total", None)
    amount_txt = f" · {int(total):,} ₸".replace(",", " ") if total else ""
    await notify_user_by_phone(
        db,
        phone=getattr(order, "customer_phone", None),
        category="store",
        event_key=f"store:{store_type}:created:{order_id}",
        title=f"{label}: заказ принят",
        body=f"Заказ №{order_id}{amount_txt}",
        path=f"/cabinet/orders/{store_type}/{order_id}",
        entity_type=f"{store_type}_orders",
        entity_id=str(order_id),
    )


# ── Master requests ───────────────────────────────────────────────────────────

async def _notify_masters_by_listings(
    db: AsyncSession,
    *,
    listings: list[Any],
    event_key_prefix: str,
    title: str,
    body: str,
    path: str,
    entity_type: str,
    entity_id: str,
) -> None:
    seen_users: set[str] = set()
    for listing in listings:
        user = await find_user_by_phone(db, getattr(listing, "phone", None))
        if not user or str(user.id) in seen_users:
            continue
        seen_users.add(str(user.id))
        try:
            await send_user_notification(
                db,
                user_id=str(user.id),
                category="master",
                event_key=f"{event_key_prefix}:{listing.id}",
                title=title,
                body=body,
                path=path,
                entity_type=entity_type,
                entity_id=entity_id,
            )
        except Exception as exc:
            logger.warning("[Notify] master listing push skipped (%s): %s", listing.id, exc)
            await db.rollback()


async def notify_new_master_request_to_masters(db: AsyncSession, request: Any) -> None:
    """Push to target master or all masters in the request category."""
    from models.masters import Masters
    from sqlalchemy import select

    req_id = int(request.id)
    category = (getattr(request, "category", None) or "Мастер").strip()
    problem = (getattr(request, "problem_description", None) or "").strip()
    body = category
    if problem:
        body = f"{category}. {problem[:100]}"
    master_id = getattr(request, "master_id", None)

    if master_id:
        listing = (
            await db.execute(select(Masters).where(Masters.id == int(master_id)))
        ).scalar_one_or_none()
        listings = [listing] if listing else []
    else:
        listings = list(
            (
                await db.execute(
                    select(Masters)
                    .where(Masters.category == category)
                    .order_by(Masters.verified.desc(), Masters.rating.desc())
                    .limit(50)
                )
            ).scalars().all()
        )

    await _notify_masters_by_listings(
        db,
        listings=listings,
        event_key_prefix=f"master:{req_id}:new",
        title="Новая заявка!",
        body=body,
        path="/cabinet/master",
        entity_type="master_requests",
        entity_id=str(req_id),
    )


async def notify_become_master_decision(db: AsyncSession, request: Any, status: str) -> None:
    if status == "approved":
        title = "Заявка одобрена!"
        body = "Добро пожаловать в каталог мастеров. Кабинет мастера уже доступен."
        path = "/cabinet/master"
    elif status == "rejected":
        title = "Заявка отклонена"
        body = "К сожалению, заявка не прошла модерацию. Можете подать повторно."
        path = "/masters/become"
    else:
        return
    req_id = int(request.id)
    category = (getattr(request, "category", None) or "Мастер").strip()
    await notify_user_by_phone(
        db,
        phone=getattr(request, "phone", None),
        category="master",
        event_key=f"become_master:{req_id}:{status}",
        title=title,
        body=f"{category}. {body}",
        path=path,
        entity_type="become_master_requests",
        entity_id=str(req_id),
    )


async def notify_master_request_status(db: AsyncSession, request: Any, new_status: str) -> None:
    if new_status == "in_progress":
        title, body = "Мастер взял заявку", "Скоро с вами свяжутся"
    elif new_status == "done":
        title, body = "Заявка выполнена", "Спасибо! Оставьте отзыв, если удобно"
    else:
        return
    req_id = int(request.id)
    category = (getattr(request, "category", None) or "Мастер").strip()
    await notify_user_by_phone(
        db,
        phone=getattr(request, "phone", None),
        category="master",
        event_key=f"master:{req_id}:{new_status}",
        title=title,
        body=f"{category}. {body}",
        path="/cabinet?tab=masterRequests",
        entity_type="master_requests",
        entity_id=str(req_id),
    )


# ── Bonuses ───────────────────────────────────────────────────────────────────

async def notify_bonus_awarded(db: AsyncSession, *, user_id: str, points: float, food_order_id: int) -> None:
    pts = int(points)
    await notify_user_by_id(
        db,
        user_id=user_id,
        category="bonus",
        event_key=f"bonus:award:food:{food_order_id}",
        title=f"+{pts} бонусов",
        body=f"Начислено за доставленный заказ еды №{food_order_id}",
        path="/cabinet?tab=bonuses",
        entity_type="food_orders",
        entity_id=str(food_order_id),
    )


async def notify_bonus_refunded(db: AsyncSession, *, user_id: str, points: float, food_order_id: int) -> None:
    pts = int(points)
    await notify_user_by_id(
        db,
        user_id=user_id,
        category="bonus",
        event_key=f"bonus:refund:food:{food_order_id}",
        title=f"Возврат {pts} бонусов",
        body=f"Бонусы вернулись после отмены заказа №{food_order_id}",
        path="/cabinet?tab=bonuses",
        entity_type="food_orders",
        entity_id=str(food_order_id),
    )


# ── Inbox API helpers ─────────────────────────────────────────────────────────

async def list_user_notifications(
    db: AsyncSession,
    user_id: str,
    *,
    limit: int = 50,
    unread_only: bool = False,
) -> list[UserNotification]:
    q = select(UserNotification).where(UserNotification.user_id == str(user_id))
    if unread_only:
        q = q.where(UserNotification.is_read.is_(False))
    q = q.order_by(UserNotification.id.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def unread_notification_count(db: AsyncSession, user_id: str) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(UserNotification)
            .where(UserNotification.user_id == str(user_id), UserNotification.is_read.is_(False))
        )
        or 0
    )


async def mark_notification_read(db: AsyncSession, user_id: str, notification_id: int) -> bool:
    result = await db.execute(
        update(UserNotification)
        .where(UserNotification.id == notification_id, UserNotification.user_id == str(user_id))
        .values(is_read=True)
    )
    await db.commit()
    return result.rowcount > 0


async def mark_all_notifications_read(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        update(UserNotification)
        .where(UserNotification.user_id == str(user_id), UserNotification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return int(result.rowcount or 0)
