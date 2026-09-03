"""In-memory WhatsApp dialog sessions (stage 2). Redis can replace this later."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Set


@dataclass
class WhatsAppSession:
    wa_id: str
    updated_at: float = field(default_factory=time.time)
    last_intent: str = ""
    last_category_id: Optional[int] = None
    last_category_name: str = ""
    seen_message_ids: Set[str] = field(default_factory=set)

    def touch(self) -> None:
        self.updated_at = time.time()


class InMemorySessionStore:
    """Process-local sessions keyed by wa_id. Lost on restart — acceptable for stage 2."""

    def __init__(self, *, ttl_seconds: int = 3600, max_seen_ids: int = 50):
        self._ttl = max(60, int(ttl_seconds))
        self._max_seen = max(10, int(max_seen_ids))
        self._sessions: Dict[str, WhatsAppSession] = {}
        self._lock = threading.Lock()

    def _purge_locked(self, now: float) -> None:
        expired = [k for k, s in self._sessions.items() if now - s.updated_at > self._ttl]
        for key in expired:
            del self._sessions[key]

    def get_or_create(self, wa_id: str) -> WhatsAppSession:
        now = time.time()
        with self._lock:
            self._purge_locked(now)
            session = self._sessions.get(wa_id)
            if session is None:
                session = WhatsAppSession(wa_id=wa_id)
                self._sessions[wa_id] = session
            else:
                session.touch()
            return session

    def mark_seen(self, wa_id: str, message_id: str) -> bool:
        """Return True if this message_id is new; False if duplicate."""
        if not message_id:
            return True
        with self._lock:
            self._purge_locked(time.time())
            session = self._sessions.get(wa_id)
            if session is None:
                session = WhatsAppSession(wa_id=wa_id)
                self._sessions[wa_id] = session
            if message_id in session.seen_message_ids:
                return False
            session.seen_message_ids.add(message_id)
            if len(session.seen_message_ids) > self._max_seen:
                # Drop arbitrary extras (set has no order); rebuild from recent touch.
                session.seen_message_ids = set(list(session.seen_message_ids)[-self._max_seen :])
            session.touch()
            return True

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()


_STORE: Optional[InMemorySessionStore] = None
_STORE_LOCK = threading.Lock()


def get_session_store(*, ttl_seconds: int = 3600) -> InMemorySessionStore:
    global _STORE
    with _STORE_LOCK:
        if _STORE is None:
            _STORE = InMemorySessionStore(ttl_seconds=ttl_seconds)
        return _STORE


def reset_session_store_for_tests() -> None:
    global _STORE
    with _STORE_LOCK:
        if _STORE is not None:
            _STORE.clear()
        _STORE = None
