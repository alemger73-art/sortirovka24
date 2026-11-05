"""DÄM ALEM operator console in Telegram: the operator cabinet's order actions as buttons.

A chat linked for orders (services.operator_telegram) becomes a console once the operator sends their 4-digit PIN —
the same PIN as at the cabinet's workplace. From then on every button is a request to the cabinet's own API, made
in-process on behalf of that employee: the same checks (open shift, order version, payment rules, courier rules), the
same audit and the same notifications to customers and couriers. Telegram adds no rules of its own; it only offers the
buttons the cabinet would show for the order's current state, and re-checks that state on every press.

Changing the receipt, moving a preorder, editing the address and closing an operator's shift (it needs the
procurement report) stay in the cabinet; the card says so.
"""
from __future__ import annotations

import html
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text

logger = logging.getLogger(__name__)

CB = "op:"
OPS = "/api/v1/dam-alem/operations"
SHIFTS = "/api/v1/dam-alem/shifts"
LOCAL = ZoneInfo("Asia/Almaty")
DELIVERY = ("delivery", "доставка")
NEXT = {"new": "preparing", "confirmed": "preparing", "preparing": "ready"}
STATUS = {"new": "🆕 Новый", "confirmed": "Принят", "preparing": "👨‍🍳 Готовится", "ready": "✅ Готов",
          "in_progress": "🛵 У курьера", "done": "Завершён", "cancelled": "❌ Отменён"}
DELIVERY_STATUS = {"assigned": "передан курьеру", "picked_up": "курьер забрал", "on_the_way": "в пути",
                   "arrived": "курьер на месте", "delivered": "доставлено"}
PAYMENT = {"cash": "💵 наличные", "kaspi_qr": "📱 Kaspi", "halyk_qr": "📱 Halyk"}
ISSUES = {"no_answer": "Клиент не отвечает", "wrong_address": "Неверный адрес", "refused": "Отказ клиента",
          "payment": "Проблема с оплатой", "transport": "Проблема с транспортом", "other": "Другое"}
MENU = {"📋 Активные": "active", "🆕 Новые": "new", "🛵 Ждут курьера": "courier", "💳 Долги": "debt"}
SHIFT_BUTTON = "🕐 Смена"
PIN_ATTEMPTS, PIN_WINDOW = 6, 900

_app = None


class ApiError(Exception):
    pass


# ---------------- who is at this chat ----------------
async def ensure_tables(db) -> None:
    from services.operator_telegram import ensure_tables as base
    await base(db)
    await db.execute(text("CREATE TABLE IF NOT EXISTS operator_telegram_staff (chat_id VARCHAR(32) PRIMARY KEY, "
                          "staff_id INTEGER NOT NULL, pin_version VARCHAR(32) NOT NULL, staff_name VARCHAR(160), "
                          "awaiting TEXT)"))
    await db.commit()


async def staff_of(db, chat_id: Any) -> Optional[Any]:
    await ensure_tables(db)
    return (await db.execute(text("SELECT chat_id, staff_id, pin_version, staff_name, awaiting FROM operator_telegram_staff "
                                  "WHERE chat_id = :c"), {"c": str(chat_id)})).first()


async def set_awaiting(db, chat_id: Any, value: Optional[dict]) -> None:
    await db.execute(text("UPDATE operator_telegram_staff SET awaiting = :a WHERE chat_id = :c"),
                     {"a": json.dumps(value, ensure_ascii=False) if value else None, "c": str(chat_id)})
    await db.commit()


def _pin_version(pin_hash: str) -> str:
    import hashlib
    return hashlib.sha256(pin_hash.encode()).hexdigest()[:16]


