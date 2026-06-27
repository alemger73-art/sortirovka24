"""Partner-panel JWT checks for module-specific admin access."""

from __future__ import annotations

from fastapi import HTTPException, Request

from core.auth import AccessTokenError, decode_access_token

DAM_ALEM_PARTNER_TYPE = "dam_alem"
GASTRONOM_PARTNER_TYPE = "gastronom"
VOLNA_PARTNER_TYPE = "volna"
PRORAB_PARTNER_TYPE = "prorab"
PHARMACY_PARTNER_TYPE = "pharmacy"

PARTNER_TYPES: frozenset[str] = frozenset(
    {
        DAM_ALEM_PARTNER_TYPE,
        GASTRONOM_PARTNER_TYPE,
        VOLNA_PARTNER_TYPE,
        PRORAB_PARTNER_TYPE,
        PHARMACY_PARTNER_TYPE,
    }
)

PARTNER_ENTITY_NAMES: dict[str, frozenset[str]] = {
    DAM_ALEM_PARTNER_TYPE: frozenset(
        {
            "food_restaurants",
            "food_categories",
            "food_items",
            "food_settings",
            "food_modifiers",
            "food_item_modifiers",
            "food_orders",
            "item_modifier_groups",
            "banners",
        }
    ),
    GASTRONOM_PARTNER_TYPE: frozenset(
        {
            "gastronom_categories",
            "gastronom_products",
            "gastronom_orders",
            "gastronom_settings",
        }
    ),
    VOLNA_PARTNER_TYPE: frozenset(
        {
            "volna_categories",
            "volna_products",
            "volna_orders",
            "volna_settings",
        }
    ),
    PRORAB_PARTNER_TYPE: frozenset(
        {
            "prorab_categories",
            "prorab_products",
            "prorab_orders",
            "prorab_settings",
        }
    ),
    PHARMACY_PARTNER_TYPE: frozenset(
        {
            "pharmacy_categories",
            "pharmacy_products",
            "pharmacy_orders",
            "pharmacy_settings",
        }
    ),
}

# Backward-compatible alias
DAM_ALEM_ENTITY_NAMES = PARTNER_ENTITY_NAMES[DAM_ALEM_PARTNER_TYPE]

_ENTITY_TO_PARTNER: dict[str, str] = {}
for _ptype, _entities in PARTNER_ENTITY_NAMES.items():
    for _entity in _entities:
        _ENTITY_TO_PARTNER[_entity] = _ptype


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


def is_partner_payload(payload: dict | None, partner_type: str | None = None) -> bool:
    if not payload:
        return False
    if payload.get("role") != "partner" or payload.get("type") != "partner_session":
        return False
    ptype = payload.get("partner_type")
    if ptype not in PARTNER_TYPES:
        return False
    if partner_type is not None and ptype != partner_type:
        return False
    return True


def is_dam_alem_partner_payload(payload: dict | None) -> bool:
    return is_partner_payload(payload, DAM_ALEM_PARTNER_TYPE)


def partner_type_for_entity(entity: str) -> str | None:
    return _ENTITY_TO_PARTNER.get(entity)


def can_access_partner_entity(request: Request, entity: str) -> bool:
    """Platform admin or scoped partner JWT for the entity's module."""
    payload = _decode_bearer(request)
    if is_panel_admin_payload(payload):
        return True
    expected_type = partner_type_for_entity(entity)
    if expected_type and is_partner_payload(payload, expected_type):
        return entity in PARTNER_ENTITY_NAMES[expected_type]
    return False


def can_access_dam_alem_entity(request: Request, entity: str) -> bool:
    return can_access_partner_entity(request, entity)


def require_partner(request: Request, partner_type: str) -> dict:
    if partner_type not in PARTNER_TYPES:
        raise HTTPException(status_code=400, detail="Unknown partner type")
    payload = _decode_bearer(request)
    if not is_partner_payload(payload, partner_type):
        raise HTTPException(status_code=403, detail="Доступ только для партнёра.")
    return payload or {}


def require_dam_alem_partner(request: Request) -> dict:
    return require_partner(request, DAM_ALEM_PARTNER_TYPE)


def require_store_partner_or_admin(request: Request, partner_type: str) -> dict:
    """Platform admin or matching store partner — for store API routers."""
    payload = _decode_bearer(request)
    if is_panel_admin_payload(payload) or is_partner_payload(payload, partner_type):
        return payload or {}
    raise HTTPException(status_code=403, detail="Требуется авторизация администратора или партнёра.")


def require_food_panel_access(request: Request) -> dict:
    return require_store_partner_or_admin(request, DAM_ALEM_PARTNER_TYPE)
