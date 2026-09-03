"""WhatsApp Cloud API webhook — Meta verify + signed ingress + stage 2 replies.

Stage 2: sessions + read-only DAM ALEM catalog + Cloud API text replies.
No OpenAI. No food order creation. Fast ACK via asyncio.create_task.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse

from services.whatsapp_ai_bot.config import get_whatsapp_config
from services.whatsapp_ai_bot.handler import handle_inbound_message
from services.whatsapp_ai_bot.ingress import (
    extract_inbound_message,
    log_parsed_event,
    parse_webhook_payload,
)
from services.whatsapp_ai_bot.verify import verify_meta_signature, verify_webhook_challenge

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])


async def _process_inbound_background(payload: Any) -> None:
    """Load catalog + reply off the webhook critical path. Catch-all."""
    try:
        inbound = extract_inbound_message(payload)
        if inbound is None:
            return
        from core.database import db_manager

        await db_manager.ensure_initialized()
        if not db_manager.async_session_maker:
            logger.error("whatsapp_webhook background: db session maker unavailable")
            return
        async with db_manager.async_session_maker() as db:
            await handle_inbound_message(db, inbound)
    except Exception:
        logger.exception("whatsapp_webhook background processing failed")


@router.get("/webhook")
async def whatsapp_webhook_verify(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    """Meta subscription verification handshake."""
    config = get_whatsapp_config()
    result = verify_webhook_challenge(
        mode=hub_mode,
        verify_token=hub_verify_token,
        challenge=hub_challenge,
        expected_token=config.verify_token,
    )
    if not result.ok:
        logger.warning("whatsapp_webhook verify failed reason=%s", result.reason)
        raise HTTPException(status_code=403, detail="Forbidden")
    return PlainTextResponse(content=result.challenge or "", status_code=200)


@router.post("/webhook")
async def whatsapp_webhook_ingress(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None, alias="X-Hub-Signature-256"),
):
    """Accept signed Meta webhooks; ack quickly; process inbound in background."""
    config = get_whatsapp_config()
    raw_body = await request.body()

    sig = verify_meta_signature(
        raw_body=raw_body,
        signature_header=x_hub_signature_256,
        app_secret=config.app_secret,
    )
    if not sig.ok:
        # Missing signature → 401; bad/mismatched signature or secret → 403
        status = 401 if sig.reason == "missing_signature" else 403
        logger.warning("whatsapp_webhook signature rejected reason=%s", sig.reason)
        raise HTTPException(status_code=status, detail="Unauthorized" if status == 401 else "Forbidden")

    # Fast path when bot is disabled: still ack Meta after signature check.
    if not config.enabled:
        logger.info("whatsapp_webhook received while bot disabled; acking")
        return Response(content='{"ok":true,"enabled":false}', media_type="application/json", status_code=200)

    payload: object
    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("whatsapp_webhook invalid json after valid signature")
        # Ack Meta to avoid endless retries on corrupt payloads we cannot process.
        return Response(content='{"ok":true}', media_type="application/json", status_code=200)

    event = parse_webhook_payload(payload)
    log_parsed_event(event, enabled=True)
    asyncio.create_task(_process_inbound_background(payload))
    return Response(content='{"ok":true}', media_type="application/json", status_code=200)
