import uuid
from datetime import datetime, timezone

from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from models.account_system import (
    AccountAuditLog,
    AccountBonus,
    AccountFavorite,
    AccountNotification,
    AccountOrderHistory,
    AccountPaymentHistory,
    AccountRideHistory,
    AccountUser,
    DriverProfile,
    FeatureToggle,
    MasterProfile,
    MasterRequest,
    MasterReview,
    PartnerOrder,
    PartnerProduct,
    PartnerProfile,
)
from models.announcements import Announcements
from models.complaints import Complaints
from models.news import News
from schemas.account_system import (
    AccountProfileResponse,
    AuthTokenResponse,
    CabinetResponse,
    CreateFavoriteRequest,
    FeatureToggleRequest,
    GenericRow,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserRoleUpdateRequest,
)
from schemas.auth import UserResponse
from schemas.storage import FileUpDownResponse
from schemas.storage import FileUpDownRequest
from services.account_system import (
    build_token_for_user,
    create_user,
    ensure_default_feature_toggles,
    is_admin_role,
    is_superadmin,
    login_user,
    seed_demo_cabinet_rows,
    to_generic_rows,
    write_audit_log,
)
from services.storage import StorageService
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])


def _profile_from_user(user: AccountUser) -> AccountProfileResponse:
    return AccountProfileResponse(
        id=user.id,
        email=user.email,
        phone=user.phone,
        full_name=user.full_name,
        role=user.role,  # type: ignore[arg-type]
        avatar_url=user.avatar_url,
        is_active=bool(user.is_active),
        accepted_agreement=bool(user.accepted_agreement),
        accepted_privacy=bool(user.accepted_privacy),
        accepted_at=user.accepted_at,
        last_login_at=user.last_login_at,
    )


