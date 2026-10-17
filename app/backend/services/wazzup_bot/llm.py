"""Thin async client for the Anthropic Messages API with tool use (via httpx)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List

import httpx

from services.wazzup_bot.config import WazzupBotConfig

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


class ClaudeClient:
    def __init__(self, config: WazzupBotConfig):
        self.config = config

    async def create(self, *, system: str, messages: List[dict], tools: List[dict], max_tokens: int = 1200) -> Dict[str, Any]:
        if not self.config.anthropic_api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set")
        body = {
            "model": self.config.anthropic_model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
            "tools": tools,
        }
        headers = {
            "x-api-key": self.config.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        last_error = ""
        for attempt in range(3):
            if attempt:
                await asyncio.sleep(1.5 * attempt)
            try:
                async with httpx.AsyncClient(timeout=60.0) as http:
                    resp = await http.post(f"{self.config.anthropic_base_url}/v1/messages", json=body, headers=headers)
            except httpx.HTTPError as exc:
                last_error = str(exc)
                continue
            if resp.status_code == 200:
                return resp.json()
            last_error = f"{resp.status_code}: {resp.text[:300]}"
            # Retry only overload / rate-limit / server errors.
            if resp.status_code not in (429, 500, 502, 503, 529):
                break
        logger.error("claude request failed: %s", last_error)
        raise LLMError(last_error)
