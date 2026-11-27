"""DAM ALEM bonuses for orders taken at the café's own till («Касса Dam Alem»).

The till keeps no bonuses of its own. A client has one account, whether they order on the site or at the till:
- balance(): what the operator sees while typing the phone;
- earn(): cashback for a paid, closed till order — the site's own rate, the site's own deadlines;
- start_spend() / confirm_spend(): paying with bonuses, only with a code the client gets in WhatsApp;
- restore(): the bonuses come back if that till order is cancelled.

Every change is a ledger entry with a key made from the till order, so a repeated call never counts twice.
The client is told in WhatsApp from the Сортировка 24 number (its send limits apply); «СТОП» ends those messages.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
import uuid
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

import httpx
from fastapi import HTTPException
from sqlalchemy import func, select, text

from core.deploy_safety import external_side_effects_allowed
from models.crm import Customer, CustomerIdentity
from models.loyalty import BonusAllocation, BonusLot, BonusMember
from models.user_management import Bonus
from services import crm, loyalty

logger = logging.getLogger(__name__)

CODE_TTL = 10 * 60          # seconds a spend code stays valid
CODE_TRIES = 5
STOP_WORDS = {"стоп", "stop"}
START_WORDS = {"старт", "start"}
STOP_LINE = "Отписаться — ответьте СТОП"
SOON_DAYS = 14   # the burn date is mentioned only when it is this close


# ---------- small helpers ----------

def tenge(value) -> int:
    return int(Decimal(str(value or 0)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _digits(phone: str) -> str:
    return crm.normalize_phone(phone)[1:]


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _date(at) -> str:
    return f"{loyalty.aware(at):%d.%m}"


async def ensure_tables(db) -> None:
    """Spend codes and «СТОП» replies. Created on first use; nothing else in the schema changes."""
    await db.execute(text("CREATE TABLE IF NOT EXISTS pos_bonus_codes (id VARCHAR(36) PRIMARY KEY, phone VARCHAR(16) NOT NULL, "
                          "amount INTEGER NOT NULL, food INTEGER NOT NULL, pos_ref VARCHAR(80) NOT NULL, code_hash VARCHAR(64) NOT NULL, "
                          "tries INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL, used INTEGER NOT NULL DEFAULT 0)"))
    await db.execute(text("CREATE TABLE IF NOT EXISTS pos_bonus_optout (phone VARCHAR(16) PRIMARY KEY, at BIGINT NOT NULL)"))


async def _customer(db, phone: str) -> Customer | None:
    alias = await db.get(CustomerIdentity, crm.normalize_phone(phone))
    return await db.get(Customer, alias.customer_id) if alias else None


async def _member(db, customer: Customer | None) -> BonusMember | None:
    if customer is None:
        return None
    return await db.scalar(select(BonusMember).where(BonusMember.customer_id == customer.id, BonusMember.business_id == crm.DAM))


async def _soonest(db, account: BonusMember) -> BonusLot | None:
    return await db.scalar(select(BonusLot).where(BonusLot.account_id == account.id, BonusLot.remaining > 0,
                                                  BonusLot.expires_at.is_not(None)).order_by(BonusLot.expires_at).limit(1))


# ---------- WhatsApp ----------

async def opted_out(db, phone: str) -> bool:
    await ensure_tables(db)
    return bool(await db.scalar(text("SELECT 1 FROM pos_bonus_optout WHERE phone = :p"), {"p": _digits(phone)}))


async def set_opt_out(db, phone: str, out: bool) -> None:
    await ensure_tables(db)
    await db.execute(text("DELETE FROM pos_bonus_optout WHERE phone = :p"), {"p": _digits(phone)})
    if out:
        await db.execute(text("INSERT INTO pos_bonus_optout (phone, at) VALUES (:p, :t)"), {"p": _digits(phone), "t": int(time.time())})


def stop_word(body: str) -> bool | None:
    """A client's «СТОП» (True) or «СТАРТ» (False) to the number; None for any other message."""
    word = (body or "").strip().strip(".!").lower()
    return True if word in STOP_WORDS else False if word in START_WORDS else None


