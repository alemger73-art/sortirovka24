"""Partner-panel JWT checks for module-specific admin access."""

from fastapi import HTTPException, Request

from core.auth import AccessTokenError, decode_access_token

DAM_ALEM_PARTNER_TYPE = "dam_alem"

DAM_ALEM_ENTITY_NAMES = frozenset(
    {
        "food_restaurants",
        "food_categories",
        "food_items",
        "food_settings",
        "food_modifiers",
        "food_item_modifiers",
        "food_orders",
        "item_modifier_groups",
    }
)


def _decode_bearer(request: Request) -> dict | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        return decode_access_token(token)
    except (AccessTokenError, Exception):
        return None


def is_panel_admin_payload(payload: dict | None) -> bool:
    return bool(payload and payload.get("role") == "admin" and payload.get("username"))


def is_dam_alem_partner_payload(payload: dict | None) -> bool:
    return bool(
        payload
        and payload.get("role") == "partner"
        and payload.get("partner_type") == DAM_ALEM_PARTNER_TYPE
        and payload.get("type") == "partner_session"
    )


def can_access_dam_alem_entity(request: Request, entity: str) -> bool:
    """Return True when request may read/write a DAM ALEM food entity."""
    payload = _decode_bearer(request)
    if is_panel_admin_payload(payload):
        return True
    if entity in DAM_ALEM_ENTITY_NAMES and is_dam_alem_partner_payload(payload):
        return True
    return False


def require_dam_alem_partner(request: Request) -> dict:
    payload = _decode_bearer(request)
    if not is_dam_alem_partner_payload(payload):
        raise HTTPException(status_code=403, detail="Доступ только для партнёра DAM ALEM.")
    return payload


def require_food_panel_access(request: Request) -> dict:
    """Platform admin or DAM ALEM partner — for food admin API routes."""
    payload = _decode_bearer(request)
    if is_panel_admin_payload(payload) or is_dam_alem_partner_payload(payload):
        return payload or {}
    raise HTTPException(status_code=403, detail="Требуется авторизация администратора или партнёра.")
