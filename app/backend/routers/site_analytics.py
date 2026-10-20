"""Anonymous visit statistics and the error watch (browser + server)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_guard import require_panel_admin
from core.database import get_db
from models.site_analytics import SiteError
from services import site_analytics as sa
from utils.rate_limit import check_keyed_rate_limit

router = APIRouter(prefix="/api/v1/site-analytics", tags=["site-analytics"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


class Collect(BaseModel):
    visitor: str = Field(max_length=40)
    session: str = Field(max_length=40)
    logged_in: bool = False
    standalone: bool = False
    events: list[dict[str, Any]] = Field(default_factory=list, max_length=30)


@router.post("/collect", status_code=202)
async def collect(request: Request, db: AsyncSession = Depends(get_db)):
    """JSON body; also accepts text/plain (navigator.sendBeacon when the tab is closing)."""
    check_keyed_rate_limit(f"site-analytics:{_ip(request)}", window_seconds=60, max_hits=120)
    raw = await request.body()
    if len(raw) > 64_000:
        raise HTTPException(413, "too large")
    try:
        body = Collect.model_validate_json(raw)
    except ValueError:
        raise HTTPException(422, "bad body") from None
    added = await sa.ingest(db, body.model_dump(), request.headers.get("user-agent", ""))
    return {"accepted": added}


class ClientError(BaseModel):
    message: str = Field(max_length=2000)
    stack: str = Field("", max_length=8000)
    path: str = Field("", max_length=300)
    release: str = Field("", max_length=40)
    visitor: str = Field("", max_length=40)


@router.post("/error", status_code=202)
async def client_error(body: ClientError, request: Request, db: AsyncSession = Depends(get_db)):
    check_keyed_rate_limit(f"site-error:{_ip(request)}", window_seconds=60, max_hits=20)
    ua = sa.parse_ua(request.headers.get("user-agent", ""))
    row, new = await sa.record_error(db, source="client", message=body.message, stack=body.stack, path=body.path,
                                     browser=f"{ua['browser']} · {ua['platform']}", release=body.release,
                                     visitor=body.visitor if sa.ID_RE.match(body.visitor or "") else "")
    if new or not row.notified:
        row.notified = True
        await db.commit()
        await sa.alert_new_error(row)
    return {"accepted": True}


@router.get("/summary")
async def summary(days: int = Query(1, ge=1, le=90), _admin: dict = Depends(require_panel_admin),
                  db: AsyncSession = Depends(get_db)):
    return await sa.summary(db, days)


@router.get("/errors")
async def errors(status: str = Query("open"), _admin: dict = Depends(require_panel_admin),
                 db: AsyncSession = Depends(get_db)):
    query = select(SiteError).order_by(SiteError.last_seen.desc()).limit(200)
    if status == "open":
        query = query.where(SiteError.status != "fixed")
    elif status in ("new", "known", "fixed"):
        query = query.where(SiteError.status == status)
    return {"items": [sa.error_view(r) for r in (await db.scalars(query)).all()]}


class ErrorChange(BaseModel):
    status: Literal["new", "known", "fixed"]
    note: str | None = Field(None, max_length=2000)


@router.patch("/errors/{error_id}")
async def change_error(error_id: int, body: ErrorChange, _admin: dict = Depends(require_panel_admin),
                       db: AsyncSession = Depends(get_db)):
    row = await db.get(SiteError, error_id)
    if not row:
        raise HTTPException(404, "Ошибка не найдена")
    row.status = body.status
    if body.note is not None:
        row.note = body.note
    await db.commit()
    return sa.error_view(row)
