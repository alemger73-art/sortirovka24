"""Parse inbound WhatsApp text into bot intents (no LLM)."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class BotIntent:
    """Named intent with optional free-text query."""

    name: str  # help | menu | category | search | lookup | unknown
    query: str = ""


_HELP_ALIASES = frozenset(
    {
        "помощь",
        "справка",
        "help",
        "/help",
        "/start",
        "start",
        "?",
        "команды",
    }
)
_MENU_ALIASES = frozenset(
    {
        "меню",
        "menu",
        "/menu",
        "каталог",
        "категории",
    }
)


def parse_intent(text: str) -> BotIntent:
    """Map user text to a structured intent.

    Supported (ru/en):
      - помощь / help
      - меню / menu
      - категория <name>
      - найди <query>
      - bare text → lookup (dish/category name)
    """
    raw = (text or "").strip()
    if not raw:
        return BotIntent(name="unknown", query="")

    low = raw.lower().strip()
    # Strip common leading bot slash forms.
    low_cmd = low[1:] if low.startswith("/") else low

    if low in _HELP_ALIASES or low_cmd in _HELP_ALIASES:
        return BotIntent(name="help", query="")

    if low in _MENU_ALIASES or low_cmd in _MENU_ALIASES:
        return BotIntent(name="menu", query="")

    category_match = re.match(
        r"^(?:категория|category|cat)\s+(.+)$",
        raw,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if category_match:
        return BotIntent(name="category", query=category_match.group(1).strip())

    search_match = re.match(
        r"^(?:найди|найти|поиск|search|find)\s+(.+)$",
        raw,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if search_match:
        return BotIntent(name="search", query=search_match.group(1).strip())

    # Single-token command without query → help/unknown rather than empty lookup.
    if low_cmd in ("категория", "category", "найди", "найти", "поиск", "search", "find"):
        return BotIntent(name="help", query="")

    return BotIntent(name="lookup", query=raw)


def help_text(brand: str) -> str:
    """Short command help. Orders are intentionally not available via bot yet."""
    name = (brand or "DAM ALEM").strip() or "DAM ALEM"
    return (
        f"👋 {name} — WhatsApp-бот (каталог)\n\n"
        "Команды:\n"
        "• меню — список категорий\n"
        "• категория <название> — блюда в категории\n"
        "• найди <текст> — поиск по блюдам\n"
        "• помощь — эта справка\n\n"
        "Можно просто написать название блюда или категории.\n\n"
        "⚠️ Оформление заказов через бота пока недоступно — "
        "закажите на сайте или в приложении Sortirovka24."
    )
