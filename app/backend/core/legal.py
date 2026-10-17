"""Versioned receipts; legacy clients never receive an invented acceptance date/version."""
import json
from pathlib import Path

from fastapi import HTTPException

LEGAL_VERSION = "2026-10-09"
MANIFEST = json.loads((Path(__file__).parent / "legal-archive" / f"{LEGAL_VERSION}.json").read_text(encoding="utf-8"))


def acceptance_payload(version, *, accepted, language="ru", channel="account", order=False, subject_name=None, allow_legacy=False):
    if version is None:
        # Only an existing login can retain its previous consent. New accounts
        # and orders must never silently bypass the current document receipt.
        if allow_legacy:
            return None
        if not accepted:
            raise HTTPException(400, "Подтвердите условия и согласие на обработку данных.")
        raise HTTPException(428, "Обновите приложение и подтвердите актуальные юридические документы.")
    if version != LEGAL_VERSION:
        raise HTTPException(409, "Юридические документы обновлены. Обновите страницу и ознакомьтесь с актуальной версией.")
    if not accepted:
        raise HTTPException(400, "Подтвердите условия и согласие на обработку данных.")
    subject_name = ' '.join((subject_name or '').split())
    if len(subject_name) > 120 or len(subject_name.split()) < 2:
        raise HTTPException(400, "Укажите фамилию, имя и отчество (при наличии) для согласия на обработку данных.")
    language = "kz" if language == "kz" else "ru"
    keys = ("food-terms", "consent", "privacy") if order else ("terms", "consent", "privacy")
    return {"version": version, "language": language, "channel": channel, "subject_name": subject_name,
            "documents": {key: MANIFEST["documents"][language][key]["sha256"] for key in keys},
            "marketing_consent": False, "public_disclosure_consent": False}


def add_acceptance(db, user_id, payload, *, entity="users", entity_id=None, action="legal_acceptance"):
    if payload is None:
        return
    from models.user_management import UserAction
    db.add(UserAction(user_id=str(user_id) if user_id else None, action=action,
                      entity=entity, entity_id=str(entity_id or user_id) if entity_id or user_id else None,
                      payload=json.dumps(payload, ensure_ascii=False)))
