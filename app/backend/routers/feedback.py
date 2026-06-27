"""Public feedback — report app/portal issues to the team via Telegram."""

import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from services.telegram import notify_app_issue
from utils.rate_limit import check_ip_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


class ReportIssueRequest(BaseModel):
    description: str = Field(..., min_length=10, max_length=4000)
    section: Optional[str] = Field(default=None, max_length=64)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    contact_phone: Optional[str] = Field(default=None, max_length=32)
    page_url: Optional[str] = Field(default=None, max_length=500)
    user_agent: Optional[str] = Field(default=None, max_length=500)
    screenshot_url: Optional[str] = Field(default=None, max_length=1000)


class ReportIssueResponse(BaseModel):
    success: bool
    message: str


@router.post("/report", response_model=ReportIssueResponse)
async def report_issue(body: ReportIssueRequest, request: Request):
    check_ip_rate_limit(
        request,
        key_prefix="feedback_report",
        max_hits=8,
        window_seconds=3600,
        message="Слишком много обращений с вашего IP. Попробуйте позже.",
    )

    payload = {
        "description": body.description.strip(),
        "section": (body.section or "").strip() or "Не указан",
        "contact_name": (body.contact_name or "").strip(),
        "contact_phone": (body.contact_phone or "").strip(),
        "page_url": (body.page_url or "").strip(),
        "user_agent": (body.user_agent or "").strip(),
        "screenshot_url": (body.screenshot_url or "").strip(),
    }

    try:
        sent = await notify_app_issue(payload)
    except Exception as exc:
        logger.error("Feedback Telegram notify failed: %s", exc)
        sent = False

    if sent:
        return ReportIssueResponse(success=True, message="Сообщение отправлено. Спасибо, мы разберёмся!")

    return ReportIssueResponse(
        success=False,
        message="Не удалось отправить сообщение. Попробуйте позже или напишите на sortirovka.portal@mail.ru",
    )
