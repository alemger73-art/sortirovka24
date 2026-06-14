"""Support / donation page settings."""

from __future__ import annotations

from typing import Any, Dict, List

from models.support_settings import SupportSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

DEFAULT_SUPPORT_SETTINGS: Dict[str, str] = {
    "promo_enabled": "true",
    "recipient": "ИП / ФО «Сортировка 24»",
    "bank": "АО «Kaspi Bank»",
    "iban": "KZ000000000000000000",
    "bin": "000000000000",
    "kaspi_phone": "+7 (700) 123-45-67",
    "kaspi_qr_url": "",
    "purpose": "Добровольная поддержка проекта Sortirovka24",
    "contact_email": "sortirovka.portal@mail.ru",
}

PUBLIC_KEYS = (
    "promo_enabled",
    "recipient",
    "bank",
    "iban",
    "bin",
    "kaspi_phone",
    "kaspi_qr_url",
    "purpose",
    "contact_email",
)


def settings_to_dict(rows: List[SupportSettings]) -> Dict[str, str]:
    merged = dict(DEFAULT_SUPPORT_SETTINGS)
    for row in rows:
        if row.key and row.value is not None:
            merged[row.key] = row.value
    return merged


def public_settings_payload(settings: Dict[str, str]) -> Dict[str, Any]:
    return {
        "promo_enabled": settings.get("promo_enabled", "true") == "true",
        "recipient": settings.get("recipient", ""),
        "bank": settings.get("bank", ""),
        "iban": settings.get("iban", ""),
        "bin": settings.get("bin", ""),
        "kaspi_phone": settings.get("kaspi_phone", ""),
        "kaspi_qr_url": settings.get("kaspi_qr_url", ""),
        "purpose": settings.get("purpose", ""),
        "contact_email": settings.get("contact_email", ""),
    }


async def ensure_support_settings(db: AsyncSession) -> None:
    existing = (await db.execute(select(SupportSettings))).scalars().all()
    if existing:
        return
    for key, value in DEFAULT_SUPPORT_SETTINGS.items():
        db.add(SupportSettings(key=key, value=value))
    await db.commit()


async def get_settings_dict(db: AsyncSession) -> Dict[str, str]:
    await ensure_support_settings(db)
    rows = (await db.execute(select(SupportSettings))).scalars().all()
    return settings_to_dict(rows)


async def update_settings(db: AsyncSession, updates: Dict[str, str]) -> Dict[str, str]:
    await ensure_support_settings(db)
    allowed = set(DEFAULT_SUPPORT_SETTINGS.keys())
    for key, value in updates.items():
        if key not in allowed:
            continue
        row = (await db.execute(select(SupportSettings).where(SupportSettings.key == key))).scalar_one_or_none()
        if row:
            row.value = str(value)
        else:
            db.add(SupportSettings(key=key, value=str(value)))
    await db.commit()
    return await get_settings_dict(db)
