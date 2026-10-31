"""Admin: the list of paid services and payment reminders (see services/paid_services.py)."""
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import paid_services as svc
from services.content_access import is_owner_admin

router = APIRouter(prefix="/api/v1/paid-services", tags=["paid-services"])


async def _admin(authorization: str | None = Header(default=None, alias="Authorization"), db: AsyncSession = Depends(get_db)):
    if not await is_owner_admin(db, authorization):
        raise HTTPException(403, "Доступ только для администратора")


def _fail(exc: Exception) -> HTTPException:
    return HTTPException(404 if isinstance(exc, LookupError) else 400, str(exc))


@router.get("", dependencies=[Depends(_admin)])
async def list_services(db: AsyncSession = Depends(get_db)):
    return await svc.list_services(db)


@router.post("", dependencies=[Depends(_admin)])
async def create_service(body: dict[str, Any], db: AsyncSession = Depends(get_db)):
    try:
        return await svc.save_service(db, body)
    except ValueError as exc:
        raise _fail(exc)


@router.put("/{service_id}", dependencies=[Depends(_admin)])
async def update_service(service_id: int, body: dict[str, Any], db: AsyncSession = Depends(get_db)):
    try:
        return await svc.save_service(db, body, service_id)
    except (ValueError, LookupError) as exc:
        raise _fail(exc)


@router.delete("/{service_id}", dependencies=[Depends(_admin)])
async def delete_service(service_id: int, db: AsyncSession = Depends(get_db)):
    await svc.delete_service(db, service_id)
    return await svc.list_services(db)


@router.post("/{service_id}/paid", dependencies=[Depends(_admin)])
async def mark_paid(service_id: int, db: AsyncSession = Depends(get_db)):
    answer, item = await svc.mark_paid(db, service_id, None, "админка")
    if item is None:
        raise HTTPException(404, answer)
    return {"answer": answer, **(await svc.list_services(db))}


@router.post("/test", dependencies=[Depends(_admin)])
async def send_test(db: AsyncSession = Depends(get_db)):
    """Send the current list to the reminders chat — to check that the bot reaches it."""
    chat_id = await svc.target(db)
    if not chat_id:
        raise HTTPException(400, "Телеграм-бот не настроен на сервере")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await svc.send(client, chat_id, svc.overview_text(await svc.list_services(db)))
    except Exception as exc:
        logging.getLogger(__name__).warning("[Payments] test message failed: %s", exc)
        raise HTTPException(502, "Телеграм не принял сообщение — бот добавлен в группу?")
    return {"ok": True}
