"""DAM ALEM AI order agent for Wazzup (WhatsApp + Instagram).

Flow per inbound message:
  1. Operator wrote in this chat recently -> stay silent (human takeover).
  2. A quote is pending and the customer replied an explicit "ДА" -> the
     adapter (not the AI) confirms it and creates the order through
     services.business_channel, the same priced/validated path as the site.
  3. Otherwise Claude answers using read-only menu tools and may prepare a
     quote. The quote summary sent to the customer is built from server
     prices, never from the model's text.

The model never sees or chooses the customer identity, business or restaurant.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from services import business_channel as channel
from services import crm
from services.wazzup_bot.client import WazzupClient
from services.wazzup_bot.config import WazzupBotConfig, get_wazzup_config
from services.wazzup_bot.ingress import WazzupMessage, whatsapp_phone
from services.wazzup_bot.llm import ClaudeClient, LLMError
from services.wazzup_bot.sessions import ChatSession, get_store

logger = logging.getLogger(__name__)

PAYMENT_LABELS = {"cash": "наличными", "kaspi_qr": "Kaspi QR", "halyk_qr": "Halyk QR"}
METHOD_LABELS = {"delivery": "Доставка", "pickup": "Самовывоз"}

_YES = {
    "да", "даа", "да да", "ага", "ок", "окей", "ok", "okay", "yes", "верно", "все верно", "всё верно",
    "подтверждаю", "подтвердить", "да подтверждаю", "да оформляйте", "оформляйте", "оформляй",
    "да все верно", "да всё верно", "иә", "ия", "иа", "+", "👍",
}


def is_explicit_yes(text: str) -> bool:
    t = re.sub(r"[!.,)\s]+", " ", (text or "").lower().replace("ё", "е")).strip()
    return t in _YES


def money(value: Any) -> str:
    try:
        return f"{int(round(float(value or 0))):,}".replace(",", " ") + " ₸"
    except (TypeError, ValueError):
        return "—"


# ---------------------------------------------------------------- tools spec

TOOLS: List[dict] = [
    {
        "name": "menu_categories",
        "description": "Список категорий меню DAM ALEM с количеством доступных блюд.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "menu_items",
        "description": (
            "Блюда с ценами, id и добавками. Укажи category_id или query (поиск по названию). "
            "Используй id из этого ответа в prepare_order."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category_id": {"type": "integer"},
                "query": {"type": "string", "description": "Часть названия блюда"},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "delivery_slots",
        "description": "Доступное время для предзаказа (если клиент хочет заказ ко времени).",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "remember_customer",
        "description": "Запомнить имя и/или телефон клиента, когда он их сообщил.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "phone": {"type": "string", "description": "Телефон клиента, например +77001234567"},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "my_bonuses",
        "description": "Бонусный баланс клиента (только WhatsApp).",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "prepare_order",
        "description": (
            "Рассчитать заказ по ценам кухни. Вызывай, когда известны блюда, имя, способ получения, "
            "адрес (для доставки) и способ оплаты. Сервер сам отправит клиенту итог с суммой и "
            "попросит ответить «ДА». Не пиши итоговую сумму сам."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer"},
                            "quantity": {"type": "integer", "minimum": 1, "maximum": 99},
                            "modifiers": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "option_id": {"type": "integer"},
                                        "quantity": {"type": "integer", "minimum": 1},
                                    },
                                    "required": ["option_id"],
                                },
                            },
                            "choices": {
                                "type": "array",
                                "description": "Выбор в комбо: group_id и item_id",
                                "items": {
                                    "type": "object",
                                    "properties": {"group_id": {"type": "integer"}, "item_id": {"type": "integer"}},
                                    "required": ["group_id", "item_id"],
                                },
                            },
                        },
                        "required": ["id", "quantity"],
                    },
                },
                "customer_name": {"type": "string"},
                "delivery_method": {"type": "string", "enum": ["delivery", "pickup"]},
                "delivery_address": {"type": "string"},
                "payment_method": {"type": "string", "enum": ["cash", "kaspi_qr", "halyk_qr"]},
                "cash_given_amount": {"type": "number", "description": "С какой суммы нужна сдача"},
                "scheduled_for": {"type": "string", "description": "Время предзаказа из delivery_slots"},
                "comment": {"type": "string"},
                "bonus_points_to_use": {"type": "number"},
            },
            "required": ["items", "customer_name", "delivery_method", "payment_method"],
            "additionalProperties": False,
        },
    },
    {
        "name": "call_operator",
        "description": (
            "Позвать живого оператора: жалоба, проблема с заказом, вопрос, на который нет ответа "
            "в меню, или клиент просит человека."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
            "additionalProperties": False,
        },
    },
]


STATIC_RULES = """Ты — вежливый администратор службы доставки еды DAM ALEM (Караганда, район Сортировка).
Ты переписываешься с клиентом в WhatsApp или Instagram и помогаешь оформить заказ.