async def bind(db, chat_id: Any, pin: str) -> str:
    """The PIN says which employee works from this chat (owner or operator of DÄM ALEM)."""
    from sqlalchemy import select
    from models.partner_auth import PartnerCredentials
    from utils.courier_pin import verify_courier_pin
    from utils.rate_limit import ensure_failures_below, register_failure
    from fastapi import HTTPException
    key = f"dam-operator-tg-pin:{chat_id}"
    try:
        ensure_failures_below(key, window_seconds=PIN_WINDOW, max_failures=PIN_ATTEMPTS,
                              message="Слишком много неверных PIN. Повторите через 15 минут.")
    except HTTPException as exc:
        return str(exc.detail)
    rows = (await db.scalars(select(PartnerCredentials).where(
        PartnerCredentials.partner_type == "dam_alem", PartnerCredentials.is_active.is_(True),
        PartnerCredentials.pin_hash.isnot(None)))).all()
    matches = [r for r in rows if (r.access_role or "owner") in ("owner", "operator") and verify_courier_pin(r.pin_hash, pin)]
    if not matches:
        register_failure(key, window_seconds=PIN_WINDOW)
        return "Неверный PIN или сотрудник отключён. Пришлите PIN ещё раз."
    if len(matches) != 1:
        return "У сотрудников совпадают PIN. Владелец должен назначить разные PIN в кабинете."
    row = matches[0]
    name = row.display_name or row.email or row.phone or "Сотрудник"
    await db.execute(text("DELETE FROM operator_telegram_staff WHERE chat_id = :c"), {"c": str(chat_id)})
    await db.execute(text("INSERT INTO operator_telegram_staff (chat_id, staff_id, pin_version, staff_name) "
                          "VALUES (:c, :s, :v, :n)"), {"c": str(chat_id), "s": row.id, "v": _pin_version(row.pin_hash), "n": name[:160]})
    await db.commit()
    return (f"✅ {name}, вы вошли. Теперь заказами можно управлять прямо здесь: кнопки под заказом и меню внизу.\n\n"
            "Смена: кнопка «🕐 Смена». Сменить сотрудника — команда /pin.")


# ---------------- the cabinet's API, on behalf of the employee ----------------
def _api_app():
    """The cabinet's own routers, without the public middleware: every rule lives in the endpoints."""
    global _app
    if _app is None:
        from fastapi import FastAPI
        from routers import food_operations, food_shifts
        _app = FastAPI()
        _app.include_router(food_operations.router)
        _app.include_router(food_shifts.router)
    return _app


async def _token(db, staff: Any) -> str:
    from models.partner_auth import PartnerCredentials
    from routers.partner_auth import _create_partner_jwt
    row = await db.get(PartnerCredentials, int(staff.staff_id))
    if not row:
        raise ApiError("Сотрудник не найден. Пришлите PIN заново: /pin")
    return _create_partner_jwt(row.id, "dam_alem", row.email or row.phone or "", row.display_name or row.email or "",
                               pin_version=staff.pin_version)


def _detail(response: httpx.Response) -> str:
    try:
        detail = response.json().get("detail")
    except Exception:
        detail = None
    if response.status_code == 401:
        return "PIN изменён или вход устарел. Пришлите PIN заново: /pin"
    if isinstance(detail, str) and detail:
        return detail
    return "Не получилось. Проверьте заказ в кабинете." if response.status_code < 500 else "Ошибка сервера. Повторите через минуту."


async def api(db, staff: Any, method: str, path: str, body: Optional[dict] = None) -> dict:
    token = await _token(db, staff)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=_api_app()), base_url="http://dam") as client:
        response = await client.request(method, path, json=body, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if response.status_code >= 400:
        raise ApiError(_detail(response))
    return response.json() if response.content else {}


# ---------------- the order card ----------------
def _money(value: Any) -> str:
    return f"{round(float(value or 0)):,}".replace(",", " ") + " ₸"


def _local(iso: Any) -> str:
    try:
        moment = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).astimezone(LOCAL).strftime("%d.%m %H:%M")
    except (TypeError, ValueError):
        return ""


def facts(order: dict) -> dict:
    """The same derived values the cabinet's order screen uses (pages/DamAlemOrders.tsx)."""
    delivery = (order.get("delivery_method") or "") in DELIVERY
    status = order.get("status") or ""
    total = float(order.get("total_amount") or 0)
    paid = order.get("payment_status") == "paid"
    received = float(order["paid_amount"]) if order.get("paid_amount") is not None else (total if paid else 0)
    preorder = bool(order.get("is_future_preorder"))
    target = "confirmed" if status == "new" and preorder else "done" if status == "ready" and not delivery else NEXT.get(status)
    confirm = order.get("manual_payment_confirmation")
    return {"delivery": delivery, "status": status, "closed": status in ("done", "cancelled"), "paid": paid,
            "remaining": max(0.0, total - received), "preorder": preorder, "target": target,
            "can_confirm": bool(order.get("payment_method") == "cash" if confirm is None else confirm)}


