"""Profile field validation for account v2."""

from __future__ import annotations

MAX_AVATAR_URL_LENGTH = 2048


class AvatarValidationError(ValueError):
    pass


def normalize_avatar_url(value: str | None) -> str | None:
    """
    Normalize avatar for storage in users.avatar_url.

    Returns:
        - None if value is None (field not provided)
        - "" if value is empty (clear avatar)
        - https/http URL otherwise

    Raises AvatarValidationError for invalid values (e.g. base64 data URLs).
    """
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return ""
    if trimmed.startswith("data:"):
        raise AvatarValidationError(
            "Загрузите фото через хранилище. Base64 в профиле не поддерживается."
        )
    if not (trimmed.startswith("http://") or trimmed.startswith("https://")):
        raise AvatarValidationError("Аватар должен быть ссылкой http(s) на изображение")
    if len(trimmed) > MAX_AVATAR_URL_LENGTH:
        raise AvatarValidationError(f"URL аватара слишком длинный (макс. {MAX_AVATAR_URL_LENGTH})")
    return trimmed