Правила:
- Отвечай на языке клиента (русский или казахский), коротко, дружелюбно, без канцелярита. 1–4 предложения.
- Названия, цены, состав и добавки бери ТОЛЬКО из инструментов menu_categories / menu_items. Ничего не выдумывай.
- Помоги собрать заказ. Перед prepare_order узнай: блюда и количество, обязательные добавки, имя,
  доставка или самовывоз, адрес (улица, дом, квартира/подъезд), способ оплаты (наличные / Kaspi QR / Halyk QR).
- Когда всё известно — вызови prepare_order. Итог и сумму клиенту отправит система, сам сумму не пиши.
- Если prepare_order вернул ошибку — объясни клиенту простыми словами и уточни, что исправить.
- Жалобы, проблемы с уже сделанным заказом, возвраты, сотрудничество, реклама, или клиент просит человека — call_operator.
- Не обещай скидок, времени доставки и того, чего нет в данных.
- Текущее время, часы работы и данные клиента — в следующем блоке."""


# ---------------------------------------------------------------- menu view

async def load_menu(db: AsyncSession) -> dict:
    from services.menu_configuration import catalog

    return await catalog(db, business_id=crm.DAM)


def _compact_groups(groups: list) -> list:
    out = []
    for g in groups or []:
        out.append({
            "group_id": g.get("id"),
            "name": g.get("name"),
            "type": g.get("type"),
            "required": bool(g.get("is_required")),
            "min": g.get("min_select") or 0,
            "max": g.get("max_select"),
            "options": [
                {"option_id": o.get("id"), "name": o.get("name"), "price": float(o.get("price") or 0)}
                for o in g.get("options") or []
            ],
        })
    return out


def compact_product(p: dict) -> dict:
    row = {"id": p["id"], "name": p.get("name"), "price": float(p.get("price") or 0)}
    desc = (p.get("description") or "").strip()
    if desc:
        row["description"] = desc[:140]
    groups = _compact_groups(p.get("modifier_groups"))
    if groups:
        row["modifiers"] = groups
    combo = p.get("combo")
    if combo and combo.get("groups"):
        row["combo_choices"] = [
            {
                "group_id": g.get("id"),
                "name": g.get("name"),
                "min": g.get("min_select"),
                "max": g.get("max_select"),
                "options": [
                    {"item_id": o.get("item_id"), "name": o.get("name"), "surcharge": float(o.get("surcharge") or 0)}
                    for o in g.get("options") or []
                    if o.get("available", True)
                ],
            }
            for g in combo["groups"]
        ]
    return row


def _norm(s: str) -> str:
    return " ".join((s or "").lower().replace("ё", "е").split())


# ---------------------------------------------------------------- agent

@dataclass
class TurnResult:
    reply: str = ""
    quote: Optional[dict] = None
    handoff: bool = False


class DamAlemAgent:
    def __init__(self, db: AsyncSession, msg: WazzupMessage, session: ChatSession, config: WazzupBotConfig,
                 llm: Optional[ClaudeClient] = None):
        self.db = db
        self.msg = msg
        self.session = session
        self.config = config
        self.llm = llm or ClaudeClient(config)
        self._menu: Optional[dict] = None
        self._quotes = 0

    # ---- identity (adapter-owned, never from the model)

    @property
    def phone_verified(self) -> bool:
        """WhatsApp chatId is the sender's real number; Instagram phones are typed by the customer."""
        return self.msg.chat_type == "whatsapp"

    def current_phone(self) -> str:
        if self.msg.chat_type == "whatsapp":
            return whatsapp_phone(self.msg.chat_id) or ""
        return self.session.phone

    async def sender(self) -> channel.VerifiedSender:
        phone = self.current_phone()
        if not phone:
            raise HTTPException(422, "Нужен номер телефона клиента")
        return await channel.resolve_sender(
            self.db,
            business_id=crm.DAM,
            phone=phone,
            provider_account=f"wazzup:{self.msg.channel_id}",
            # The webhook is authenticated by the secret URL token and channel allowlist.
            signature_verified=True,
            channel=self.msg.chat_type,
        )

    async def menu(self) -> dict:
        if self._menu is None:
            self._menu = await load_menu(self.db)
        return self._menu

    # ---- system prompt

    async def system_prompt(self) -> List[dict]:
        """Static rules first (cached across all chats), then per-message context."""
        from services.food_preorders import LOCAL_TZ, schedule_settings
        from services.food_order_validation import kitchen_is_open

        settings = await schedule_settings(self.db)
        open_now, opens, closes = kitchen_is_open(settings)
        hours = f"с {opens} до {closes}" if opens else "уточняйте у оператора"
        try:
            min_order = float(settings.get("min_order_amount") or 0)
        except (TypeError, ValueError):
            min_order = 0
        now = datetime.now(LOCAL_TZ).strftime("%d.%m.%Y %H:%M")
        known = []
        if self.session.customer_name or self.msg.contact_name:
            known.append(f"имя в профиле: {self.session.customer_name or self.msg.contact_name}")
        if self.current_phone():
            known.append("телефон известен" + ("" if self.phone_verified else f" ({self.session.phone})"))
        elif self.msg.chat_type == "instagram":
            known.append("телефон НЕ известен — спроси его до оформления заказа")
        extra = settings.get("bot_extra_info") or ""
        context = f"""Канал: {'Instagram' if self.msg.chat_type == 'instagram' else 'WhatsApp'}.
Сейчас {now}. Кухня принимает заказы {hours}; сейчас {'открыто' if open_now else 'ЗАКРЫТО — можно только предзаказ на время из delivery_slots'}.
{f'Минимальный заказ: {money(min_order)}.' if min_order else ''}
Клиент: {', '.join(known) or 'данных нет'}.
{extra}"""
        return [
            {"type": "text", "text": STATIC_RULES, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": context.strip()},
        ]

    # ---- tool execution

    async def run_tool(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        try:
            return await self._run_tool(name, args or {})
        except HTTPException as exc:
            await self.db.rollback()
            return {"error": str(exc.detail)}
        except Exception:
            await self.db.rollback()
            logger.exception("wazzup tool %s failed", name)
            return {"error": "Техническая ошибка. Предложи позвать оператора."}

    async def _run_tool(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name == "menu_categories":
            m = await self.menu()
            sellable = [p for p in m["products"] if p["sellable"]]
            cats = []
            for c in m["categories"]:
                n = sum(1 for p in sellable if (p.get("category_id") or 0) == c["id"])
                if n:
                    cats.append({"category_id": c["id"], "name": c["name"], "items": n})
            return {"categories": cats}

        if name == "menu_items":
            m = await self.menu()
            sellable = [p for p in m["products"] if p["sellable"]]
            if args.get("category_id") is not None:
                cid = int(args["category_id"])
                found = [p for p in sellable if (p.get("category_id") or 0) == cid]
            elif args.get("query"):
                q = _norm(str(args["query"]))
                words = q.split()
                found = [p for p in sellable if all(w in _norm(p.get("name") or "") for w in words)]
                if not found:
                    found = [p for p in sellable if any(w in _norm((p.get("name") or "") + " " + (p.get("description") or "")) for w in words if len(w) > 2)]
            else:
                return {"error": "Укажи category_id или query"}
            return {"items": [compact_product(p) for p in found[:25]], "more": max(0, len(found) - 25)}

        if name == "delivery_slots":
            from services.food_preorders import available_slots, schedule_settings

            days = available_slots(await schedule_settings(self.db))
            return {"slots": days[:3] if isinstance(days, list) else days}

        if name == "remember_customer":
            if args.get("name"):
                self.session.customer_name = str(args["name"]).strip()[:150]
            if args.get("phone"):
                if self.phone_verified:
                    return {"ok": True, "note": "В WhatsApp номер клиента уже известен"}
                self.session.phone = crm.normalize_phone(args["phone"])  # 422 on bad number
            return {"ok": True}

        if name == "my_bonuses":
            if not self.phone_verified:
                return {"error": "Бонусы можно узнать в WhatsApp или в приложении"}
            ctx = await self.sender()
            data = await channel.tool(self.db, ctx, "bonus_balance", {})
            await self.db.commit()
            keep = {k: data.get(k) for k in ("balance", "available", "level", "expiring") if isinstance(data, dict) and k in data}
            return keep or {"info": "Бонусов пока нет"}

        if name == "prepare_order":
            return await self._prepare_order(args)

        if name == "call_operator":
            return {"ok": True, "handoff": True, "reason": str(args.get("reason") or "")[:300]}

        return {"error": "Неизвестный инструмент"}

    async def _prepare_order(self, args: Dict[str, Any]) -> Dict[str, Any]:
        m = await self.menu()
        if not m.get("restaurant_id"):
            return {"error": "Меню недоступно"}
        if args.get("customer_name"):
            self.session.customer_name = str(args["customer_name"]).strip()[:150]
        draft = {
            "restaurant_id": int(m["restaurant_id"]),
            "items": [
                {k: v for k, v in item.items() if k in ("id", "quantity", "modifiers", "choices")}
                for item in args.get("items") or []
            ],
            "customer_name": self.session.customer_name or args.get("customer_name") or "Клиент",
            "delivery_method": args.get("delivery_method"),
            "delivery_address": (args.get("delivery_address") or "").strip(),
            "payment_method": args.get("payment_method"),
            "comment": (args.get("comment") or "").strip()[:900],
        }
        if args.get("cash_given_amount"):
            draft["cash_given_amount"] = args["cash_given_amount"]
        if args.get("scheduled_for"):
            draft["scheduled_for"] = args["scheduled_for"]
        # Only a WhatsApp-verified number may spend that customer's bonuses.
        if self.phone_verified and args.get("bonus_points_to_use"):
            draft["bonus_points_to_use"] = args["bonus_points_to_use"]

        ctx = await self.sender()
        self._quotes += 1
        quote = await channel.tool(self.db, ctx, "quote", draft, message_id=f"{self.msg.message_id}:{self._quotes}")
        # Remember where to send order-status updates for this order.
        from models.crm import ChannelConfirmation

        row = await self.db.get(ChannelConfirmation, quote["confirmation_id"])
        if row is not None:
            row.payload = {**row.payload, "reply_to": {"channel_id": self.msg.channel_id, "chat_type": self.msg.chat_type, "chat_id": self.msg.chat_id}}
            flag_modified(row, "payload")
        await self.db.commit()
        return {"ok": True, "quote": quote}

    # ---- main loop

    async def respond(self) -> TurnResult:
        system = await self.system_prompt()
        messages: List[dict] = [dict(m) for m in self.session.history]
        for _ in range(max(1, self.config.max_tool_rounds)):
            resp = await self.llm.create(system=system, messages=messages, tools=TOOLS)
            content = resp.get("content") or []
            tool_uses = [b for b in content if b.get("type") == "tool_use"]
            text = "\n".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
            if not tool_uses:
                return TurnResult(reply=text)
            messages.append({"role": "assistant", "content": content})
            results = []
            outcome: Optional[TurnResult] = None
            for block in tool_uses:
                result = await self.run_tool(block.get("name"), block.get("input") or {})
                if result.get("handoff"):
                    outcome = TurnResult(reply=text, handoff=True)
                elif block.get("name") == "prepare_order" and result.get("ok"):
                    outcome = TurnResult(quote=result["quote"])
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.get("id"),
                    "content": json.dumps(result, ensure_ascii=False, default=str)[:12000],
                })
            if outcome:
                return outcome
            messages.append({"role": "user", "content": results})
        return TurnResult(reply="Секунду, уточню у оператора 🙏", handoff=True)


# ---------------------------------------------------------------- messages

def quote_summary(quote: dict) -> str:
    try:
        lines = json.loads(quote.get("order_items") or "[]")
    except (TypeError, ValueError):
        lines = []
    out = ["🧾 *Ваш заказ:*"]
    subtotal = 0.0
    for line in lines:
        qty = line.get("quantity") or 1
        total = float(line.get("sum") or 0)
        subtotal += total
        name = line.get("name") or "Блюдо"
        if line.get("is_gift"):
            out.append(f"🎁 {name} — подарок")
            continue
        mods = ", ".join(m.get("name", "") for m in line.get("modifiers") or [] if m.get("name"))
        out.append(f"• {name}{f' ({mods})' if mods else ''} × {qty} — {money(total)}")
    total = float(quote.get("total_amount") or 0)
    diff = round(total - subtotal)
    if diff > 0:
        out.append(f"Доставка и сбор: {money(diff)}")
    elif diff < 0:
        out.append(f"Скидка: {money(-diff)}")
    out.append(f"*Итого: {money(total)}*")
    out.append("")
    out.append(METHOD_LABELS.get(quote.get("delivery_method"), "Получение") + (f" к {quote['scheduled_for']}" if quote.get("scheduled_for") else ""))
    pay = PAYMENT_LABELS.get(quote.get("payment_method"), quote.get("payment_method") or "")
    if quote.get("payment_method") == "cash" and quote.get("change_amount"):
        pay += f", сдача {money(quote['change_amount'])}"
    out.append(f"Оплата: {pay}")
    if quote.get("comment"):
        out.append(f"Комментарий: {quote['comment']}")
    out.append("")
    out.append("Всё верно? Ответьте *ДА*, чтобы оформить, или напишите, что изменить.")
    return "\n".join(out)


def order_accepted_text(order: dict) -> str:
    return (
        f"✅ Заказ №{order.get('id')} оформлен на {money(order.get('total_amount'))}.\n"
        "Оператор подтвердит его в ближайшее время, статус пришлём сюда. Спасибо, что выбрали DAM ALEM! 🍽"
    )


# ---------------------------------------------------------------- entrypoint

async def notify_operator(msg: WazzupMessage, reason: str, session: ChatSession) -> None:
    try:
        from services.telegram import _escape_html, send_telegram_message

        who = msg.contact_name or session.customer_name or "клиент"
        where = "Instagram @" + msg.chat_id if msg.chat_type == "instagram" else "WhatsApp +" + msg.chat_id
        await send_telegram_message(
            "🙋 <b>DAM ALEM бот зовёт оператора</b>\n"
            f"{_escape_html(who)} · {_escape_html(where)}\n"
            f"Причина: {_escape_html(reason or '—')}\n"
            "Ответьте клиенту в Wazzup — бот замолчит в этом чате.",
            category="food",
        )
    except Exception:
        logger.exception("wazzup operator notify failed")


async def handle_message(db: AsyncSession, msg: WazzupMessage, *, config: Optional[WazzupBotConfig] = None,
                         wazzup: Optional[WazzupClient] = None, llm: Optional[ClaudeClient] = None) -> None:
    cfg = config or get_wazzup_config()
    if not cfg.ready or not cfg.channel_allowed(msg.channel_id):
        return
    store = get_store(cfg.session_ttl_seconds)
    session = store.get(msg.key)
    client = wazzup or WazzupClient(cfg)

    # Operator replied manually (echo of a message we did not send) -> human takeover.
    if msg.is_echo:
        last_bot = session.history[-1]["content"] if session.history and session.history[-1]["role"] == "assistant" else ""
        if not store.is_ours(msg.message_id) and (msg.text or "").strip() not in last_bot:
            session.paused_until = time.time() + cfg.human_pause_minutes * 60
            session.pending_confirmation_id = ""
            logger.info("wazzup human takeover chat_type=%s for %s min", msg.chat_type, cfg.human_pause_minutes)
        return
    if not msg.inbound or msg.is_deleted or msg.is_edited or not store.first_time(msg.message_id):
        return
    if session.paused:
        return

    async def send(text: str) -> None:
        if not text:
            return
        ids = await client.send_text(channel_id=msg.channel_id, chat_type=msg.chat_type, chat_id=msg.chat_id, text=text)
        store.mark_ours(ids)
        session.add("assistant", text)

    async with session.lock:
        if msg.msg_type != "text" or not msg.text.strip():
            await send("Пока понимаю только текстовые сообщения 🙏 Напишите, пожалуйста, текстом.")
            return

        # Explicit customer confirmation is handled here, never by the model.
        if session.pending_confirmation_id and is_explicit_yes(msg.text):
            cid = session.pending_confirmation_id
            session.add("user", msg.text)
            agent = DamAlemAgent(db, msg, session, cfg, llm)
            try:
                ctx = await agent.sender()
                await channel.confirm_customer_reply(db, ctx, cid, explicit_confirmation=True)
                order = await channel.tool(db, ctx, "create_order", {"confirmation_id": cid})
                session.pending_confirmation_id = ""
                await send(order_accepted_text(order))
            except HTTPException as exc:
                await db.rollback()
                session.pending_confirmation_id = ""
                await send(f"Не получилось оформить: {exc.detail}. Давайте пересчитаем — напишите, пожалуйста, ещё раз, что заказываете.")
            except Exception:
                await db.rollback()
                logger.exception("wazzup order creation failed")
                await send("Техническая заминка при оформлении. Уже позвал оператора, он скоро ответит 🙏")
                await notify_operator(msg, "Ошибка оформления заказа ботом", session)
            return

        # Any reply other than an explicit "ДА" to the summary voids it, so a later
        # "да" to an unrelated question can never place the old order.
        session.pending_confirmation_id = ""
        session.add("user", msg.text)
        agent = DamAlemAgent(db, msg, session, cfg, llm)
        try:
            result = await agent.respond()
        except LLMError:
            await send("Извините, небольшая техническая заминка. Оператор скоро ответит 🙏")
            await notify_operator(msg, "ИИ временно недоступен", session)
            session.paused_until = time.time() + cfg.human_pause_minutes * 60
            return

        if result.quote:
            session.pending_confirmation_id = result.quote["confirmation_id"]
            await send(quote_summary(result.quote))
            return
        if result.handoff:
            await send(result.reply or "Передал ваш вопрос оператору, он скоро ответит 🙏")
            await notify_operator(msg, msg.text[:200], session)
            session.paused_until = time.time() + cfg.human_pause_minutes * 60
            return
        await send(result.reply or "Извините, не понял. Напишите, пожалуйста, что хотите заказать 🙂")