def target_label(f: dict) -> str:
    if f["preorder"] and f["target"] == "confirmed":
        return "✅ Подтвердить предзаказ"
    if f["preorder"] and f["target"] == "preparing":
        return "👨‍🍳 Начать приготовление раньше"
    return {"confirmed": "✅ Принять заказ", "preparing": "👨‍🍳 Передать на кухню", "ready": "✅ Готово",
            "done": "📦 Выдать заказ"}.get(f["target"], f["target"])


def card_text(data: dict) -> str:
    e = html.escape
    o, d = data["order"], data.get("delivery") or {}
    f = facts(o)
    lines = [f"<b>Заказ №{o['id']}</b> · {STATUS.get(f['status'], f['status'])}"]
    lines.append(f"👤 {e(o.get('customer_name') or 'Клиент')}" + (f" · 📞 {e(o['customer_phone'])}" if o.get("customer_phone") else ""))
    lines.append("🚗 Доставка" if f["delivery"] else "🏪 Самовывоз" if o.get("delivery_method") != "dine_in" else "🍽 В зале")
    if f["delivery"] and o.get("delivery_address"):
        lines.append(f"📍 <b>{e(o['delivery_address'])}</b>")
    if o.get("scheduled_for"):
        lines.append(f"⏰ Предзаказ на {_local(o['scheduled_for'])}")
    if o.get("comment"):
        lines.append(f"💬 {e(str(o['comment']))[:400]}")
    if o.get("operator_note"):
        lines.append(f"📝 {e(str(o['operator_note']))[:300]}")
    try:
        items = json.loads(o.get("order_items") or "[]")
    except (TypeError, ValueError):
        items = []
    if isinstance(items, list) and items:
        lines.append("")
        for row in items[:30]:
            if isinstance(row, dict) and row.get("name"):
                qty = int(row.get("quantity") or 1)
                price = (float(row.get("price") or 0) + float(row.get("modTotal") or 0)) * qty
                lines.append(f"• {e(str(row['name']))} × {qty} — {_money(price)}")
    lines.append("")
    pay = PAYMENT.get(o.get("payment_method") or "", o.get("payment_method") or "—")
    state = "оплачено" if f["paid"] else f"ждём {_money(f['remaining'])}"
    lines.append(f"💰 <b>{_money(o.get('total_amount'))}</b> · {pay} · {state}")
    if o.get("payment_method") == "cash" and o.get("cash_given_amount") and o.get("change_amount"):
        lines.append(f"Клиент даст {_money(o['cash_given_amount'])}, сдача {_money(o['change_amount'])}")
    if o.get("invoice_sent_at"):
        lines.append("📲 Счёт клиенту выставлен")
    if d.get("courier_name"):
        lines.append(f"🛵 {e(d['courier_name'])}" + (f" · {e(d['courier_phone'])}" if d.get("courier_phone") else "")
                     + f" · {DELIVERY_STATUS.get(d.get('status'), d.get('status') or '')}")
    if o.get("cancellation_reason") and f["status"] == "cancelled":
        lines.append(f"Причина отмены: {e(o['cancellation_reason'])}")
    if f["target"] == "preparing" and o.get("payment_method") != "cash" and f["remaining"] > 0 and not f["closed"]:
        lines.append("⏳ На кухню — после оплаты")
    if not f["closed"]:
        lines.append("<i>Состав, адрес и перенос предзаказа — в кабинете</i>")
    return "\n".join(lines)


def _b(label: str, data: str) -> dict:
    return {"text": label, "callback_data": data}


