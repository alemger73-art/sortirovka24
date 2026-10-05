"""Shared phone normalization for KZ/RU numbers."""


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch in '0123456789')
    if not digits:
        return ""
    if len(digits) == 10:
        return f"+7{digits}"
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if not digits.startswith("7"):
        digits = "7" + digits
    return f"+{digits}"


def phone_digits(phone: str | None) -> str:
    digits = "".join(ch for ch in (phone or "") if ch in '0123456789')
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    return digits


def matches_phone(a: str | None, b: str | None) -> bool:
    left = phone_digits(a)
    right = phone_digits(b)
    return bool(left and right and left == right)


def phone_suffix_expression(column):
    """Last ten phone digits, with identical PostgreSQL/SQLite semantics.

    PostgreSQL does not interpret a negative substr start as an offset from
    the end. Use a positive position computed from the normalized length.
    """
    from sqlalchemy import func

    normalized = column
    for symbol in ('+', ' ', '-', '(', ')', '.', '\u00a0'):
        normalized = func.replace(normalized, symbol, '')
    return func.substr(normalized, func.length(normalized) - 9, 10)
