"""«Новогодняя Сортировка» contest: public page, entries, photos, votes and the owner's admin (see services/contest.py)."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import contest as svc
from services.account_session import resolve_account_user
from services.content_access import is_owner_admin
from utils.rate_limit import check_ip_rate_limit

router = APIRouter(prefix="/api/v1/contest", tags=["contest"])
Auth = Header(default=None, alias="Authorization")


class PhotoBody(BaseModel):
    image: str


class EntryBody(BaseModel):
    nomination: str
    title: str = ""
    street: str = ""
    about: str = ""
    photos: list[str] = []


class VoteBody(BaseModel):
    entry_id: int


class AdminEntryBody(BaseModel):
    status: Optional[str] = None
    reason: Optional[str] = None
    place: Optional[int] = None
    clear_place: bool = False


async def _user_id(db, authorization) -> str:
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(401, "Войдите в аккаунт по номеру телефона")
    return str(user.id)


async def _admin(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    if not await is_owner_admin(db, authorization):
        raise HTTPException(403, "Доступ только для администратора")


def _fail(exc: svc.ContestError):
    raise HTTPException(400, str(exc)) from None


@router.get("")
async def view(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    user = await resolve_account_user(db, authorization)
    return await svc.public_view(db, str(user.id) if user else None)


@router.post("/photos", status_code=201)
async def upload_photo(body: PhotoBody, request: Request, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    check_ip_rate_limit(request, key_prefix="contest_photo", window_seconds=3600, max_hits=40)
    user_id = await _user_id(db, authorization)
    try:
        return {"key": await svc.save_photo(db, user_id, body.image)}
    except svc.ContestError as exc:
        _fail(exc)


@router.get("/photos/{key}.jpg")
async def photo(key: str, db: AsyncSession = Depends(get_db)):
    raw = await svc.photo_bytes(db, key)
    if not raw:
        raise HTTPException(404, "Фото не найдено")
    kind = "image/png" if raw[:4] == b"\x89PNG" else "image/webp" if raw[8:12] == b"WEBP" else "image/jpeg"
    return Response(raw, media_type=kind, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.post("/entries")
async def submit(body: EntryBody, request: Request, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    check_ip_rate_limit(request, key_prefix="contest_entry", window_seconds=3600, max_hits=20)
    user_id = await _user_id(db, authorization)
    try:
        return await svc.submit(db, user_id, body.model_dump())
    except svc.ContestError as exc:
        _fail(exc)


@router.delete("/entries/{entry_id}")
async def withdraw(entry_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    user_id = await _user_id(db, authorization)
    try:
        await svc.withdraw(db, user_id, entry_id)
    except svc.ContestError as exc:
        _fail(exc)
    return {"ok": True}


@router.post("/vote")
async def vote(body: VoteBody, request: Request, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    check_ip_rate_limit(request, key_prefix="contest_vote", window_seconds=3600, max_hits=30)
    user_id = await _user_id(db, authorization)
    try:
        await svc.vote(db, user_id, body.entry_id)
    except svc.ContestError as exc:
        _fail(exc)
    return {"ok": True}


@router.get("/admin", dependencies=[Depends(_admin)])
async def admin_view(db: AsyncSession = Depends(get_db)):
    return await svc.admin_view(db)


@router.put("/admin/settings", dependencies=[Depends(_admin)])
async def admin_settings(body: dict[str, Any], db: AsyncSession = Depends(get_db)):
    try:
        return await svc.save_settings(db, body.get("settings") or {})
    except svc.ContestError as exc:
        _fail(exc)


@router.post("/admin/entries/{entry_id}", dependencies=[Depends(_admin)])
async def admin_entry(entry_id: int, body: AdminEntryBody, db: AsyncSession = Depends(get_db)):
    changes: dict[str, Any] = {}
    if body.status is not None:
        changes.update(status=body.status, reason=body.reason)
    if body.place is not None or body.clear_place:
        changes["place"] = None if body.clear_place else body.place
    try:
        await svc.admin_update(db, entry_id, changes)
    except svc.ContestError as exc:
        _fail(exc)
    return {"ok": True}