def card_keyboard(data: dict) -> dict:
    o, d = data["order"], data.get("delivery") or {}
    f, oid = facts(o), o["id"]
    rows: list[list[dict]] = []
    blocked = f["target"] == "preparing" and o.get("payment_method") != "cash" and f["remaining"] > 0
    if not f["closed"] and f["target"] and not blocked:
        rows.append([_b(target_label(f), f"{CB}s:{oid}:{f['status']}:{f['target']}")])
    unpaid = o.get("payment_status") != "paid"
    if not f["closed"] and o.get("payment_method") != "cash" and unpaid and o.get("invoice_phone"):
        rows.append([_b("📲 Счёт выставлен клиенту", f"{CB}i:{oid}")])
    if f["can_confirm"] and unpaid:
        if f["status"] == "done" and f["delivery"] and o.get("payment_method") == "cash" and d.get("courier_name"):
            rows.append([_b("💵 Деньги у курьера", f"{CB}pk:{oid}"), _b("💵 Уже в кассе", f"{CB}pb:{oid}")])
        elif f["status"] != "cancelled":
            rows.append([_b("💰 Оплата получена", f"{CB}p:{oid}")])
    if f["delivery"] and f["status"] in ("preparing", "ready", "in_progress"):
        rows.append([_b("🛵 Переназначить курьера" if f["status"] == "in_progress" else "🛵 Назначить курьера", f"{CB}c:{oid}")])
    if f["delivery"] and f["status"] == "in_progress":
        rows.append([_b("✅ Доставлено (вручную)", f"{CB}m:{oid}"), _b("⚠️ Проблема", f"{CB}q:{oid}")])
    if f["delivery"] and d and d.get("courier_payout") is None and not f["closed"]:
        rows.append([_b("🪙 Зафиксировать тариф курьера", f"{CB}t:{oid}")])
    last = [_b("🔄 Обновить", f"{CB}r:{oid}")]
    if not f["closed"]:
        last.insert(0, _b("❌ Отменить", f"{CB}x:{oid}"))
    rows.append(last)
    return {"inline_keyboard": rows}


def menu_keyboard() -> dict:
    names = list(MENU)
    return {"keyboard": [[{"text": names[0]}, {"text": names[1]}], [{"text": names[2]}, {"text": names[3]}],
                         [{"text": SHIFT_BUTTON}]], "resize_keyboard": True, "is_persistent": True}


# ---------------- Telegram plumbing ----------------
async def _send(client, chat_id, message: str, keyboard: Optional[dict] = None) -> None:
    from services.news_agent import tg
    await tg(client, "sendMessage", {"chat_id": chat_id, "text": message, "parse_mode": "HTML",
                                     "disable_web_page_preview": True, **({"reply_markup": keyboard} if keyboard else {})})


async def _edit(client, chat_id, message_id, message: str, keyboard: Optional[dict]) -> None:
    from services.news_agent import tg
    try:
        await tg(client, "editMessageText", {"chat_id": chat_id, "message_id": message_id, "text": message, "parse_mode": "HTML",
                                             "disable_web_page_preview": True, "reply_markup": keyboard or {"inline_keyboard": []}})
    except Exception as exc:  # «message is not modified» after «Обновить» is normal
        logger.info("[OperatorConsole] card not updated: %s", exc)


async def card(db, staff, order_id: int) -> tuple[str, dict]:
    data = await api(db, staff, "GET", f"{OPS}/orders/{order_id}")
    return card_text(data), card_keyboard(data)


async def send_card(db, client, staff, chat_id, order_id: int, header: str = "") -> None:
    body, keyboard = await card(db, staff, order_id)
    await _send(client, chat_id, (header + "\n\n" if header else "") + body, keyboard)


# ---------------- typed messages ----------------
async def handle_text(db, client, chat: dict, message: dict) -> bool:
    """Menu buttons, /pin and the answers the console asked for (PIN, reasons). True when the message was ours."""
    from services.news_agent import tg
    chat_id = chat.get("id")
    said = str(message.get("text") or "").strip()
    from services.operator_telegram import chats
    if str(chat_id) not in await chats(db):
        return False  # only a chat linked with the owner's one-time link may become a console
    staff = await staff_of(db, chat_id)
    awaiting = json.loads(staff.awaiting) if staff and staff.awaiting else None
    bound = bool(staff and staff.staff_id)
    if said.split()[:1] == ["/pin"]:
        await _ask_pin(db, client, chat_id, staff)
        return True
    if awaiting and said.startswith("/"):
        await set_awaiting(db, chat_id, None)
        await _send(client, chat_id, "Хорошо, отменено.", menu_keyboard() if bound else None)
        return True
    if awaiting:
        if awaiting.get("kind") in ("pin_link", "pin_shift"):
            try:  # the PIN must not stay in the chat history
                await tg(client, "deleteMessage", {"chat_id": chat_id, "message_id": message.get("message_id")})
            except Exception:
                pass
        await _answer(db, client, chat_id, staff, awaiting, said)
        return True
    if bound and said in MENU:
        await _list(db, client, chat_id, staff, MENU[said], said)
        return True
    if bound and said == SHIFT_BUTTON:
        await _shift(db, client, chat_id, staff)
        return True
    return False


