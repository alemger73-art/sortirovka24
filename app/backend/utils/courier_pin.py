"""Courier PIN hashing and verification (bcrypt, legacy plaintext upgrade on login)."""

from __future__ import annotations

import bcrypt

_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")


def is_hashed_pin(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith(_BCRYPT_PREFIXES)


def hash_courier_pin(pin: str) -> str:
    normalized = (pin or "").strip()
    if not normalized:
        raise ValueError("PIN cannot be empty")
    return bcrypt.hashpw(normalized.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_courier_pin(stored: str | None, pin: str) -> bool:
    if not stored or not pin:
        return False
    candidate = pin.strip()
    if is_hashed_pin(stored):
        try:
            return bcrypt.checkpw(candidate.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    return stored == candidate


def maybe_hash_pin_value(value: str | None) -> str | None:
    """Hash plaintext PIN values before persisting; leave bcrypt hashes unchanged."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if is_hashed_pin(stripped):
        return stripped
    return hash_courier_pin(stripped)


def mask_pin_for_api(stored: str | None) -> str | None:
    """Never expose bcrypt hashes via admin API."""
    if not stored:
        return None
    if is_hashed_pin(stored):
        return None
    return stored