async def answer_stop(db, phone: str, out: bool) -> str:
    await set_opt_out(db, phone, out)
    await db.commit()
    if out:
        return "Готово: сообщения о бонусах Дам Алем больше не придут. Бонусы остаются на вашем счёте. Передумаете — напишите СТАРТ."
    return "Готово: будем сообщать о начисленных бонусах Дам Алем."


async def send(phone: str, message: str) -> bool:
    """One WhatsApp message to a client from the Сортировка 24 number. False when it could not go."""
    if not external_side_effects_allowed():
        return False
    from services.support_bot import send_text
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            return await send_text(client, f"{_digits(phone)}@c.us", message)
    except Exception as exc:  # the till must not fail because WhatsApp did
        logger.warning("[PosBonus] WhatsApp not sent: %s", exc)
        return False


# ---------- what the operator sees ----------

async def balance(db, phone: str) -> dict:
    rules = await loyalty.rules(db)
    out = {"known": False, "balance": 0, "expires": [], "rate": float(rules["cashback_rate"]),
           "max_percent": float(rules["max_spend_percent"]), "spending": bool(rules["spending_enabled"])}
    account = await _member(db, await _customer(db, phone))
    if account is None:
        return out
    await loyalty.policy(db, lock=True)
    await loyalty.expire(db, account)
    lots = (await db.scalars(select(BonusLot).where(BonusLot.account_id == account.id, BonusLot.remaining > 0,
                                                    BonusLot.expires_at.is_not(None)).order_by(BonusLot.expires_at).limit(3))).all()
    return {**out, "known": True, "balance": tenge(account.bonus_balance) if account.enabled else 0,
            "expires": [{"amount": tenge(l.remaining), "at": loyalty.aware(l.expires_at).isoformat()} for l in lots]}


# ---------- cashback ----------