async def _ask_pin(db, client, chat_id, staff) -> None:
    if staff is None:
        await db.execute(text("INSERT INTO operator_telegram_staff (chat_id, staff_id, pin_version, awaiting) "
                              "VALUES (:c, 0, '', :a)"), {"c": str(chat_id), "a": json.dumps({"kind": "pin_link"})})
        await db.commit()
    else:
        await set_awaiting(db, chat_id, {"kind": "pin_link"})
    await _send(client, chat_id, "Чтобы управлять заказами отсюда, пришлите ваш PIN оператора — 4 цифры, как на рабочем месте.\n"
                                 "Сообщение с PIN сразу удалится.")


async def _answer(db, client, chat_id, staff, awaiting: dict, said: str) -> None:
    kind = awaiting.get("kind")
    if kind == "pin_link":
        if not (said.isdigit() and len(said) == 4):
            await _send(client, chat_id, "PIN — это 4 цифры. Пришлите ещё раз или /cancel.")
            return
        answer = await bind(db, chat_id, said)
        bound = await staff_of(db, chat_id)
        if bound and bound.staff_id:
            await set_awaiting(db, chat_id, None)
        await _send(client, chat_id, html.escape(answer), menu_keyboard() if bound and bound.staff_id else None)
        return
    await set_awaiting(db, chat_id, None)
    if not staff or not staff.staff_id:
        await _ask_pin(db, client, chat_id, staff)
        return
    oid = awaiting.get("order")
    try:
        if kind == "pin_shift":
            if not (said.isdigit() and len(said) == 4):
                raise ApiError("PIN — это 4 цифры. Нажмите «🕐 Смена» ещё раз.")
            await api(db, staff, "POST", f"{SHIFTS}/open", {"pin": said})
            await _send(client, chat_id, "✅ Смена открыта. Удачной работы!", menu_keyboard())
            return
        if len(said) < 3:
            raise ApiError("Напишите причину словами (от 3 букв). Действие не выполнено.")
        if kind == "cancel":
            await api(db, staff, "PATCH", f"{OPS}/orders/{oid}", {"expected_version": awaiting["version"], "status": "cancelled",
                                                                 "cancellation_reason": said[:500]})
            result = "❌ Заказ отменён"
        elif kind == "reassign":
            await api(db, staff, "POST", f"{OPS}/orders/{oid}/reassign-courier",
                      {"courier_id": awaiting["courier"], "expected_version": awaiting["version"], "reason": said[:500]})
            result = "🛵 Курьер переназначен"
        elif kind == "issue":
            await api(db, staff, "POST", f"{OPS}/orders/{oid}/delivery-issue", {"reason": "other", "comment": said[:1000]})
            result = "⚠️ Проблема доставки записана"
        elif kind == "manual":
            await api(db, staff, "POST", f"{OPS}/orders/{oid}/manual-delivery",
                      {"expected_version": awaiting["version"], "reason": "other", "cash_received": False, "comment": said[:1000]})
            result = "✅ Доставка завершена без получения денег"
        else:
            return
        await send_card(db, client, staff, chat_id, oid, result)
    except ApiError as exc:
        await _send(client, chat_id, f"⚠️ {html.escape(str(exc))}")


async def _list(db, client, chat_id, staff, status: str, title: str) -> None:
    try:
        data = await api(db, staff, "GET", f"{OPS}/orders?status={status}&limit=15")
    except ApiError as exc:
        await _send(client, chat_id, f"⚠️ {html.escape(str(exc))}")
        return
    items = data.get("items") or []
    if not items:
        await _send(client, chat_id, f"{title}: заказов нет.", menu_keyboard())
        return
    lines = [f"<b>{title}</b> · {data.get('total', len(items))}"]
    buttons = []
    for o in items:
        who = html.escape(o.get("customer_name") or "Клиент")
        kind = "🚗" if (o.get("delivery_method") or "") in DELIVERY else "🏪"
        lines.append(f"№{o['id']} · {STATUS.get(o.get('status'), o.get('status'))} · {kind} {who} · {_money(o.get('total_amount'))}")
        buttons.append(_b(f"№{o['id']}", f"{CB}o:{o['id']}"))
    rows = [buttons[i:i + 4] for i in range(0, len(buttons), 4)]
    await _send(client, chat_id, "\n".join(lines) + "\n\nНажмите номер, чтобы открыть заказ.", {"inline_keyboard": rows})


