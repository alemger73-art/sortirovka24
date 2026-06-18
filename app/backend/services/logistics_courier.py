"""Courier applications and access control."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from models.auth import User
from models.logistics import CourierApplication, CourierProfile
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

VALID_VEHICLE_TYPES = {"bike", "car", "foot"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _courier_docs_complete(
    *,
    vehicle_type: str,
    photo_url: Optional[str],
    id_photo_url: Optional[str],
    vehicle_photo_url: Optional[str],
) -> bool:
    if not (photo_url and id_photo_url):
        return False
    if vehicle_type in {"bike", "car"} and not vehicle_photo_url:
        return False
    return True


def application_to_dict(app: CourierApplication, user: Optional[User] = None) -> Dict[str, Any]:
    return {
        "user_id": app.user_id,
        "full_name": app.full_name,
        "phone": app.phone,
        "vehicle_type": app.vehicle_type,
        "vehicle_plate": app.vehicle_plate,
        "comment": app.comment,
        "photo_url": app.photo_url,
        "id_photo_url": app.id_photo_url,
        "vehicle_photo_url": app.vehicle_photo_url,
        "status": app.status,
        "admin_note": app.admin_note,
        "reviewed_at": app.reviewed_at,
        "created_at": app.created_at.isoformat() if app.created_at else None,
        "account_name": user.name if user else "",
        "account_phone": user.phone if user else "",
    }


async def get_courier_profile(db: AsyncSession, user_id: str) -> Optional[CourierProfile]:
    return (
        await db.execute(select(CourierProfile).where(CourierProfile.user_id == user_id))
    ).scalar_one_or_none()


async def get_user_courier_application(db: AsyncSession, user_id: str) -> Optional[CourierApplication]:
    return (
        await db.execute(select(CourierApplication).where(CourierApplication.user_id == user_id))
    ).scalar_one_or_none()


async def user_can_access_courier_cabinet(db: AsyncSession, user: User) -> bool:
    if user.role in {"admin", "superadmin"}:
        return True
    profile = await get_courier_profile(db, str(user.id))
    return bool(profile and profile.is_verified)


async def assert_courier_cabinet_access(db: AsyncSession, user: User) -> CourierProfile:
    if user.role in {"admin", "superadmin"}:
        profile = await get_courier_profile(db, str(user.id))
        if profile:
            return profile
        profile = CourierProfile(
            user_id=str(user.id),
            phone=user.phone,
            is_online=False,
            is_verified=True,
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
        return profile

    profile = await get_courier_profile(db, str(user.id))
    if not profile or not profile.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Кабинет курьера доступен после одобрения заявки. Подайте заявку на /delivery/courier",
        )
    return profile


async def courier_access_info(db: AsyncSession, user: User) -> Dict[str, Any]:
    app = await get_user_courier_application(db, str(user.id))
    profile = await get_courier_profile(db, str(user.id))
    is_courier = bool(profile and profile.is_verified) or user.role in {"admin", "superadmin"}
    can_access = await user_can_access_courier_cabinet(db, user)
    status = app.status if app else ("approved" if is_courier else "none")
    return {
        "status": status,
        "is_courier": is_courier,
        "can_access_cabinet": can_access,
        "application": application_to_dict(app, user) if app else None,
    }


async def submit_courier_application(
    db: AsyncSession,
    user: User,
    *,
    full_name: str,
    phone: str,
    vehicle_type: str,
    vehicle_plate: str = "",
    comment: str = "",
    photo_url: str = "",
    id_photo_url: str = "",
    vehicle_photo_url: str = "",
) -> CourierApplication:
    profile = await get_courier_profile(db, str(user.id))
    if profile and profile.is_verified:
        raise ValueError("Вы уже подключены как курьер")

    vtype = (vehicle_type or "bike").lower()
    if vtype not in VALID_VEHICLE_TYPES:
        raise ValueError("Укажите тип транспорта: велосипед, авто или пешком")

    if not _courier_docs_complete(
        vehicle_type=vtype,
        photo_url=photo_url,
        id_photo_url=id_photo_url,
        vehicle_photo_url=vehicle_photo_url,
    ):
        if vtype == "foot":
            raise ValueError("Загрузите ваше фото и удостоверение личности")
        raise ValueError("Загрузите фото, удостоверение и фото транспорта")

    if vtype == "car" and not vehicle_plate.strip():
        raise ValueError("Укажите госномер автомобиля")

    existing = await get_user_courier_application(db, str(user.id))
    if existing and existing.status == "pending":
        raise ValueError("Заявка уже на рассмотрении")
    if existing and existing.status == "approved":
        raise ValueError("Заявка уже одобрена")

    data = {
        "full_name": full_name.strip(),
        "phone": phone.strip(),
        "vehicle_type": vtype,
        "vehicle_plate": vehicle_plate.strip() or None,
        "comment": comment.strip() or None,
        "photo_url": photo_url.strip() or None,
        "id_photo_url": id_photo_url.strip() or None,
        "vehicle_photo_url": vehicle_photo_url.strip() or None,
        "status": "pending",
        "admin_note": None,
        "reviewed_at": None,
    }
    if existing:
        for key, value in data.items():
            setattr(existing, key, value)
        app = existing
    else:
        app = CourierApplication(user_id=str(user.id), **data)
        db.add(app)
    await db.commit()
    await db.refresh(app)
    return app


async def list_courier_applications(db: AsyncSession, status: Optional[str] = None) -> List[CourierApplication]:
    q = select(CourierApplication).order_by(desc(CourierApplication.id))
    if status:
        q = q.where(CourierApplication.status == status)
    return (await db.execute(q)).scalars().all()


async def approve_courier_application(
    db: AsyncSession,
    user_id: str,
    admin_note: str = "",
) -> CourierProfile:
    app = await get_user_courier_application(db, user_id)
    if not app:
        raise ValueError("Заявка не найдена")
    if app.status != "pending":
        raise ValueError("Заявка уже обработана")

    if not _courier_docs_complete(
        vehicle_type=app.vehicle_type or "bike",
        photo_url=app.photo_url,
        id_photo_url=app.id_photo_url,
        vehicle_photo_url=app.vehicle_photo_url,
    ):
        raise ValueError("В заявке не хватает документов")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise ValueError("Пользователь не найден")

    profile = await get_courier_profile(db, user_id)
    if not profile:
        profile = CourierProfile(user_id=user_id)
        db.add(profile)

    profile.is_verified = True
    profile.is_online = False
    profile.phone = app.phone or user.phone
    profile.vehicle_type = app.vehicle_type or "bike"
    profile.vehicle_plate = app.vehicle_plate
    profile.photo_url = app.photo_url
    profile.id_photo_url = app.id_photo_url
    profile.vehicle_photo_url = app.vehicle_photo_url

    if user.role == "user":
        user.role = "courier"

    app.status = "approved"
    app.admin_note = admin_note.strip() or None
    app.reviewed_at = _now_iso()

    await db.commit()
    await db.refresh(profile)
    return profile


async def reject_courier_application(
    db: AsyncSession,
    user_id: str,
    admin_note: str = "",
) -> CourierApplication:
    app = await get_user_courier_application(db, user_id)
    if not app:
        raise ValueError("Заявка не найдена")
    if app.status != "pending":
        raise ValueError("Заявка уже обработана")
    app.status = "rejected"
    app.admin_note = admin_note.strip() or None
    app.reviewed_at = _now_iso()
    await db.commit()
    await db.refresh(app)
    return app
