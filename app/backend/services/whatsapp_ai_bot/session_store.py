"""In-memory WhatsApp session store with TTL and message dedupe."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Set


@dataclass
class WhatsAppSession:
    """Per-user session state (stage 2: dedupe only)."""

    wa_id: str
    seen_message_ids: Set[str] = field(default_factory=set)
    updated_at: float = field(default_factory=time.monotonic)


class InMemorySessionStore:
    """Process-local sessions. Not shared across workers — fine for stage 2."""

    def __init__(self, ttl_seconds: int = 3600) -> None:
        self._ttl_seconds = max(1, int(ttl_seconds))
        self._sessions: Dict[str, WhatsAppSession] = {}

    def _purge_expired(self, now: Optional[float] = None) -> None:
        now = time.monotonic() if now is None else now
        expired = [
            wa_id
            for wa_id, session in self._sessions.items()
            if (now - session.updated_at) > self._ttl_seconds
        ]
        for wa_id in expired:
            self._sessions.pop(wa_id, None)

    def get_or_create(self, wa_id: str) -> WhatsAppSession:
        """Return an existing non-expired session or create a new one."""
        now = time.monotonic()
        self._purge_expired(now)
        session = self._sessions.get(wa_id)
        if session is None:
            session = WhatsAppSession(wa_id=wa_id, updated_at=now)
            self._sessions[wa_id] = session
        else:
            session.updated_at = now
        return session

    def mark_seen(self, wa_id: str, message_id: str) -> bool:
        """Record message_id for wa_id. Returns False if already seen (duplicate)."""
        if not wa_id or not message_id:
            return True
        session = self.get_or_create(wa_id)
        if message_id in session.seen_message_ids:
            return False
        session.seen_message_ids.add(message_id)
        session.updated_at = time.monotonic()
        return True


_store: Optional[InMemorySessionStore] = None


def reset_session_store_for_tests() -> None:
    """Clear the process-wide session store (tests only)."""
    global _store
    _store = None


def get_session_store(ttl_seconds: Optional[int] = None) -> InMemorySessionStore:
    """Return the singleton session store, creating it on first use."""
    global _store
    if _store is None:
        ttl = 3600 if ttl_seconds is None else int(ttl_seconds)
        _store = InMemorySessionStore(ttl_seconds=ttl)
    return _store
