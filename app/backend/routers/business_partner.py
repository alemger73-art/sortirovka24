"""Public business partner application form + admin moderation."""

import logging
from datetime import datetime, timezone

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models.business_partner_requests import Business_partner_requests
from pydantic import BaseModel, Field
from services.telegram import notify_new_business_partner
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.phone import normalize_phone
from utils.rate_limit import check_ip_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/business", tags=["business"])


class BusinessApplyRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=10, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    activity: str = Field(..., min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=2000)


class BusinessApplyResponse(BaseModel):
    success: bool
    message: str
    id: int | None = None


class BusinessPartnerItem(BaseModel):
    id: int
    name: str
    phone: str
    whatsapp: str | None = None
    activity: str
    description: str | None = None
    status: str | None = None
    created_at: str | None = None


class BusinessPartnerListResponse(BaseModel):
    items: list[BusinessPartnerItem]
    total: int


class BusinessPartnerUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(new|in_progress|done|rejected)$")


@router.post("/apply", response_model=BusinessApplyResponse)
async def apply_for_partnership(
    body: BusinessApplyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    check_ip_rate_limit(
        request,
        key_prefix="business_apply",
        max_hits=5,
        window_seconds=3600,
        message="Слишком много заявок с вашего IP. Попробуйте позже.",
    )

    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone")

    whatsapp = normalize_phone(body.whatsapp) if body.whatsapp else None
    now = datetime.now(timezone.utc).isoformat()

    row = Business_partner_requests(
        name=body.name.strip(),
        phone=phone,
        whatsapp=whatsapp,
        activity=body.activity.strip(),
        description=(body.description or "").strip() or None,
        status="new",
        created_at=now,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    payload = {
        "id": row.id,
        "name": row.name,
        "phone": row.phone,
        "whatsapp": row.whatsapp or row.phone,
        "activity": row.activity,
        "description": row.description or "",
    }

    try:
        await notify_new_business_partner(payload)
    except Exception as exc:
        logger.warning("Business partner Telegram notify failed: %s", exc)

    try:
        from services.admin_alerts import alert_new_business_partner

        await alert_new_business_partner(db, payload)
    except Exception as exc:
        logger.warning("Business partner admin push failed: %s", exc)

    return BusinessApplyResponse(
        success=True,
        message="Заявка принята. Мы свяжемся с вами в ближайшее время.",
        id=row.id,
    )


def _to_item(row: Business_partner_requests) -> BusinessPartnerItem:
    return BusinessPartnerItem(
        id=row.id,
        name=row.name or "",
        phone=row.phone or "",
        whatsapp=row.whatsapp,
        activity=row.activity or "",
        description=row.description,
        status=row.status,
        created_at=row.created_at,
    )


@router.get("/admin/requests", response_model=BusinessPartnerListResponse)
async def admin_list_partner_requests(
    request: Request,
    status: str | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    require_panel_admin(request)
    query = select(Business_partner_requests).order_by(desc(Business_partner_requests.id)).limit(min(limit, 500))
    if status and status != "all":
        if status == "new":
            query = query.where(
                or_(
                    Business_partner_requests.status.is_(None),
                    Business_partner_requests.status == "new",
                )
            )
        else:
            query = query.where(Business_partner_requests.status == status)
    rows = (await db.execute(query)).scalars().all()
    items = [_to_item(r) for r in rows]
    return BusinessPartnerListResponse(items=items, total=len(items))


@router.patch("/admin/requests/{request_id}", response_model=BusinessPartnerItem)
async def admin_update_partner_request(
    request_id: int,
    body: BusinessPartnerUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    require_panel_admin(request)
    row = (
        await db.execute(
            select(Business_partner_requests).where(Business_partner_requests.id == request_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    row.status = body.status
    await db.commit()
    await db.refresh(row)
    try:
        from services.admin_event_hub import admin_event_hub

        admin_event_hub.request_refresh("business_partner_update")
    except Exception:
        pass
    return _to_item(row)
