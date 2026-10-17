"""In-memory chat sessions for the Wazzup bot.

Sessions hold short dialog history, the customer's phone (Instagram), the
pending quote awaiting the customer's "ДА", and operator-takeover pauses.
They are process-local and lost on restart; orders themselves live in the DB.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple

ChatKey = Tuple[str, str, str]  # (channel_id, chat_type, chat_id)

MAX_HISTORY = 24


@dataclass
class ChatSession:
    key: ChatKey
    updated_at: float = field(default_factory=time.time)
    # Anthropic-format messages: [{"role": "user"|"assistant", "content": str}]
    history: List[dict] = field(default_factory=list)
    phone: str = ""
    customer_name: str = ""
    pending_confirmation_id: str = ""
    paused_until: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    @property
    def paused(self) -> bool:
        return time.time() < self.paused_until

    def add(self, role: str, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        if self.history and self.history[-1]["role"] == role:
            # Anthropic requires alternating roles; merge consecutive turns.
            self.history[-1]["content"] += "\n" + text
        else:
            self.history.append({"role": role, "content": text})
        if len(self.history) > MAX_HISTORY:
            self.history = self.history[-MAX_HISTORY:]
        # History must start with a user turn.
        while self.history and self.history[0]["role"] != "user":
            self.history.pop(0)


class SessionStore:
    def __init__(self, ttl_seconds: int = 6 * 3600):
        self.ttl = max(300, int(ttl_seconds))
        self._sessions: Dict[ChatKey, ChatSession] = {}
        self._seen: Deque[str] = deque(maxlen=5000)
        self._seen_set: set[str] = set()
        self._ours: Deque[str] = deque(maxlen=5000)
        self._ours_set: set[str] = set()
        self._lock = threading.Lock()

    def get(self, key: ChatKey) -> ChatSession:
        now = time.time()
        with self._lock:
            for k in [k for k, s in self._sessions.items() if now - s.updated_at > self.ttl and not s.paused]:
                del self._sessions[k]
            session = self._sessions.get(key)
            if session is None:
                session = self._sessions[key] = ChatSession(key=key)
            session.updated_at = now
            return session

    def _remember(self, dq: Deque[str], st: set[str], value: str) -> None:
        if len(dq) == dq.maxlen:
            st.discard(dq[0])
        dq.append(value)
        st.add(value)

    def first_time(self, message_id: str) -> bool:
        """True once per Wazzup messageId (webhooks may be redelivered)."""
        if not message_id:
            return True
        with self._lock:
            if message_id in self._seen_set:
                return False
            self._remember(self._seen, self._seen_set, message_id)
            return True

    def mark_ours(self, message_ids: List[str]) -> None:
        with self._lock:
            for mid in message_ids:
                self._remember(self._ours, self._ours_set, mid)

    def is_ours(self, message_id: Optional[str]) -> bool:
        with self._lock:
            return bool(message_id) and message_id in self._ours_set

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._seen.clear()
            self._seen_set.clear()
            self._ours.clear()
            self._ours_set.clear()


_STORE: Optional[SessionStore] = None
_STORE_LOCK = threading.Lock()


def get_store(ttl_seconds: int = 6 * 3600) -> SessionStore:
    global _STORE
    with _STORE_LOCK:
        if _STORE is None:
            _STORE = SessionStore(ttl_seconds)
        return _STORE


def reset_store_for_tests() -> None:
    global _STORE
    with _STORE_LOCK:
        _STORE = None
