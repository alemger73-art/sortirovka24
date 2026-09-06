"""Meta WhatsApp Cloud API webhook verification (challenge + HMAC)."""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class VerifyChallengeResult:
    ok: bool
    challenge: Optional[str] = None
    reason: str = ""


@dataclass(frozen=True)
class SignatureResult:
    ok: bool
    reason: str = ""


def verify_webhook_challenge(
    *,
    mode: Optional[str],
    verify_token: Optional[str],
    challenge: Optional[str],
    expected_token: str,
) -> VerifyChallengeResult:
    """Validate Meta GET subscription handshake (hub.mode / hub.verify_token / hub.challenge)."""
    if (mode or "").strip() != "subscribe":
        return VerifyChallengeResult(ok=False, reason="invalid_mode")
    if not expected_token:
        return VerifyChallengeResult(ok=False, reason="verify_token_not_configured")
    provided = str(verify_token or "")
    # compare_digest raises on length mismatch — treat that as failure, not 500.
    if len(provided) != len(expected_token) or not hmac.compare_digest(provided, expected_token):
        return VerifyChallengeResult(ok=False, reason="verify_token_mismatch")
    if challenge is None or str(challenge) == "":
        return VerifyChallengeResult(ok=False, reason="missing_challenge")
    return VerifyChallengeResult(ok=True, challenge=str(challenge))


def verify_meta_signature(
    *,
    raw_body: bytes,
    signature_header: Optional[str],
    app_secret: str,
) -> SignatureResult:
    """Validate X-Hub-Signature-256 (sha256=<hex>) with HMAC-SHA256 and compare_digest."""
    if not app_secret:
        return SignatureResult(ok=False, reason="app_secret_not_configured")
    if not signature_header or not str(signature_header).strip():
        return SignatureResult(ok=False, reason="missing_signature")

    header = str(signature_header).strip()
    if not header.lower().startswith("sha256="):
        return SignatureResult(ok=False, reason="invalid_signature_format")

    provided = header.split("=", 1)[1].strip().lower()
    if not provided or any(c not in "0123456789abcdef" for c in provided):
        return SignatureResult(ok=False, reason="invalid_signature_hex")

    digest = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    if len(provided) != len(digest) or not hmac.compare_digest(digest, provided):
        return SignatureResult(ok=False, reason="signature_mismatch")
    return SignatureResult(ok=True)