async def earn(db, *, phone: str, name: str, pos_ref: str, number: int, eligible: int) -> dict:
    """Cashback for a paid, closed till order: eligible = food after discounts and bonuses, without delivery.
    The caller commits, then calls tell_earned() — the message goes only after the entry is saved."""
    key = f"pos-earn:{pos_ref}"
    done = await db.scalar(select(Bonus).where(Bonus.idempotency_key == key))
    if done is not None:
        account = await db.get(BonusMember, done.account_id)
        return {"earned": tenge(done.points), "balance": tenge(account.bonus_balance), "new": False}
    rules = await loyalty.rules(db)
    if not rules["earning_enabled"] or eligible <= 0:
        return {"earned": 0, "balance": 0, "new": False, "why": "начисление выключено" if eligible > 0 else "нечего начислять"}
    await loyalty.policy(db, lock=True)
    customer = await crm.resolve(db, phone, name or "", business_id=crm.DAM, source="pos")
    account = await loyalty.account(db, customer.id, internal=True)
    await loyalty.expire(db, account)
    if not account.enabled or customer.state != "NORMAL":
        return {"earned": 0, "balance": tenge(account.bonus_balance), "new": False, "why": "бонусный счёт требует проверки"}
    today = await db.scalar(select(func.count()).select_from(Bonus).where(
        Bonus.account_id == account.id, Bonus.kind == "EARN", Bonus.created_at >= loyalty.now() - timedelta(days=1)))
    if today >= int(rules["customer_daily_order_limit"]):
        return {"earned": 0, "balance": tenge(account.bonus_balance), "new": False, "why": "превышен порог заказов за сутки"}
    earned = (Decimal(eligible) * loyalty.amount(rules["cashback_rate"]) / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    if earned <= 0:
        return {"earned": 0, "balance": tenge(account.bonus_balance), "new": False, "why": "нечего начислять"}
    entry = await loyalty.post(db, account, "EARN", earned, key, f"Кешбэк за заказ в кафе № {number}",
                               expires_at=loyalty.now() + timedelta(days=float(rules["regular_days"])),
                               details={"pos_order": number, "pos_ref": pos_ref, "eligible": eligible})
    await loyalty.notify(db, account.id, f"loyalty:{key}", f"{entry.reason}. Начислено {earned:g} бонусов. Баланс: {account.bonus_balance:g}.")
    lot = await _soonest(db, account)
    return {"earned": tenge(earned), "balance": tenge(account.bonus_balance), "new": True, "rate": float(rules["cashback_rate"]),
            "max_percent": float(rules["max_spend_percent"]),
            "soonest": {"amount": tenge(lot.remaining), "at": _date(lot.expires_at),
                        "days": (loyalty.aware(lot.expires_at) - loyalty.now()).days} if lot else None}


def bonuses(n: int) -> str:
    """151 бонус, 152 бонуса, 155 бонусов."""
    tail = n % 100
    word = "бонусов" if 11 <= tail <= 14 else {1: "бонус", 2: "бонуса", 3: "бонуса", 4: "бонуса"}.get(n % 10, "бонусов")
    return f"{n} {word}"


def earned_text(number: int, result: dict) -> str:
    lines = ["Спасибо, что выбрали Дам Алем! 🧡", "",
             f"+{bonuses(result['earned'])} за заказ № {number}",
             f"На счёте: {bonuses(result['balance'])} (1 бонус = 1 ₸)"]
    soon = result.get("soonest")
    if soon and soon.get("days", 99) <= SOON_DAYS:
        lines.append(f"Сгорят {soon['at']}: {bonuses(soon['amount'])}")
    lines += ["", f"Оплачивайте ими до {result['max_percent']:g}% следующего заказа — просто назовите свой номер.", "", STOP_LINE]
    return "\n".join(lines)


def code_text(code: str, amount: int) -> str:
    return (f"Дам Алем: код для оплаты бонусами — {code}\nСпишется {bonuses(amount)}. Назовите код кассиру.\n\n"
            "Если вы сейчас ничего не оплачиваете — никому не говорите этот код.")


def spent_text(spent: int, number: int, balance: int) -> str:
    return f"Дам Алем: оплачено бонусами {spent} ₸ (заказ № {number}).\nОсталось: {bonuses(balance)}. Спасибо! 🧡"


async def tell_earned(db, phone: str, number: int, result: dict) -> bool:
    if not result.get("new") or await opted_out(db, phone):
        return False
    return await send(phone, earned_text(number, result))


# ---------- paying with bonuses ----------

async def start_spend(db, *, phone: str, amount: int, food: int, pos_ref: str) -> dict:
    """Checks the amount against the site's rules and the balance, then sends the client a code. Nothing is taken yet."""
    if amount <= 0:
        raise HTTPException(422, "Укажите, сколько бонусов списать")
    if await db.scalar(select(Bonus.id).where(Bonus.idempotency_key == f"pos-spend:{pos_ref}")):
        raise HTTPException(409, "По этому заказу бонусы уже списаны")
    rules = await loyalty.rules(db)
    account = await _member(db, await _customer(db, phone))
    if account is None or not account.enabled:
        raise HTTPException(409, "У клиента нет бонусов Дам Алем")
    await loyalty.policy(db, lock=True)
    await loyalty.expire(db, account)
    loyalty.quote(rules, food, amount, account.bonus_balance)
    code = f"{secrets.randbelow(10000):04d}"
    spend_id = str(uuid.uuid4())
    await ensure_tables(db)
    await db.execute(text("INSERT INTO pos_bonus_codes (id, phone, amount, food, pos_ref, code_hash, tries, expires_at, used) "
                          "VALUES (:id, :phone, :amount, :food, :ref, :hash, 0, :exp, 0)"),
                     {"id": spend_id, "phone": _digits(phone), "amount": amount, "food": food, "ref": pos_ref,
                      "hash": _hash(code), "exp": int(time.time()) + CODE_TTL})
    await db.commit()
    sent = await send(phone, code_text(code, amount))
    if not sent:
        raise HTTPException(503, "WhatsApp не доставил код клиенту. Попробуйте ещё раз через минуту")
    return {"spend_id": spend_id, "amount": amount, "valid_minutes": CODE_TTL // 60}


async def confirm_spend(db, *, spend_id: str, code: str, pos_ref: str, number: int) -> dict:
    await ensure_tables(db)
    row = (await db.execute(text("SELECT phone, amount, food, pos_ref, code_hash, tries, expires_at, used FROM pos_bonus_codes WHERE id = :id"),
                            {"id": spend_id})).mappings().first()
    if row is None or row["pos_ref"] != pos_ref:
        raise HTTPException(404, "Код не найден — отправьте новый")
    key = f"pos-spend:{pos_ref}"
    done = await db.scalar(select(Bonus).where(Bonus.idempotency_key == key))
    if row["used"] and done is not None:   # the same confirmation repeated: answer the same
        account = await db.get(BonusMember, done.account_id)
        return {"spent": -tenge(done.points), "balance": tenge(account.bonus_balance), "new": False}
    if row["expires_at"] < time.time():
        raise HTTPException(410, "Код устарел — отправьте новый")
    if row["tries"] >= CODE_TRIES:
        raise HTTPException(429, "Слишком много неверных попыток — отправьте новый код")
    if not hmac.compare_digest(row["code_hash"], _hash((code or "").strip())):
        await db.execute(text("UPDATE pos_bonus_codes SET tries = tries + 1 WHERE id = :id"), {"id": spend_id})
        await db.commit()
        raise HTTPException(422, f"Неверный код, осталось попыток: {CODE_TRIES - row['tries'] - 1}")
    rules = await loyalty.rules(db)
    await loyalty.policy(db, lock=True)
    account = await _member(db, await _customer(db, row["phone"]))
    if account is None or not account.enabled:
        raise HTTPException(409, "Бонусный счёт клиента недоступен")
    await loyalty.expire(db, account)
    loyalty.quote(rules, row["food"], row["amount"], account.bonus_balance)
    entry = await loyalty.post(db, account, "SPEND", -Decimal(row["amount"]), key, f"Оплата бонусами заказа в кафе № {number}",
                               details={"pos_order": number, "pos_ref": pos_ref})
    await loyalty.consume(db, account, entry, Decimal(row["amount"]))
    await db.execute(text("UPDATE pos_bonus_codes SET used = 1 WHERE id = :id"), {"id": spend_id})
    await loyalty.notify(db, account.id, f"loyalty:{key}", f"Списано {row['amount']} бонусов. Осталось: {account.bonus_balance:g}.")
    return {"spent": row["amount"], "balance": tenge(account.bonus_balance), "new": True, "phone": row["phone"]}


async def restore(db, *, pos_ref: str, number: int) -> dict:
    """The till order was cancelled: what was paid with bonuses goes back with its old deadlines (expired value stays expired)."""
    original = await db.scalar(select(Bonus).where(Bonus.idempotency_key == f"pos-spend:{pos_ref}"))
    if original is None:
        return {"restored": 0}
    key = f"pos-restore:{pos_ref}"
    account = await db.get(BonusMember, original.account_id)
    if await db.scalar(select(Bonus.id).where(Bonus.idempotency_key == key)):
        return {"restored": -tenge(original.points), "balance": tenge(account.bonus_balance)}
    await loyalty.policy(db, lock=True)
    reason = f"Возврат бонусов: заказ в кафе № {number} отменён"
    for a in (await db.scalars(select(BonusAllocation).where(BonusAllocation.debit_id == original.id))).all():
        lot = await db.get(BonusLot, a.lot_id)
        await loyalty.post(db, account, "REVERSAL", a.amount, f"{key}:{a.id}", reason, expires_at=lot.expires_at,
                           details={"reversal_of": original.id, "pos_ref": pos_ref})
    await loyalty.post(db, account, "REVERSAL", 0, key, reason, details={"reversal_of": original.id, "pos_ref": pos_ref})
    await loyalty.expire(db, account)
    await loyalty.notify(db, account.id, f"loyalty:{key}", f"{reason}. Баланс: {account.bonus_balance:g}.")
    return {"restored": -tenge(original.points), "balance": tenge(account.bonus_balance)}
