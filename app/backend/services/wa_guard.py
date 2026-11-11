"""Limits and a safety fuse for everything the «Сортировка 24» WhatsApp number (WAHA) sends.

WhatsApp restricts a number that writes a lot, or writes to many new people. So:
- every message goes through allow(): at most N per hour, M per day, K different chats per day;
- the fuse trips when the WAHA session is not WORKING or several sends fail in a row:
  the login page then offers Telegram only and the owner gets one Telegram notice.
  It resets by itself once the session is WORKING again and the cooldown has passed.

State is in memory (one process); a restart starts the counters afresh.
"""

from __future__ import annotations

import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

DAY = 24 * 3600
FUSE_NOTICE = "⚠️ WhatsApp отключён — вход только через Telegram"


def _limit(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def max_per_hour() -> int:
    return _limit("WA_MAX_SENDS_PER_HOUR", 60)


def max_per_day() -> int:
    return _limit("WA_MAX_SENDS_PER_DAY", 300)


def max_new_chats_per_day() -> int:
    return _limit("WA_MAX_NEW_CHATS_PER_DAY", 80)


def fuse_failures() -> int:
    return max(1, _limit("WA_FUSE_FAILURES", 3))


def fuse_cooldown() -> int:
    return _limit("WA_FUSE_COOLDOWN_MINUTES", 30) * 60


_sent: list[float] = []  # when each message went out (last 24 h)
_chats: dict[str, float] = {}  # chat → first message to it within the last 24 h
_fuse = {"down": False, "since": 0.0, "failures": 0, "notified": False}


def reset() -> None:
    _sent.clear()
    _chats.clear()
    _fuse.update(down=False, since=0.0, failures=0, notified=False)


def _prune(now: float) -> None:
    _sent[:] = [t for t in _sent if now - t < DAY]
    for chat in [c for c, t in _chats.items() if now - t >= DAY]:
        _chats.pop(chat, None)


def _under_limits(now: float) -> bool:
    _prune(now)
    return (sum(1 for t in _sent if now - t < 3600) < max_per_hour()
            and len(_sent) < max_per_day())


def allow(chat_id: str) -> bool:
    """May the number send one more message to this chat right now?"""
    now = time.time()
    if not _under_limits(now):
        return False
    return chat_id in _chats or len(_chats) < max_new_chats_per_day()


def offer_login() -> bool:
    """WhatsApp login needs one reply in a (usually new) chat and a healthy session."""
    now = time.time()
    return not _fuse["down"] and _under_limits(now) and len(_chats) < max_new_chats_per_day()


def fuse_down() -> bool:
    return bool(_fuse["down"])


def sent(chat_id: str) -> None:
    now = time.time()
    _sent.append(now)
    _chats.setdefault(chat_id, now)
    _fuse["failures"] = 0


async def failed() -> None:
    _fuse["failures"] += 1
    if _fuse["failures"] >= fuse_failures():
        await _trip(f"{_fuse['failures']} ошибки отправки подряд")


async def observe_session(working: bool) -> None:
    """Called after every real WAHA session check."""
    now = time.time()
    if not working:
        await _trip("сессия WhatsApp не в статусе WORKING")
    elif _fuse["down"] and now - _fuse["since"] >= fuse_cooldown():
        logger.info("[WAGuard] WhatsApp is back: login offered again")
        _fuse.update(down=False, failures=0, notified=False)


async def _trip(reason: str) -> None:
    _fuse.update(down=True, since=time.time())
    if _fuse["notified"]:
        return
    _fuse["notified"] = True
    logger.warning("[WAGuard] fuse tripped: %s", reason)
    from services.news_agent import approval_chat, bot_token, tg
    if not bot_token() or not approval_chat():
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": f"{FUSE_NOTICE}\n\nПричина: {reason}."})
    except Exception as exc:
        logger.warning("[WAGuard] owner notice failed: %s", exc)
