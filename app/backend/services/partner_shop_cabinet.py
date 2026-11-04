"""The partner's own cabinet: no passwords. Two keys open it:

* the site account whose confirmed phone number is the shop's phone or WhatsApp (or listed in the shop's
  `owner_phones`) — the owner signs in to the app by that number and the cabinet opens by itself;
* the shop's linked Telegram: «🛠 Кабинет магазина» in the bot gives a one-time link (15 minutes).

Either way the site issues a 30-day cabinet token signed with a key of its own (it opens only this shop's
cabinet). Every request re-checks the key: an unlinked chat or a changed shop number closes the cabinet at once.

In the cabinet the partner sees orders with the customer's details and moves them through
new → accepted → done / cancelled, changes prices, descriptions and «в наличии», and invites colleagues
to receive orders in Telegram."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import timedelta
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import text

from services import partner_shop as shop_svc
from services.partner_shop import PRODUCT_FIELDS, _shop, chats, ensure_tables, now

SITE_URL = "https://www.sortirovka24.kz"
LOGIN_MINUTES = 15
TOKEN_DAYS = 30
STATUSES = {"new": "Новый", "accepted": "Принят", "done": "Выполнен", "cancelled": "Отменён"}
ACCOUNT = "account:"  # cabinet tokens issued to a site account carry this instead of a chat id
LOGIN_WORDS = {"/kabinet", "/cabinet", "кабинет", "🛠 кабинет магазина"}


# ---------------- tokens ----------------
def _key() -> bytes:
    from core.auth import _get_jwt_secret_key
    return hashlib.sha256(("partner-shop-cabinet:" + _get_jwt_secret_key()).encode()).digest()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def issue_token(slug: str, chat_id: str, days: int = TOKEN_DAYS) -> str:
    body = _b64(json.dumps({"s": slug, "c": str(chat_id), "e": int(time.time()) + days * 86400}).encode())
    return body + "." + _b64(hmac.new(_key(), body.encode(), hashlib.sha256).digest())


async def authorize(db, slug: str, authorization: Optional[str]) -> str:
    """The chat behind a cabinet token for this shop, or 401."""
    token = (authorization or "").removeprefix("Shop ").strip()
    try:
        body, sig = token.split(".")
        good = hmac.compare_digest(sig, _b64(hmac.new(_key(), body.encode(), hashlib.sha256).digest()))
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))) if good else {}
    except (ValueError, TypeError):
        data = {}
    if not data or data.get("s") != slug or int(data.get("e", 0)) < time.time():
        raise HTTPException(401, "Войдите в кабинет: по номеру магазина в приложении или через Telegram-бота")
    key = str(data["c"])
    if key.startswith(ACCOUNT):
        if slug not in await _slugs_of_user(db, await _user(db, key.removeprefix(ACCOUNT))):
            raise HTTPException(401, "Этот номер больше не привязан к магазину")
    elif key not in await chats(db, slug):
        raise HTTPException(401, "Этот Telegram больше не подключён к магазину")
    return key


# ---------------- sign-in by the site account ----------------
def _digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))[-10:]


async def _user(db, user_id: str):
    from models.auth import User
    return await db.get(User, user_id)


async def shops_of_user(db, user) -> list[dict[str, str]]:
    """Shops whose phone, WhatsApp or `owner_phones` is this account's confirmed number."""
    mine = _digits(getattr(user, "phone", ""))
    if not user or len(mine) != 10 or not user.phone_verified_at or getattr(user, "status", "active") != "active":
        return []
    await ensure_tables(db)
    found = []
    for row in (await db.execute(text("SELECT slug, settings FROM partner_shops ORDER BY slug"))).all():
        shop = shop_svc._settings(row.settings)
        if mine in {_digits(p) for p in (shop.get("phone"), shop.get("whatsapp"), *(shop.get("owner_phones") or []))}:
            found.append({"slug": row.slug, "name": shop.get("name") or row.slug, "logo": shop.get("logo") or ""})
    return found


async def _slugs_of_user(db, user) -> set[str]:
    return {s["slug"] for s in await shops_of_user(db, user)}


async def account_login(db, slug: str, user) -> dict[str, Any]:
    if not user:
        raise HTTPException(401, "Войдите в приложение по номеру магазина")
    if slug not in await _slugs_of_user(db, user):
        raise HTTPException(403, "Этот номер не привязан к магазину. Войдите по номеру магазина или через Telegram-бота.")
    shop = await _shop(db, slug, enabled_only=False)
    return {"token": issue_token(slug, ACCOUNT + str(user.id)), "name": shop.get("name") or slug}


async def login_link(db, slug: str, chat_id: str) -> str:
    code = secrets.token_urlsafe(18)
    await db.execute(text("DELETE FROM partner_shop_codes WHERE expires_at < :n"), {"n": now().isoformat()})
    await db.execute(text("INSERT INTO partner_shop_codes (code, shop, expires_at, chat_id) VALUES (:c, :s, :e, :h)"),
                     {"c": code, "s": slug, "e": (now() + timedelta(minutes=LOGIN_MINUTES)).isoformat(), "h": str(chat_id)})
    await db.commit()
    return f"{SITE_URL}/shop/{slug}/cabinet#code={code}"


async def login(db, slug: str, code: str) -> dict[str, Any]:
    await ensure_tables(db)
    row = (await db.execute(text("SELECT shop, expires_at, chat_id FROM partner_shop_codes WHERE code = :c AND chat_id IS NOT NULL"),
                            {"c": code})).first()
    await db.execute(text("DELETE FROM partner_shop_codes WHERE code = :c AND chat_id IS NOT NULL"), {"c": code})  # one use
    await db.commit()
    if not row or row.shop != slug or row.expires_at < now().isoformat() or row.chat_id not in await chats(db, slug):
        raise HTTPException(401, "Ссылка для входа устарела. Нажмите «🛠 Кабинет магазина» в боте ещё раз.")
    shop = await _shop(db, slug, enabled_only=False)
    return {"token": issue_token(slug, row.chat_id), "name": shop.get("name") or slug}