async def _get_account_user(db: AsyncSession, current_user: UserResponse) -> AccountUser:
    result = await db.execute(select(AccountUser).where(AccountUser.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account user not found")
    return user


@router.post("/register", response_model=AuthTokenResponse)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not request.email and not request.phone:
        raise HTTPException(status_code=400, detail="Either email or phone must be provided")
    try:
        user = await create_user(
            db=db,
            email=request.email,
            phone=request.phone,
            password=request.password,
            role=request.role,
            full_name=request.full_name,
            accepted_agreement=request.accepted_agreement,
            accepted_privacy=request.accepted_privacy,
        )
        await ensure_default_feature_toggles(db)
        token = build_token_for_user(user)
        await write_audit_log(db, user.id, "register", "account_users", user.id)
        return AuthTokenResponse(token=token, user_id=user.id, role=user.role)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/login", response_model=AuthTokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await login_user(db, request.identifier.strip(), request.password)
        token = build_token_for_user(user)
        await write_audit_log(db, user.id, "login", "account_users", user.id)
        return AuthTokenResponse(token=token, user_id=user.id, role=user.role)  # type: ignore[arg-type]
    except PermissionError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@router.get("/me/profile", response_model=AccountProfileResponse)
async def get_my_profile(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user = await _get_account_user(db, current_user)
    return _profile_from_user(user)


@router.put("/me/profile", response_model=AccountProfileResponse)
async def update_my_profile(
    request: UpdateProfileRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_account_user(db, current_user)
    if request.full_name is not None:
        user.full_name = request.full_name.strip()
    if request.avatar_url is not None:
        user.avatar_url = request.avatar_url.strip()
    await db.commit()
    await write_audit_log(db, user.id, "profile_update", "account_users", user.id)
    return _profile_from_user(user)


@router.post("/me/avatar-upload-url", response_model=FileUpDownResponse)
async def create_avatar_upload_url(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_account_user(db, current_user)
    object_key = f"avatars/{user.id}-{uuid.uuid4()}.jpg"
    service = StorageService()
    result = await service.create_upload_url(request=FileUpDownRequest(bucket_name="portal-images", object_key=object_key))
    return result


@router.get("/me/cabinet", response_model=CabinetResponse)
async def my_cabinet(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user = await _get_account_user(db, current_user)
    await seed_demo_cabinet_rows(db, user.id)

    orders = (await db.execute(select(AccountOrderHistory).where(AccountOrderHistory.user_id == user.id).order_by(desc(AccountOrderHistory.id)))).scalars().all()
    rides = (await db.execute(select(AccountRideHistory).where(AccountRideHistory.user_id == user.id).order_by(desc(AccountRideHistory.id)))).scalars().all()
    favorites = (await db.execute(select(AccountFavorite).where(AccountFavorite.user_id == user.id).order_by(desc(AccountFavorite.id)))).scalars().all()
    bonuses = (await db.execute(select(AccountBonus).where(AccountBonus.user_id == user.id).order_by(desc(AccountBonus.id)))).scalars().all()
    notifications = (await db.execute(select(AccountNotification).where(AccountNotification.user_id == user.id).order_by(desc(AccountNotification.id)))).scalars().all()
    payments = (await db.execute(select(AccountPaymentHistory).where(AccountPaymentHistory.user_id == user.id).order_by(desc(AccountPaymentHistory.id)))).scalars().all()

    # legacy entities by phone or email match for quick personal cabinet visibility
    announcements = (
        await db.execute(
            select(Announcements).where(
                (Announcements.phone == (user.phone or "")) | (Announcements.author_name == (user.full_name or ""))
            ).order_by(desc(Announcements.id))
        )
    ).scalars().all()
    complaints = (
        await db.execute(
            select(Complaints).where(
                (Complaints.phone == (user.phone or "")) | (Complaints.author_name == (user.full_name or ""))
            ).order_by(desc(Complaints.id))
        )
    ).scalars().all()

    return CabinetResponse(
        profile=_profile_from_user(user),
        orders_history=[GenericRow(**r) for r in to_generic_rows(orders, "details", "order_type")],
        rides_history=[GenericRow(**r) for r in to_generic_rows(rides, "to_address", "from_address")],
        announcements=[GenericRow(**r) for r in to_generic_rows(announcements, "title", "description")],
        complaints=[GenericRow(**r) for r in to_generic_rows(complaints, "description", "address")],
        favorites=[GenericRow(id=str(f.id), title=f"{f.entity_type}:{f.entity_id}") for f in favorites],
        bonuses=[GenericRow(id=str(b.id), title=b.reason or "Bonus", amount=float(b.points)) for b in bonuses],
        notifications=[GenericRow(id=str(n.id), title=n.title, subtitle=n.body, status="read" if n.is_read else "new") for n in notifications],
        payment_history=[GenericRow(id=str(p.id), title=f"{p.provider or 'payment'}", status=p.status, amount=float(p.amount)) for p in payments],
    )


@router.post("/me/favorites")
async def add_favorite(
    request: CreateFavoriteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_account_user(db, current_user)
    db.add(
        AccountFavorite(
            user_id=user.id,
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    )
    await db.commit()
    return {"success": True}


@router.get("/master/cabinet")
async def master_cabinet(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user = await _get_account_user(db, current_user)
    if user.role not in {"master", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Master role required")
    profile = (await db.execute(select(MasterProfile).where(MasterProfile.user_id == user.id))).scalar_one_or_none()
    requests = (await db.execute(select(MasterRequest).where(MasterRequest.master_user_id == user.id).order_by(desc(MasterRequest.id)))).scalars().all()
    reviews = (await db.execute(select(MasterReview).where(MasterReview.master_user_id == user.id).order_by(desc(MasterReview.id)))).scalars().all()
    return {
        "profile": {
            "bio": profile.bio if profile else "",
            "service_categories": (profile.service_categories.split(",") if profile and profile.service_categories else []),
            "work_photos": (profile.work_photos.split(",") if profile and profile.work_photos else []),
            "avg_rating": profile.avg_rating if profile else 0,
            "reviews_count": profile.reviews_count if profile else 0,
        },
        "requests": [{"id": r.id, "title": r.title, "status": r.status} for r in requests],
        "reviews": [{"id": r.id, "rating": r.rating, "comment": r.comment} for r in reviews],
        "stats": {
            "requests_total": len(requests),
            "reviews_total": len(reviews),
            "avg_rating": (sum([r.rating for r in reviews]) / len(reviews)) if reviews else 0,
        },
    }


@router.get("/driver/cabinet")
async def driver_cabinet(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user = await _get_account_user(db, current_user)
    if user.role not in {"driver", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Driver role required")
    profile = (await db.execute(select(DriverProfile).where(DriverProfile.user_id == user.id))).scalar_one_or_none()
    rides = (await db.execute(select(AccountRideHistory).where(AccountRideHistory.driver_id == user.id).order_by(desc(AccountRideHistory.id)))).scalars().all()
    return {
        "profile": {
            "online": bool(profile.is_online) if profile else False,
            "car_info": {
                "make": profile.car_make if profile else "",
                "model": profile.car_model if profile else "",
                "number": profile.car_number if profile else "",
            },
            "verification_docs": (profile.verification_docs.split(",") if profile and profile.verification_docs else []),
        },
        "available_orders": [{"id": r.id, "from": r.from_address, "to": r.to_address, "price": r.price} for r in rides if r.status in {"new", "pending"}],
        "order_history": [{"id": r.id, "from": r.from_address, "to": r.to_address, "status": r.status, "price": r.price} for r in rides],
        "earnings": sum([float(r.price or 0) for r in rides if r.status == "completed"]),
    }


@router.get("/partner/cabinet")
async def partner_cabinet(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user = await _get_account_user(db, current_user)
    if user.role not in {"partner", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Partner role required")
    profile = (await db.execute(select(PartnerProfile).where(PartnerProfile.user_id == user.id))).scalar_one_or_none()
    products = (await db.execute(select(PartnerProduct).where(PartnerProduct.partner_user_id == user.id).order_by(desc(PartnerProduct.id)))).scalars().all()
    orders = (await db.execute(select(PartnerOrder).where(PartnerOrder.partner_user_id == user.id).order_by(desc(PartnerOrder.id)))).scalars().all()
    return {
        "shop_profile": {
            "shop_name": profile.shop_name if profile else "",
            "shop_description": profile.shop_description if profile else "",
            "logo_url": profile.logo_url if profile else "",
            "banners": (profile.banner_urls.split(",") if profile and profile.banner_urls else []),
        },
        "products": [{"id": p.id, "title": p.title, "price": p.price, "active": p.is_active} for p in products],
        "orders": [{"id": o.id, "status": o.status, "total": o.total_amount} for o in orders],
        "analytics": {"products_total": len(products), "orders_total": len(orders), "revenue": sum([float(o.total_amount or 0) for o in orders])},
    }


def _assert_admin(user: AccountUser):
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Admin role required")


@router.get("/admin/users")
async def admin_users(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    users = (await db.execute(select(AccountUser).order_by(desc(AccountUser.created_at)).limit(300))).scalars().all()
    return [{"id": u.id, "email": u.email, "phone": u.phone, "role": u.role, "active": u.is_active, "name": u.full_name} for u in users]


@router.put("/admin/users/{user_id}/role")
async def admin_update_user_role(
    user_id: str,
    request: UserRoleUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    if request.role == "superadmin" and not is_superadmin(me.role):
        raise HTTPException(status_code=403, detail="Only superadmin can assign superadmin role")
    target = (await db.execute(select(AccountUser).where(AccountUser.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.role = request.role
    if request.is_active is not None:
        target.is_active = request.is_active
    await db.commit()
    await write_audit_log(db, me.id, "admin_update_user_role", "account_users", user_id, {"role": request.role, "is_active": request.is_active})
    return {"success": True}


@router.get("/admin/moderation")
async def admin_moderation(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    ads = (await db.execute(select(Announcements).order_by(desc(Announcements.id)).limit(50))).scalars().all()
    complaints = (await db.execute(select(Complaints).order_by(desc(Complaints.id)).limit(50))).scalars().all()
    news = (await db.execute(select(News).order_by(desc(News.id)).limit(50))).scalars().all()
    return {
        "ads": [{"id": a.id, "title": a.title, "status": a.status} for a in ads],
        "complaints": [{"id": c.id, "category": c.category, "status": c.status} for c in complaints],
        "news": [{"id": n.id, "title": n.title, "status": n.status} for n in news],
    }


@router.get("/admin/payments")
async def admin_payments(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    items = (await db.execute(select(AccountPaymentHistory).order_by(desc(AccountPaymentHistory.id)).limit(200))).scalars().all()
    return [{"id": p.id, "user_id": p.user_id, "amount": p.amount, "status": p.status, "provider": p.provider, "created_at": p.created_at} for p in items]


@router.get("/admin/bonuses")
async def admin_bonuses(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    rows = (await db.execute(select(AccountBonus).order_by(desc(AccountBonus.id)).limit(200))).scalars().all()
    return [{"id": b.id, "user_id": b.user_id, "points": b.points, "reason": b.reason, "created_at": b.created_at} for b in rows]


@router.get("/admin/feature-toggles")
async def admin_feature_toggles(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    await ensure_default_feature_toggles(db)
    rows = (await db.execute(select(FeatureToggle).order_by(FeatureToggle.key))).scalars().all()
    return [{"key": r.key, "enabled": r.enabled, "description": r.description, "updated_by": r.updated_by, "updated_at": r.updated_at} for r in rows]


@router.put("/admin/feature-toggles")
async def admin_upsert_feature_toggle(
    request: FeatureToggleRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    row = (await db.execute(select(FeatureToggle).where(FeatureToggle.key == request.key))).scalar_one_or_none()
    now = datetime.now(timezone.utc).isoformat()
    if not row:
        row = FeatureToggle(key=request.key, enabled=request.enabled, description=request.description, updated_by=me.id, updated_at=now, created_at=now)
        db.add(row)
    else:
        row.enabled = request.enabled
        row.description = request.description
        row.updated_by = me.id
        row.updated_at = now
    await db.commit()
    await write_audit_log(db, me.id, "feature_toggle_upsert", "feature_toggles", request.key, {"enabled": request.enabled})
    return {"success": True}


@router.get("/admin/logs")
async def admin_logs(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    me = await _get_account_user(db, current_user)
    _assert_admin(me)
    rows = (await db.execute(select(AccountAuditLog).order_by(desc(AccountAuditLog.id)).limit(300))).scalars().all()
    return [{"id": r.id, "actor_user_id": r.actor_user_id, "action": r.action, "target_type": r.target_type, "target_id": r.target_id, "meta": r.meta, "created_at": r.created_at} for r in rows]
