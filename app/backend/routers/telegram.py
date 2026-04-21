"""
Telegram integration API routes with category-based routing.
"""

import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.telegram import (
    notify_new_master_request,
    notify_new_complaint,
    notify_new_become_master,
    notify_new_announcement,
    notify_new_job,
    send_telegram_message,
    _is_configured,
    get_routing_info,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


# ─── Schemas ───────────────────────────────────────────────────────

class MasterRequestNotify(BaseModel):
    category: str
    problem_description: str
    address: Optional[str] = ""
    phone: str
    client_name: Optional[str] = ""


class ComplaintNotify(BaseModel):
    category: str
    address: str
    description: str
    author_name: Optional[str] = ""
    phone: Optional[str] = ""
    photo_count: Optional[int] = 0
    has_video: Optional[bool] = False


class BecomeMasterNotify(BaseModel):
    name: str
    category: str
    phone: str
    whatsapp: Optional[str] = ""
    district: Optional[str] = ""
    description: Optional[str] = ""


class AnnouncementNotify(BaseModel):
    ann_type: str
    ann_title: str
    description: str
    price: Optional[str] = ""
    address: Optional[str] = ""
    author_name: Optional[str] = ""
    phone: Optional[str] = ""
    whatsapp: Optional[str] = ""
    photo_count: Optional[int] = 0


class JobNotify(BaseModel):
    job_title: str
    employer: Optional[str] = ""
    category: Optional[str] = ""
    salary: Optional[str] = ""
    schedule: Optional[str] = ""
    district: Optional[str] = ""
    phone: str
    whatsapp: Optional[str] = ""
    description: Optional[str] = ""
    has_image: Optional[bool] = False


class NotifyResponse(BaseModel):
    success: bool
    message: str


# ─── Routes ────────────────────────────────────────────────────────

@router.get("/status")
async def telegram_status():
    configured = _is_configured()
    routing = get_routing_info()
    return {
        "configured": configured,
        "message": "Telegram настроен и готов к работе" if configured
        else "Telegram не настроен. Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.",
        "routing": routing,
    }


@router.post("/notify/master-request", response_model=NotifyResponse)
async def notify_master_request(data: MasterRequestNotify):
    try:
        success = await notify_new_master_request(data.model_dump())
        return NotifyResponse(
            success=success,
            message="Уведомление отправлено" if success else "Telegram не настроен или недоступен",
        )
    except Exception as e:
        logger.error(f"Error sending master request notification: {e}")
        return NotifyResponse(success=False, message=f"Ошибка: {str(e)}")


@router.post("/notify/complaint", response_model=NotifyResponse)
async def notify_complaint(data: ComplaintNotify):
    try:
        success = await notify_new_complaint(data.model_dump())
        return NotifyResponse(
            success=success,
            message="Уведомление отправлено" if success else "Telegram не настроен или недоступен",
        )
    except Exception as e:
        logger.error(f"Error sending complaint notification: {e}")
        return NotifyResponse(success=False, message=f"Ошибка: {str(e)}")


@router.post("/notify/become-master", response_model=NotifyResponse)
async def notify_become_master(data: BecomeMasterNotify):
    try:
        success = await notify_new_become_master(data.model_dump())
        return NotifyResponse(
            success=success,
            message="Уведомление отправлено" if success else "Telegram не настроен или недоступен",
        )
    except Exception as e:
        logger.error(f"Error sending become-master notification: {e}")
        return NotifyResponse(success=False, message=f"Ошибка: {str(e)}")


@router.post("/notify/announcement", response_model=NotifyResponse)
async def notify_announcement(data: AnnouncementNotify):
    try:
        success = await notify_new_announcement(data.model_dump())
        return NotifyResponse(
            success=success,
            message="Уведомление отправлено" if success else "Telegram не настроен или недоступен",
        )
    except Exception as e:
        logger.error(f"Error sending announcement notification: {e}")
        return NotifyResponse(success=False, message=f"Ошибка: {str(e)}")


@router.post("/notify/job", response_model=NotifyResponse)
async def notify_job(data: JobNotify):
    try:
        success = await notify_new_job(data.model_dump())
        return NotifyResponse(
            success=success,
            message="Уведомление отправлено" if success else "Telegram не настроен или недоступен",
        )
    except Exception as e:
        logger.error(f"Error sending job notification: {e}")
        return NotifyResponse(success=False, message=f"Ошибка: {str(e)}")


@router.post("/test", response_model=NotifyResponse)
async def send_test_message():
    if not _is_configured():
        return NotifyResponse(
            success=False,
            message="Telegram не настроен. Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.",
        )
    success = await send_telegram_message(
        "✅ <b>Тестовое сообщение</b>\n\nTelegram интеграция работает корректно!"
    )
    return NotifyResponse(
        success=success,
        message="Тестовое сообщение отправлено!" if success else "Ошибка отправки",
    )