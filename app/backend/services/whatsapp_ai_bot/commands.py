"""Deterministic WhatsApp command intents for stage 2 (no OpenAI)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class BotIntent:
    name: str  # help | menu | category | search | unknown
    query: str = ""


_HELP_WORDS = frozenset(
    {
        "help",
        "помощь",
        "справка",
        "команды",
        "start",
        "старт",
        "привет",
        "здравствуйте",
        "здравствуй",
        "hi",
        "hello",
    }
)
_MENU_WORDS = frozenset({"меню", "menu", "каталог", "категории", "categories"})


def _norm(text: str) -> str:
    return " ".join((text or "").lower().replace("ё", "е").split())


def parse_intent(text: str) -> BotIntent:
    raw = (text or "").strip()
    normalized = _norm(raw)
    if not normalized:
        return BotIntent(name="help")

    if normalized in _HELP_WORDS:
        return BotIntent(name="help")
    if normalized in _MENU_WORDS:
        return BotIntent(name="menu")

    # "категория Пицца" / "кат пицца" / "раздел супы"
    for prefix in ("категория ", "кат ", "раздел "):
        if normalized.startswith(prefix):
            query = normalized[len(prefix) :].strip()
            if query:
                return BotIntent(name="category", query=query)

    # "найди донер" / "поиск пицца"
    for prefix in ("найди ", "найти ", "поиск ", "ищу "):
        if normalized.startswith(prefix):
            query = normalized[len(prefix) :].strip()
            if query:
                return BotIntent(name="search", query=query)

    # Bare category-like short query handled as category first in handler;
    # here treat remaining text as search/category candidate.
    if len(normalized) >= 2:
        return BotIntent(name="lookup", query=normalized)

    return BotIntent(name="unknown", query=normalized)


def help_text(*, brand: str = "DAM ALEM") -> str:
    return (
        f"🍽️ *{brand}* — WhatsApp-меню\n\n"
        "Команды:\n"
        "• *меню* — список категорий\n"
        "• *пицца* / название категории — блюда\n"
        "• *найди донер* — поиск по названию\n"
        "• *помощь* — эта справка\n\n"
        "Заказ через бота пока не оформляется — только просмотр меню и цен."
    )
