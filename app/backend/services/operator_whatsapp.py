"""DAM ALEM orders in WhatsApp: the new-order card, the order's events, and short replies that move the order.

Everything goes from the Сортировка 24 WhatsApp number to the numbers in DAM_ORDER_WA_TO (comma-separated),
through support_bot.send_text, so the number's hourly/daily send limits still apply.

Plain WhatsApp has no buttons, so an operator answers the order message with a digit:
  1 — принять (клиент видит «Готовится»), 2 — готово / выехал, 3 — доставлено / выдано, 0 причина — отменить.
«58 3» works without replying. Only the listed numbers are heard, and each first sends the operator's PIN once
(«PIN 1234»): every action then runs through the cabinet's own API on that employee's behalf, like the Telegram console.
"""
from __future__ import annotations

import asyncio
import contextvars
import html
import logging
import os
import re
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)
_background: set[asyncio.Task] = set()
# The chat a WhatsApp command came from: its own reply already shows the change, so the relay skips it.
_acting_chat: contextvars.ContextVar[str] = contextvars.ContextVar("operator_wa_acting_chat", default="")

STEP = {"new": 0, "confirmed": 0, "preparing": 1, "ready": 2, "in_progress": 2, "done": 3}
HELP = ("*Как управлять заказом:* ответьте на сообщение с заказом цифрой\n"
        "*1* — принять (клиент увидит «Готовится»)\n"
        "*2* — готово / выехал\n"
        "*3* — доставлено / выдано\n"
        "*0 причина* — отменить, например «0 клиент отказался»\n"
        "Без ответа на сообщение — номер заказа и цифра: «58 3»")
ORDER_IN_TEXT = re.compile(r"(?:ЗАКАЗ|Заказ|№)\s*№?\s*(\d{1,7})")
COMMAND = re.compile(r"(?:№?\s*(\d{1,7})\s+)?([0-3])(?:\s+(.{3,}))?", re.S)
PIN = re.compile(r"(?:pin|пин)\s*:?\s*(\d{4})", re.I)


# ---------------- who receives, who is heard ----------------
def _digits(raw: str) -> str:
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits if len(digits) == 11 and digits.startswith("7") else ""


def recipients() -> list[str]:
    """WhatsApp chat ids from DAM_ORDER_WA_TO: «+7 747 030 40 96, 87001234567» → ['77470304096@c.us', …]."""
    numbers = [_digits(raw) for raw in (os.getenv("DAM_ORDER_WA_TO") or "").split(",")]
    return list(dict.fromkeys(f"{n}@c.us" for n in numbers if n))


def enabled() -> bool:
    from core.deploy_safety import external_side_effects_allowed
    return bool(recipients()) and external_side_effects_allowed()


def is_operator(phone: str) -> bool:
    return bool(_digits(phone)) and f"{_digits(phone)}@c.us" in recipients()


# ---------------- formatting ----------------
def whatsapp_text(card_html: str) -> str:
    """Telegram HTML in WhatsApp formatting: bold *…*, italic _…_, a link as «text: url»."""
    text = re.sub(r'<a href="([^"]+)">([^<]+)</a>', r"\2: \1", card_html)
    text = re.sub(r"</?b>", "*", text)
    text = re.sub(r"</?i>", "_", text)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text)


# ---------------- sending ----------------
async def _send(message: str, skip: str = "") -> None:
    from services.support_bot import send_text
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            for chat_id in recipients():
                if chat_id != skip and not await send_text(client, chat_id, message):
                    logger.warning("[OperatorWA] not sent to …%s (send limit or WhatsApp error)", chat_id[-8:-5])
    except Exception as exc:
        logger.warning("[OperatorWA] not sent: %s", exc)


def _schedule(coro) -> None:
    try:
        job = asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        coro.close()
        return
    _background.add(job)
    job.add_done_callback(_background.discard)


def notify_new_order(order: Any) -> None:
    """Called after a new DAM ALEM order is saved; the card is built now, sent in the background."""
    if not enabled():
        return
    from services.operator_telegram import card
    _schedule(_send(whatsapp_text(card(order)) + "\n\n" + HELP))


def relay_events(lines_html: str) -> None:
    """The order's events (status changes from anywhere, bonuses credited) — the same lines Telegram gets."""
    if enabled() and lines_html.strip():
        _schedule(_send(whatsapp_text(lines_html), skip=_acting_chat.get()))


# ---------------- an operator's reply ----------------
def _order_from(text: str) -> Optional[int]:
    match = ORDER_IN_TEXT.search(text or "")
    return int(match.group(1)) if match else None


async def handle_message(db, phone: str, body: str, quoted: str = "") -> str:
    """One message from an operator's number → the answer to send back."""
    from services import operator_console as console
    chat_key = f"wa:{_digits(phone)}"
    said = re.sub(r"\s+", " ", str(body or "")).strip()
    pin = PIN.fullmatch(said)
    staff = await console.staff_of(db, chat_key)
    if pin or (not (staff and staff.staff_id) and re.fullmatch(r"\d{4}", said)):
        return whatsapp_text(await console.bind(db, chat_key, (pin.group(1) if pin else said)))
    if not (staff and staff.staff_id):
        return "Чтобы управлять заказами DAM ALEM отсюда, пришлите PIN оператора (как в кабинете), например: *PIN 1234*"
    command = COMMAND.fullmatch(said)
    if not command:
        return HELP
    oid = int(command.group(1)) if command.group(1) else _order_from(quoted)
    if not oid:
        return "Не понял, какой заказ. Ответьте на сообщение с заказом или напишите номер и цифру: «58 3»"
    token = _acting_chat.set(f"{_digits(phone)}@c.us")
    try:
        return await _act(db, staff, oid, int(command.group(2)), (command.group(3) or "").strip())
    except console.ApiError as exc:
        return f"Заказ №{oid}: {exc}"
    finally:
        _acting_chat.reset(token)


async def _act(db, staff, oid: int, step: int, reason: str) -> str:
    from services import operator_console as console
    path = f"{console.OPS}/orders/{oid}"
    data = await console.api(db, staff, "GET", path)
    f = console.facts(data["order"])
    if f["closed"]:
        return f"Заказ №{oid} уже {'отменён' if f['status'] == 'cancelled' else 'завершён'}."
    if step == 0:
        if len(reason) < 3:
            return f"Чтобы отменить заказ №{oid}, напишите причину: «0 клиент отказался»"
        await console.api(db, staff, "PATCH", path, {"expected_version": int(data["order"].get("version") or 0),
                                                      "status": "cancelled", "cancellation_reason": reason[:500]})
        return f"❌ Заказ №{oid} отменён."
    for _ in range(4):  # «3» on a new order walks it through every step, each checked by the cabinet
        if STEP.get(f["status"], 0) >= step:
            break
        target = f["target"]
        if not target or (target == "preparing" and f["waiting_payment"]):
            break
        if f["preorder"] and target == "preparing":
            break  # a preorder is cooked on time; starting early is a decision for the cabinet
        await console.api(db, staff, "PATCH", path, {"expected_version": int(data["order"].get("version") or 0), "status": target})
        data = await console.api(db, staff, "GET", path)
        f = console.facts(data["order"])
    note = ""
    if STEP.get(f["status"], 0) < step and not f["closed"]:
        note = ("\n\n⏳ Предзаказ подтверждён — готовить ко времени, начать раньше можно в кабинете." if f["preorder"]
                else "\n\n⏳ Дальше этот шаг не проходит — откройте заказ в кабинете.")
    return whatsapp_text(console.card_text(data)) + note
