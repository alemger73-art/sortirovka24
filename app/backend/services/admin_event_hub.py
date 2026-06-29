"""Real-time admin summary broadcast hub (WebSocket subscribers)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from services.admin_summary_service import compute_admin_summary, summary_fingerprint

logger = logging.getLogger(__name__)

WATCH_INTERVAL_SEC = 2.0
PING_INTERVAL_SEC = 25.0


class AdminEventHub:
    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[dict[str, Any]]] = []
        self._last_fingerprint: str | None = None
        self._wake = asyncio.Event()
        self._lock = asyncio.Lock()

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=8)
        self._subscribers.append(queue)
        self._wake.set()
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        try:
            self._subscribers.remove(queue)
        except ValueError:
            pass

    def request_refresh(self, reason: str = "change") -> None:
        """Wake the watcher immediately (e.g. after a new submission)."""
        self._wake.set()
        logger.debug("Admin summary refresh requested: %s", reason)

    async def _broadcast(self, message: dict[str, Any]) -> None:
        dead: list[asyncio.Queue[dict[str, Any]]] = []
        for queue in self._subscribers:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                try:
                    while not queue.empty():
                        queue.get_nowait()
                    queue.put_nowait(message)
                except Exception:
                    dead.append(queue)
        for queue in dead:
            self.unsubscribe(queue)

    async def run_watch_loop(self) -> None:
        from core.database import db_manager

        logger.info("Admin summary watch loop started")
        while True:
            try:
                if not self._subscribers:
                    self._wake.clear()
                    await asyncio.sleep(1.0)
                    continue

                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=WATCH_INTERVAL_SEC)
                except asyncio.TimeoutError:
                    pass
                self._wake.clear()

                if not db_manager.async_session_maker:
                    await asyncio.sleep(1.0)
                    continue

                async with self._lock:
                    async with db_manager.async_session_maker() as db:
                        summary = await compute_admin_summary(db)
                    fp = summary_fingerprint(summary)
                    if fp == self._last_fingerprint:
                        continue
                    self._last_fingerprint = fp
                    payload = summary.model_dump()
                    await self._broadcast({"type": "summary", "data": payload})
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Admin summary watch error: %s", exc)
                await asyncio.sleep(2.0)


admin_event_hub = AdminEventHub()
