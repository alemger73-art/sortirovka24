"""Operational summary for the admin panel — pending counts and recent activity."""

from __future__ import annotations

import asyncio
import logging

from core.admin_guard import require_panel_admin
from core.auth import AccessTokenError, decode_access_token
from core.database import get_db
from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from services.admin_event_hub import PING_INTERVAL_SEC, admin_event_hub
from services.admin_summary_service import AdminSummaryResponse, compute_admin_summary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Re-export for backward compatibility
__all__ = ["router", "AdminSummaryResponse", "AdminRecentItem"]


def _validate_panel_admin_token(token: str) -> bool:
    if not token:
        return False
    try:
        payload = decode_access_token(token.strip())
    except AccessTokenError:
        return False
    return payload.get("role") == "admin" and bool(payload.get("username"))


@router.get("/summary", response_model=AdminSummaryResponse)
async def admin_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    require_panel_admin(request)
    return await compute_admin_summary(db)


@router.websocket("/ws/summary")
async def admin_summary_websocket(
    websocket: WebSocket,
    token: str = Query(default=""),
):
    if not _validate_panel_admin_token(token):
        await websocket.close(code=4401, reason="Unauthorized")
        return

    await websocket.accept()
    queue = admin_event_hub.subscribe()

    try:
        from core.database import db_manager

        if db_manager.async_session_maker:
            async with db_manager.async_session_maker() as db:
                initial = await compute_admin_summary(db)
            await websocket.send_json({"type": "summary", "data": initial.model_dump()})

        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=PING_INTERVAL_SEC)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                continue

            if message.get("type") == "summary":
                await websocket.send_json(message)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("Admin WS closed: %s", exc)
    finally:
        admin_event_hub.unsubscribe(queue)


# Re-export models used elsewhere
from services.admin_summary_service import AdminRecentItem  # noqa: E402