async def _shift(db, client, chat_id, staff) -> None:
    try:
        me = await api(db, staff, "GET", f"{SHIFTS}/me")
    except ApiError as exc:
        await _send(client, chat_id, f"⚠️ {html.escape(str(exc))}")
        return
    shift = me.get("shift")
    name = html.escape(str((me.get("staff") or {}).get("name") or staff.staff_name or ""))
    if shift:
        opened = _local(shift.get("opened_at"))
        await _send(client, chat_id, f"🕐 {name}: смена открыта{(' с ' + opened) if opened else ''}.\n"
                                     "Закрыть смену с закупным отчётом — в кабинете.",
                    {"inline_keyboard": [[_b("Закрыть смену", f"{CB}sc:{shift.get('id')}")]]})
    else:
        await set_awaiting(db, chat_id, {"kind": "pin_shift"})
        await _send(client, chat_id, f"🕐 {name}: смена не открыта.\nЧтобы открыть, пришлите ваш PIN (сообщение удалится).")


# ---------------- buttons ----------------
async def handle_callback(db, client, data: str, chat_id: Any, message: dict) -> str:
    staff = await staff_of(db, chat_id)
    if not staff or not staff.staff_id:
        await _ask_pin(db, client, chat_id, staff)
        return "Сначала пришлите PIN оператора"
    parts = data[len(CB):].split(":")
    action, rest = parts[0], parts[1:]
    if not rest or not rest[0].isdigit():
        return "Кнопка устарела"
    oid = int(rest[0])
    msg_id = message.get("message_id")
    try:
        if action == "sc":
            await api(db, staff, "POST", f"{SHIFTS}/close", {"shift_id": oid})
            await _edit(client, chat_id, msg_id, "🕐 Смена закрыта.", None)
            return "Смена закрыта"
        if action == "o":
            await send_card(db, client, staff, chat_id, oid)
            return "Открыт заказ №%d" % oid
        result = await _act(db, client, staff, chat_id, msg_id, action, oid, rest[1:])
    except ApiError as exc:
        result = str(exc)
        try:
            body, keyboard = await card(db, staff, oid)
            await _edit(client, chat_id, msg_id, body, keyboard)
        except ApiError:
            pass
        return result[:190]
    return (result or "Готово")[:190]


