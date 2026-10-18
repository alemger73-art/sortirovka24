"""Public business partner application form + admin moderation."""

import logging
import json
from datetime import datetime, timezone

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models.business_partner_requests import Business_partner_requests
from models.user_management import UserAction
from pydantic import BaseModel, Field, field_validator
from typing import Literal
from urllib.parse import urlsplit
from services.telegram import notify_new_business_partner
from services import partner_crm
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
    contact_name: str | None = Field(default=None, min_length=2, max_length=80)
    coverage: str | None = Field(default=None, max_length=80)
    website: str | None = Field(default=None, max_length=500)
    consent: Literal[True]

    @field_validator('name', 'activity', 'contact_name')
    @classmethod
    def nonblank(cls, value):
        if value is None: return value
        if len(value.strip()) < 2: raise ValueError('Заполните поле')
        return value.strip()

    @field_validator('website')
    @classmethod
    def website_url(cls, value):
        if not value: return None
        value=value.strip(); url=urlsplit(value)
        if url.scheme not in ('http','https') or not url.hostname or url.username or url.password:
            raise ValueError('Укажите полную ссылку на сайт')
        return value



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
    category: str | None = None
    duplicate_of: int | None = None
    next_contact: str | None = None
    last_note: str | None = None
    last_activity_at: str | None = None


class BusinessPartnerListResponse(BaseModel):
    items: list[BusinessPartnerItem]
    total: int


class BusinessPartnerUpdateRequest(BaseModel):
    status: str = Field(..., pattern=partner_crm.STAGE_PATTERN)


class PartnerNoteRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class PartnerNextContactRequest(BaseModel):
    at: str | None = Field(default=None, max_length=40)


class PartnerTimelineItem(BaseModel):
    id: int
    kind: str
    title: str
    text: str | None = None
    actor: str | None = None
    via: str | None = None
    at: str | None = None


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
    if body.whatsapp and not whatsapp:
        raise HTTPException(status_code=400, detail="Укажите корректный номер WhatsApp")
    now = datetime.now(timezone.utc).isoformat()
    details = []
    if body.contact_name: details.append("Контактное лицо: " + body.contact_name)
    if body.coverage: details.append("Работа в Сортировке: " + body.coverage)
    if body.website: details.append("Сайт / 2ГИС: " + body.website)
    if body.description: details.append(body.description.strip())

    row = Business_partner_requests(
        name=body.name.strip(),
        phone=phone,
        whatsapp=whatsapp,
        activity=body.activity.strip(),
        description="\n".join(details) or None,
        status="new",
        created_at=now,
    )
    db.add(row)
    await db.flush()
    db.add(UserAction(action='partner_lead_created', entity='business_partner_requests', entity_id=str(row.id),
        payload=json.dumps({'actor':{'role':'public'},'source':'partnership_form','consent':{'accepted':True,
            'version':'business-partnership-20261010','at':now,'purpose':'Обработка заявки и связь в WhatsApp по сотрудничеству'}})))
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


def _to_item(row: Business_partner_requests, crm: dict | None = None) -> BusinessPartnerItem:
    return BusinessPartnerItem(
        id=row.id,
        name=row.name or "",
        phone=row.phone or "",
        whatsapp=row.whatsapp,
        activity=row.activity or "",
        description=row.description,
        status=row.status,
        created_at=row.created_at,
        **(crm or {}),
    )


def _admin_name(payload: dict) -> str:
    return str(payload.get("username") or "admin")


async def _lead(db: AsyncSession, request_id: int) -> Business_partner_requests:
    row = await db.get(Business_partner_requests, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return row


def _refresh_admin() -> None:
    try:
        from services.admin_event_hub import admin_event_hub
        admin_event_hub.request_refresh("business_partner_update")
    except Exception:
        pass


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
    history = await partner_crm.events(db, [r.id for r in rows])
    items = [_to_item(r, partner_crm.summary(history.get(r.id, []))) for r in rows]
    return BusinessPartnerListResponse(items=items, total=len(items))


@router.patch("/admin/requests/{request_id}", response_model=BusinessPartnerItem)
async def admin_update_partner_request(
    request_id: int,
    body: BusinessPartnerUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    admin = require_panel_admin(request)
    row = await _lead(db, request_id)
    partner_crm.set_stage(db, row, body.status, _admin_name(admin), "admin")
    await db.commit()
    await db.refresh(row)
    _refresh_admin()
    history = await partner_crm.events(db, [row.id])
    return _to_item(row, partner_crm.summary(history.get(row.id, [])))


@router.get("/admin/requests/{request_id}/timeline", response_model=list[PartnerTimelineItem])
async def admin_partner_timeline(request_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    require_panel_admin(request)
    await _lead(db, request_id)
    history = await partner_crm.events(db, [request_id])
    return [partner_crm.timeline_item(r) for r in reversed(history.get(request_id, []))]


@router.post("/admin/requests/{request_id}/notes", response_model=PartnerTimelineItem)
async def admin_partner_note(request_id: int, body: PartnerNoteRequest, request: Request,
                             db: AsyncSession = Depends(get_db)):
    admin = require_panel_admin(request)
    await _lead(db, request_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Пустая заметка")
    row = partner_crm.record(db, request_id, "partner_lead_note", {"text": text, "actor": _admin_name(admin), "via": "admin"})
    await db.commit()
    await db.refresh(row)
    _refresh_admin()
    return partner_crm.timeline_item(row)


@router.post("/admin/requests/{request_id}/next-contact", response_model=PartnerTimelineItem)
async def admin_partner_next_contact(request_id: int, body: PartnerNextContactRequest, request: Request,
                                     db: AsyncSession = Depends(get_db)):
    admin = require_panel_admin(request)
    await _lead(db, request_id)
    try:
        at = partner_crm.parse_next_contact(body.at)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    row = partner_crm.record(db, request_id, "partner_lead_next_contact", {"at": at, "actor": _admin_name(admin), "via": "admin"})
    await db.commit()
    await db.refresh(row)
    _refresh_admin()
    return partner_crm.timeline_item(row)