# ---------------- Telegram ----------------
def cabinet_button() -> dict[str, Any]:
    return {"inline_keyboard": [[{"text": "🛠 Кабинет магазина", "callback_data": f"{shop_svc.CALLBACK_PREFIX}k"}]]}


async def shops_of_chat(db, chat_id: Any) -> list[str]:
    await ensure_tables(db)
    return list((await db.scalars(text("SELECT shop FROM partner_shop_telegram WHERE chat_id = :c ORDER BY shop"),
                                  {"c": str(chat_id)})).all())


async def send_login(db, client, chat_id: Any) -> bool:
    """Reply to «Кабинет» with a one-time sign-in button for each shop this chat belongs to."""
    from services.news_agent import tg
    slugs = await shops_of_chat(db, chat_id)
    if not slugs:
        return False
    for slug in slugs:
        shop = await _shop(db, slug, enabled_only=False)
        await tg(client, "sendMessage", {
            "chat_id": chat_id,
            "text": f"Кабинет «{shop.get('name') or slug}»: заказы, цены и наличие. Ссылка действует {LOGIN_MINUTES} минут.\n\n"
                    f"Чтобы не входить каждый раз: войдите в приложение «Сортировка 24» по номеру магазина — "
                    f"кабинет откроется сам («Ещё» → «Мой магазин»).",
            "reply_markup": {"inline_keyboard": [[{"text": "Открыть кабинет", "url": await login_link(db, slug, chat_id)}]]}})
    return True


# ---------------- cabinet data ----------------
def _order(row: Any) -> dict[str, Any]:
    return {"id": row["id"], "items": json.loads(row["items"]), "total": row["total"], "name": row["customer_name"],
            "phone": row["phone"], "address": row["address"], "zone": row["zone"], "wanted": row["wanted"] or "",
            "comment": row["comment"] or "", "status": row["status"], "accepted_by": row["accepted_by"] or "",
            "created_at": row["created_at"]}


async def overview(db, slug: str) -> dict[str, Any]:
    shop = await _shop(db, slug, enabled_only=False)
    products = (await db.execute(text(
        f"SELECT {PRODUCT_FIELDS}, active FROM partner_shop_products WHERE shop = :s ORDER BY sort, id"), {"s": slug})).mappings().all()
    orders = (await db.execute(text("SELECT * FROM partner_shop_orders WHERE shop = :s ORDER BY id DESC LIMIT 200"),
                               {"s": slug})).mappings().all()
    people = (await db.execute(text("SELECT tg_name, linked_at FROM partner_shop_telegram WHERE shop = :s ORDER BY linked_at"),
                               {"s": slug})).mappings().all()
    month = (now() - timedelta(days=30)).isoformat()
    recent = [o for o in orders if o["created_at"] >= month and o["status"] != "cancelled"]
    return {"slug": slug, "name": shop.get("name") or slug, "enabled": shop["enabled"], "accent": shop.get("accent") or "#2f5a34",
            "logo": shop.get("logo") or "", "hours": shop.get("hours") or "", "headline": shop.get("headline") or "",
            "delivery_note": shop.get("delivery_note") or "", "statuses": STATUSES,
            "stats": {"new": sum(o["status"] == "new" for o in orders), "month_orders": len(recent),
                      "month_total": sum(o["total"] for o in recent)},
            "orders": [_order(o) for o in orders], "products": [dict(p) for p in products],
            "telegram": [{"name": p["tg_name"] or "Без имени", "linked_at": p["linked_at"]} for p in people]}


async def update_product(db, slug: str, sku: str, changes: dict[str, Any]) -> dict[str, Any]:
    await ensure_tables(db)
    allowed = {k: v for k, v in changes.items() if k in {"price", "active", "description"} and v is not None}
    if not allowed:
        raise HTTPException(422, "Нечего сохранять")
    sets = ", ".join(f"{k} = :{k}" for k in allowed)
    row = (await db.execute(text(f"UPDATE partner_shop_products SET {sets} WHERE shop = :s AND sku = :k RETURNING {PRODUCT_FIELDS}, active"),
                            {**allowed, "s": slug, "k": sku})).mappings().first()
    if not row:
        raise HTTPException(404, "Товар не найден")
    await db.commit()
    return dict(row)


async def set_status(db, slug: str, order_id: int, status: str, who: str) -> dict[str, Any]:
    if status not in STATUSES:
        raise HTTPException(422, "Неизвестный статус")
    await ensure_tables(db)
    row = (await db.execute(text(
        "UPDATE partner_shop_orders SET status = :st, updated_at = :t, "
        "accepted_by = CASE WHEN :taking AND COALESCE(accepted_by, '') = '' THEN :w ELSE accepted_by END "
        "WHERE shop = :s AND id = :i RETURNING *"),
        {"st": status, "taking": status == "accepted", "t": now().isoformat(), "w": who[:120], "s": slug, "i": order_id})).mappings().first()
    if not row:
        raise HTTPException(404, "Заказ не найден")
    await db.commit()
    return _order(row)


async def chat_name(db, slug: str, chat_id: str) -> str:
    if chat_id.startswith(ACCOUNT):
        user = await _user(db, chat_id.removeprefix(ACCOUNT))
        return (getattr(user, "name", "") or "владелец")[:120]
    return await db.scalar(text("SELECT tg_name FROM partner_shop_telegram WHERE shop = :s AND chat_id = :c"),
                           {"s": slug, "c": chat_id}) or "сотрудник"