async def _act(db, client, staff, chat_id, msg_id, action: str, oid: int, args: list[str]) -> Optional[str]:
    data = await api(db, staff, "GET", f"{OPS}/orders/{oid}")
    o, d = data["order"], data.get("delivery") or {}
    f, version = facts(o), int(o.get("version") or 0)

    async def show(result: Optional[str] = None, *, extra: Optional[list] = None, note: str = "") -> Optional[str]:
        fresh = await api(db, staff, "GET", f"{OPS}/orders/{oid}") if result else data
        keyboard = {"inline_keyboard": extra} if extra is not None else card_keyboard(fresh)
        await _edit(client, chat_id, msg_id, card_text(fresh) + (f"\n\n{note}" if note else ""), keyboard)
        return result

    back = [_b("↩️ Назад", f"{CB}r:{oid}")]
    if action == "r":
        return await show() or "Обновлено"
    if action in ("s", "S"):
        source, target = (args + ["", ""])[:2]
        if f["status"] != source or f["target"] != target:
            await show()
            return "Заказ уже изменён — карточка обновлена"
        if action == "s" and f["preorder"] and target == "preparing":
            return await show(None, extra=[[_b("Да, начать раньше", f"{CB}S:{oid}:{source}:{target}")], back],
                              note="Начать приготовление раньше? Заказ сразу перейдёт в работу.")
        body = {"expected_version": version, "status": target, **({"start_early": True} if action == "S" else {})}
        await api(db, staff, "PATCH", f"{OPS}/orders/{oid}", body)
        return await show(STATUS.get(target, "Готово") if target != "done" else "Заказ выдан")
    if action == "i":
        await api(db, staff, "POST", f"{OPS}/orders/{oid}/invoice-sent")
        return await show("Клиенту сообщили: счёт ждёт его в приложении банка")
    if action == "p":
        question = ("Подтверждаете, что наличные фактически получены в кассу?" if o.get("payment_method") == "cash" else
                    f"Подтверждаете, что поступление {_money(f['remaining'])} проверено? Оплату отметите вы, а не банк.")
        return await show(None, extra=[[_b("Да, деньги получены", f"{CB}pc:{oid}:{version}")], back], note=f"<b>{question}</b>")
    if action == "pc":
        await api(db, staff, "PATCH", f"{OPS}/orders/{oid}", {"expected_version": int(args[0]) if args else version, "payment_status": "paid"})
        return await show("Оплата отмечена")
    if action in ("pk", "pb"):
        await api(db, staff, "PATCH", f"{OPS}/orders/{oid}", {"expected_version": version, "payment_status": "paid",
                                                              "cash_location": "courier" if action == "pk" else "cashbox"})
        return await show("Оплата отмечена")
    if action == "c":
        couriers = (await api(db, staff, "GET", f"{OPS}/couriers")).get("items") or []
        rows = [[_b(f"{c['name']}" + (" · в доставке" if c.get("active_deliveries") else " · свободен"), f"{CB}ca:{oid}:{c['id']}")]
                for c in couriers if c.get("assignable")]
        absent = [html.escape(c["name"]) for c in couriers if not c.get("assignable")]
        note = "<b>Выберите курьера</b>" if rows else "<b>Нет курьеров на смене.</b> Курьер должен открыть смену в своём кабинете."
        if absent:
            note += "\nНе на смене: " + ", ".join(absent[:10])
        return await show(None, extra=rows + [back], note=note)
    if action == "ca":
        courier = args[0] if args else ""
        if f["status"] == "in_progress":
            await set_awaiting(db, chat_id, {"kind": "reassign", "order": oid, "courier": courier, "version": version})
            await _send(client, chat_id, f"Заказ №{oid}: напишите причину переназначения курьера (или /cancel).")
            return "Напишите причину"
        await api(db, staff, "POST", f"{OPS}/orders/{oid}/assign-courier", {"courier_id": courier})
        return await show("Заказ передан курьеру")
    if action == "m":
        due = f["remaining"]
        if o.get("payment_method") == "cash" and due > 0:
            extra = [[_b(f"Деньги у курьера ({_money(due)})", f"{CB}mc:{oid}")], [_b("Деньги не получены", f"{CB}mn:{oid}")], back]
        else:
            extra = [[_b("Да, заказ доставлен", f"{CB}mp:{oid}")], back]
        return await show(None, extra=extra, note="<b>Завершить доставку вручную?</b>")
    if action in ("mc", "mp"):
        body = {"expected_version": version, "reason": "courier", **({"cash_received": True} if action == "mc" else {})}
        await api(db, staff, "POST", f"{OPS}/orders/{oid}/manual-delivery", body)
        return await show("Доставка завершена")
    if action == "mn":
        await set_awaiting(db, chat_id, {"kind": "manual", "order": oid, "version": version})
        await _send(client, chat_id, f"Заказ №{oid}: напишите, почему деньги не получены (или /cancel).")
        return "Напишите комментарий"
    if action == "q":
        rows = [[_b(label, f"{CB}qr:{oid}:{key}")] for key, label in ISSUES.items()]
        return await show(None, extra=rows + [back], note="<b>Что случилось с доставкой?</b>")
    if action == "qr":
        reason = args[0] if args else ""
        if reason == "other":
            await set_awaiting(db, chat_id, {"kind": "issue", "order": oid})
            await _send(client, chat_id, f"Заказ №{oid}: опишите проблему (или /cancel).")
            return "Опишите проблему"
        if reason not in ISSUES:
            return "Кнопка устарела"
        await api(db, staff, "POST", f"{OPS}/orders/{oid}/delivery-issue", {"reason": reason, "comment": ""})
        return await show("Проблема записана")
    if action == "t":
        await api(db, staff, "POST", f"{OPS}/orders/{oid}/courier-payout", {"expected_version": version})
        return await show("Тариф курьера зафиксирован")
    if action == "x":
        await set_awaiting(db, chat_id, {"kind": "cancel", "order": oid, "version": version})
        await _send(client, chat_id, f"Заказ №{oid}: напишите причину отмены (или /cancel, чтобы не отменять).")
        return "Напишите причину отмены"
    return "Кнопка устарела"
