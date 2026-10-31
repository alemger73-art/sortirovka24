"""Опросы жителей за бонусы: public answering and the owner's admin (see services/surveys.py)."""
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import surveys as svc
from services.account_session import resolve_account_user
from services.content_access import is_owner_admin

router = APIRouter(prefix="/api/v1/surveys", tags=["surveys"])
Auth = Header(default=None, alias="Authorization")


class AnswerBody(BaseModel):
    answers: dict[str, Any]


class StatusBody(BaseModel):
    status: str


async def _user(db, authorization):
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(401, "Войдите в аккаунт")
    return user


async def _admin(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    if not await is_owner_admin(db, authorization):
        raise HTTPException(403, "Доступ только для администратора")


@router.get("")
async def list_surveys(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    user = await resolve_account_user(db, authorization)
    return {"items": await svc.list_public(db, str(user.id) if user else None)}


@router.get("/admin", dependencies=[Depends(_admin)])
async def admin_list(db: AsyncSession = Depends(get_db)):
    return {"items": await svc.admin_list(db)}


@router.post("/admin", dependencies=[Depends(_admin)])
async def admin_create(body: dict[str, Any], db: AsyncSession = Depends(get_db)):
    return await svc.save(db, body)


@router.put("/admin/{survey_id}", dependencies=[Depends(_admin)])
async def admin_update(survey_id: int, body: dict[str, Any], db: AsyncSession = Depends(get_db)):
    return await svc.save(db, body, survey_id)


@router.post("/admin/{survey_id}/status", dependencies=[Depends(_admin)])
async def admin_status(survey_id: int, body: StatusBody, db: AsyncSession = Depends(get_db)):
    return await svc.set_status(db, survey_id, body.status)


@router.delete("/admin/{survey_id}", dependencies=[Depends(_admin)])
async def admin_delete(survey_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.delete(db, survey_id)


@router.get("/admin/{survey_id}/results", dependencies=[Depends(_admin)])
async def admin_results(survey_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.results(db, survey_id)


@router.get("/admin/{survey_id}/results.csv", dependencies=[Depends(_admin)])
async def admin_results_csv(survey_id: int, db: AsyncSession = Depends(get_db)):
    return Response(await svc.results_csv(db, survey_id), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="survey-{survey_id}.csv"'})


@router.get("/{survey_id}")
async def open_survey(survey_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    return await svc.open_survey(db, survey_id, await _user(db, authorization))


@router.post("/{survey_id}")
async def answer(survey_id: int, body: AnswerBody, request: Request, authorization: str | None = Auth,
                 db: AsyncSession = Depends(get_db)):
    from utils.rate_limit import check_ip_rate_limit
    check_ip_rate_limit(request, key_prefix="survey_answer", window_seconds=3600, max_hits=30)
    return await svc.submit(db, survey_id, await _user(db, authorization), body.answers)
