"""Entity write-protection middleware.

The generic ``/api/v1/entities/*`` endpoints are used both by public submission
forms (announcements, complaints, food orders, …) and by the admin moderation
panel (editing/deleting any content). Without this guard, anyone on the internet
could edit or delete content by calling the API directly.

Policy for ``/api/v1/entities/{entity}/…``:

* ``GET`` / ``HEAD`` / ``OPTIONS``          → always allowed (public reads, CORS).
* ``POST`` (create)                         → allowed only for public-form
                                              entities, otherwise admin required.
* ``PUT`` / ``PATCH`` (update)              → allowed only for entities that have
                                              a legitimate public update flow
                                              (courier order status), otherwise
                                              admin required.
* ``DELETE``                                → admin required (no public page
                                              deletes content).

The check is intentionally fail-safe and can be disabled instantly — without a
code change or redeploy — by setting ``ENTITY_WRITE_PROTECTION=off`` in the
environment.
"""

import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from core.auth import AccessTokenError, decode_access_token

logger = logging.getLogger(__name__)

_ENTITIES_PREFIX = "/api/v1/entities/"
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Entities whose CREATE (POST) is a public, user-facing submission form.
# Anyone may submit these; moderation / edit / delete still requires an admin.
PUBLIC_CREATE_ENTITIES = {
    "announcements",
    "complaints",
    "jobs",
    "questions",
    "question_answers",
    "real_estate",
    "master_requests",
    "become_master_requests",
    "food_orders",
    "park_orders",
}

# Entity list reads that expose PII or admin-only data.
ADMIN_READ_ENTITIES = {
    "food_orders",
}

# Entities whose UPDATE (PUT/PATCH) is performed by a public client, e.g. a
# courier updating the status of an order from the courier screen.
PUBLIC_UPDATE_ENTITIES = {
    "park_orders",
}

_DISABLED_VALUES = {"0", "off", "false", "no", "disabled"}


def _protection_enabled() -> bool:
    return os.getenv("ENTITY_WRITE_PROTECTION", "on").strip().lower() not in _DISABLED_VALUES


def _entity_name(path: str) -> str:
    rest = path[len(_ENTITIES_PREFIX):]
    return rest.split("/", 1)[0].strip().lower()


def _is_admin(request: Request) -> bool:
    """Return True only for a valid, non-expired admin JWT in the Authorization header."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return False
    token = auth[7:].strip()
    if not token:
        return False
    try:
        payload = decode_access_token(token)
    except (AccessTokenError, Exception):
        return False
    return payload.get("role") == "admin" and bool(payload.get("username"))


class EntityWriteGuardMiddleware(BaseHTTPMiddleware):
    """Reject unauthenticated mutations to admin-managed entity endpoints."""

    async def dispatch(self, request: Request, call_next):
        method = request.method.upper()
        path = request.url.path

        if path.startswith(_ENTITIES_PREFIX) and _protection_enabled():
            entity = _entity_name(path)

            # Block public reads of sensitive entities (e.g. food order PII).
            if method in ("GET", "HEAD") and entity in ADMIN_READ_ENTITIES and not _is_admin(request):
                logger.warning("[EntityGuard] Blocked unauthenticated read %s %s", method, path)
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Требуется авторизация администратора."},
                )

            # Batch mutations are admin-only (no public batch order spam).
            if method == "POST" and path.rstrip("/").endswith("/batch") and not _is_admin(request):
                logger.warning("[EntityGuard] Blocked unauthenticated batch %s", path)
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Требуется авторизация администратора."},
                )

        if (
            method in _MUTATING_METHODS
            and path.startswith(_ENTITIES_PREFIX)
            and _protection_enabled()
        ):
            entity = _entity_name(path)

            if method == "POST":
                allowed = entity in PUBLIC_CREATE_ENTITIES
            elif method in ("PUT", "PATCH"):
                allowed = entity in PUBLIC_UPDATE_ENTITIES
            else:  # DELETE
                allowed = False

            if not allowed and not _is_admin(request):
                logger.warning("[EntityGuard] Blocked unauthenticated %s %s", method, path)
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Требуется авторизация администратора."},
                )

        return await call_next(request)
