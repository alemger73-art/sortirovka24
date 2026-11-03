"""Partner shops: a local business's catalog inside Сортировка 24, orders delivered to its Telegram.

The partner keeps its customers and its money. We show the catalog, take the order (customer, address,
delivery zone, preferred time, items with prices fixed at order time) and send it to every Telegram chat the
partner linked. The partner calls back, confirms and delivers; «✅ Принял» under the order marks it taken.

Storage is a few small tables created on first use, like the other optional modules.
"""
from __future__ import annotations

import html
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import text

logger = logging.getLogger(__name__)

START_PREFIX = "shop_"
CALLBACK_PREFIX = "sh:"
LINK_MINUTES = 60 * 24
ORDERS_PER_PHONE_HOUR = 5

_ready: set[int] = set()


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------- storage ----------------
async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    try:
        await _create(db)
    except Exception:
        await db.rollback()  # two first requests at once: the other one created the tables
        await _create(db)
    _ready.add(key)


async def _create(db) -> None:
    for stmt in (
        "CREATE TABLE IF NOT EXISTS partner_shops (slug VARCHAR(80) PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE, "
        "settings TEXT NOT NULL DEFAULT '{}', updated_at VARCHAR(32))",
        "CREATE TABLE IF NOT EXISTS partner_shop_products (id SERIAL PRIMARY KEY, shop VARCHAR(80) NOT NULL, "
        "sku VARCHAR(40) NOT NULL, category VARCHAR(80) NOT NULL, name VARCHAR(200) NOT NULL, kind VARCHAR(80), "
        "height_cm INTEGER, pot_cm INTEGER, price INTEGER NOT NULL, image VARCHAR(300), active BOOLEAN NOT NULL DEFAULT TRUE, "
        "sort INTEGER NOT NULL DEFAULT 0)",
        "CREATE UNIQUE INDEX IF NOT EXISTS partner_shop_products_sku ON partner_shop_products (shop, sku)",
        "CREATE TABLE IF NOT EXISTS partner_shop_orders (id SERIAL PRIMARY KEY, shop VARCHAR(80) NOT NULL, "
        "items TEXT NOT NULL, total INTEGER NOT NULL, customer_name VARCHAR(80) NOT NULL, phone VARCHAR(20) NOT NULL, "
        "address VARCHAR(250) NOT NULL, zone VARCHAR(80) NOT NULL, wanted VARCHAR(80), comment VARCHAR(300), "
        "status VARCHAR(20) NOT NULL DEFAULT 'new', accepted_by VARCHAR(120), created_at VARCHAR(32) NOT NULL)",
        "CREATE INDEX IF NOT EXISTS partner_shop_orders_shop ON partner_shop_orders (shop, created_at)",
        "CREATE TABLE IF NOT EXISTS partner_shop_telegram (shop VARCHAR(80) NOT NULL, chat_id VARCHAR(32) NOT NULL, "
        "tg_name VARCHAR(120), linked_at VARCHAR(32), PRIMARY KEY (shop, chat_id))",
        "CREATE TABLE IF NOT EXISTS partner_shop_codes (code VARCHAR(48) PRIMARY KEY, shop VARCHAR(80) NOT NULL, "
        "expires_at VARCHAR(32) NOT NULL)",
        # 2026-11: product cards with a description and care hints; one-time cabinet login codes carry the chat
        "ALTER TABLE partner_shop_products ADD COLUMN IF NOT EXISTS description VARCHAR(600)",
        "ALTER TABLE partner_shop_products ADD COLUMN IF NOT EXISTS light VARCHAR(10)",
        "ALTER TABLE partner_shop_products ADD COLUMN IF NOT EXISTS water VARCHAR(10)",
        "ALTER TABLE partner_shop_products ADD COLUMN IF NOT EXISTS easy BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE partner_shop_codes ADD COLUMN IF NOT EXISTS chat_id VARCHAR(32)",
        "ALTER TABLE partner_shop_orders ADD COLUMN IF NOT EXISTS updated_at VARCHAR(32)",
        "ALTER TABLE partner_shop_orders ADD COLUMN IF NOT EXISTS user_id VARCHAR(64)",  # a signed-in resident's account
        "CREATE INDEX IF NOT EXISTS partner_shop_orders_user ON partner_shop_orders (user_id)",
    ):
        await db.execute(text(stmt))
    await db.commit()


def _settings(raw: Optional[str]) -> dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except ValueError:
        return {}


async def _shop(db, slug: str, *, enabled_only: bool = True) -> dict[str, Any]:
    await ensure_tables(db)
    row = (await db.execute(text("SELECT slug, enabled, settings FROM partner_shops WHERE slug = :s"), {"s": slug})).first()
    if not row or (enabled_only and not row.enabled):
        raise HTTPException(404, "Витрина не найдена")
    return {"slug": row.slug, "enabled": bool(row.enabled), **_settings(row.settings)}


def _zones(shop: dict[str, Any]) -> list[dict[str, str]]:
    return [z for z in shop.get("delivery") or [] if isinstance(z, dict) and z.get("name")]


# ---------------- public ----------------
PRODUCT_FIELDS = "sku, category, name, kind, height_cm, pot_cm, price, image, description, light, water, easy"


async def enabled_shops(db) -> list[dict[str, Any]]:
    """Open shops for banners: name, look, how many items, the cheapest price and a few photos."""
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT slug, settings FROM partner_shops WHERE enabled ORDER BY slug"))).all()
    out = []
    for row in rows:
        shop = _settings(row.settings)
        stats = (await db.execute(text(
            "SELECT COUNT(*) AS n, MIN(price) AS low FROM partner_shop_products WHERE shop = :s AND active"), {"s": row.slug})).first()
        pictured = (await db.execute(text(
            "SELECT category, image FROM partner_shop_products WHERE shop = :s AND active AND image IS NOT NULL ORDER BY sort, id"),
            {"s": row.slug})).all()
        firsts = {}  # one photo per category shows the range at a glance
        for category, image in pictured:
            firsts.setdefault(category, image)
        photos = list(firsts.values())[:4]
        out.append({"slug": row.slug, "name": shop.get("name") or row.slug, "headline": shop.get("headline") or "",
                    "logo": shop.get("logo") or "", "accent": shop.get("accent") or "#2f5a34",
                    "free_zones": [z["name"] for z in _zones(shop) if "бесплат" in (z.get("price") or "").lower()],
                    "products": int(stats.n or 0), "from_price": int(stats.low or 0), "photos": photos})
    return out


async def storefront(db, slug: str) -> dict[str, Any]:
    shop = await _shop(db, slug)
    rows = (await db.execute(text(
        f"SELECT {PRODUCT_FIELDS} FROM partner_shop_products WHERE shop = :s AND active ORDER BY sort, id"),
        {"s": slug})).mappings().all()
    order = [c for c in shop.get("categories") or [] if isinstance(c, str)]
    present = list(dict.fromkeys(r["category"] for r in rows))
    categories = [c for c in order if c in present] + [c for c in present if c not in order]
    public = {k: shop.get(k) for k in ("name", "headline", "logo", "accent", "hours", "phone", "whatsapp",
                                        "instagram", "delivery_note", "min_order")}
    return {"slug": slug, **public, "delivery": _zones(shop), "categories": categories,
            "products": [dict(r) for r in rows]}


def _phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    if not re.fullmatch(r"7\d{10}", digits):
        raise HTTPException(422, "Проверьте номер телефона: +7 7XX XXX XX XX")
    return "+" + digits


def _text(value: Any, field: str, limit: int, required: bool = True) -> str:
    out = re.sub(r"\s+", " ", str(value or "")).strip()
    if required and len(out) < 2:
        raise HTTPException(422, f"Заполните поле «{field}»")
    return out[:limit]


async def place_order(db, slug: str, body: dict[str, Any], user_id: Optional[str] = None) -> dict[str, Any]:
    shop = await _shop(db, slug)
    name = _text(body.get("name"), "Имя", 80)
    phone = _phone(str(body.get("phone") or ""))
    address = _text(body.get("address"), "Адрес", 250)
    zones = _zones(shop)
    zone = _text(body.get("zone"), "Район", 80, required=bool(zones))
    if zones and zone not in {z["name"] for z in zones}:
        raise HTTPException(422, "Выберите район доставки из списка")
    wanted = _text(body.get("wanted"), "Когда", 80, required=False)
    comment = _text(body.get("comment"), "Пожелание", 300, required=False)

    wanted_items = body.get("items")
    if not isinstance(wanted_items, list) or not 1 <= len(wanted_items) <= 50:
        raise HTTPException(422, "Корзина пуста")
    quantities: dict[str, int] = {}
    for item in wanted_items:
        if not isinstance(item, dict):
            raise HTTPException(422, "Некорректный товар")
        qty = item.get("qty")
        if isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= 20:
            raise HTTPException(422, "Количество — от 1 до 20")
        sku = str(item.get("sku") or "")
        quantities[sku] = quantities.get(sku, 0) + qty
    rows = {r["sku"]: r for r in (await db.execute(text(
        "SELECT sku, name, price FROM partner_shop_products WHERE shop = :s AND active AND sku = ANY(:k)"),
        {"s": slug, "k": list(quantities)})).mappings().all()}
    missing = [sku for sku in quantities if sku not in rows]
    if missing:
        raise HTTPException(409, "Часть товаров закончилась. Обновите страницу и проверьте корзину.")
    lines = [{"sku": sku, "name": rows[sku]["name"], "price": int(rows[sku]["price"]), "qty": qty}
             for sku, qty in quantities.items()]
    total = sum(line["price"] * line["qty"] for line in lines)
    if total < int(shop.get("min_order") or 0):
        raise HTTPException(422, f"Минимальный заказ — {int(shop['min_order'])} ₸")

    recent = await db.scalar(text("SELECT COUNT(*) FROM partner_shop_orders WHERE phone = :p AND created_at > :t"),
                             {"p": phone, "t": (now() - timedelta(hours=1)).isoformat()})
    if recent >= ORDERS_PER_PHONE_HOUR:
        raise HTTPException(429, "Слишком много заказов с этого номера. Позвоните магазину.")

    order_id = await db.scalar(text(
        "INSERT INTO partner_shop_orders (shop, items, total, customer_name, phone, address, zone, wanted, comment, created_at, user_id) "
        "VALUES (:s, :i, :t, :n, :p, :a, :z, :w, :c, :d, :u) RETURNING id"),
        {"s": slug, "i": json.dumps(lines, ensure_ascii=False), "t": total, "n": name, "p": phone, "a": address,
         "z": zone, "w": wanted, "c": comment, "d": now().isoformat(), "u": user_id})
    await db.commit()
    order = {"id": order_id, "lines": lines, "total": total, "name": name, "phone": phone, "address": address,
             "zone": zone, "wanted": wanted, "comment": comment}
    delivered = await notify(db, slug, shop, order)
    return {"id": order_id, "total": total, "notified": delivered}


# ---------------- Telegram ----------------
def _money(value: int) -> str:
    return f"{int(value):,}".replace(",", " ") + " ₸"


def order_card(shop: dict[str, Any], order: dict[str, Any], accepted_by: str = "") -> str:
    e = html.escape
    out = [f"<b>🌿 Новый заказ №{order['id']}</b> · Сортировка 24", ""]
    out += [f"• {e(l['name'])} × {l['qty']} — {_money(l['price'] * l['qty'])}" for l in order["lines"]]
    out += [f"<b>Итого: {_money(order['total'])}</b>", "",
            f"👤 {e(order['name'])}", f"📞 {e(order['phone'])}", f"📍 {e(order['address'])}" + (f" ({e(order['zone'])})" if order["zone"] else "")]
    if order.get("wanted"):
        out.append(f"🕒 {e(order['wanted'])}")
    if order.get("comment"):
        out.append(f"💬 {e(order['comment'])}")
    zone = next((z for z in _zones(shop) if z["name"] == order["zone"]), None)
    if zone and zone.get("price"):
        out.append(f"🚚 Доставка: {e(zone['price'])}")
    out.append("")
    out.append(f"✅ Принял: {e(accepted_by)}" if accepted_by else "Позвоните клиенту и подтвердите заказ.")
    return "\n".join(out)


async def chats(db, slug: str) -> list[str]:
    await ensure_tables(db)
    return list((await db.scalars(text("SELECT chat_id FROM partner_shop_telegram WHERE shop = :s"), {"s": slug})).all())


async def notify(db, slug: str, shop: dict[str, Any], order: dict[str, Any]) -> int:
    from services.news_agent import bot_token, tg
    targets = await chats(db, slug)
    if not targets or not bot_token():
        logger.warning("[PartnerShop] order %s of %s: no Telegram linked", order["id"], slug)
        return 0
    payload = {"text": order_card(shop, order), "parse_mode": "HTML", "disable_web_page_preview": True,
               "reply_markup": {"inline_keyboard": [[{"text": "✅ Принял", "callback_data": f"{CALLBACK_PREFIX}a:{order['id']}"}]]}}
    sent = 0
    async with httpx.AsyncClient(timeout=10) as client:
        for chat_id in targets:
            try:
                await tg(client, "sendMessage", {"chat_id": chat_id, **payload})
                sent += 1
            except Exception as exc:
                logger.warning("[PartnerShop] send to %s failed: %s", chat_id, exc)
    return sent


async def link_url(db, slug: str) -> dict[str, Any]:
    """A one-day link the partner opens in Telegram to receive orders (several people may link)."""
    from services.courier_telegram import bot_username
    await _shop(db, slug, enabled_only=False)
    bot = await bot_username()
    if not bot:
        raise HTTPException(503, "Бот Telegram не настроен")
    code = secrets.token_urlsafe(18)
    await db.execute(text("DELETE FROM partner_shop_codes WHERE expires_at < :n"), {"n": now().isoformat()})
    await db.execute(text("INSERT INTO partner_shop_codes (code, shop, expires_at) VALUES (:c, :s, :e)"),
                     {"c": code, "s": slug, "e": (now() + timedelta(minutes=LINK_MINUTES)).isoformat()})
    await db.commit()
    return {"url": f"https://t.me/{bot}?start={START_PREFIX}{code}", "linked": len(await chats(db, slug))}


async def handle_message(db, client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """/start shop_<code> links this private chat to the shop; «Кабинет» from a linked chat sends a sign-in link.
    True when the message was ours."""
    from services.news_agent import tg
    from services import partner_shop_cabinet as cabinet
    chat = message.get("chat") or {}
    said = str(message.get("text") or "").strip()
    words = said.split()
    if chat.get("type") != "private":
        return False
    if said.lower() in cabinet.LOGIN_WORDS:
        return await cabinet.send_login(db, client, chat.get("id"))
    if len(words) != 2 or words[0] != "/start" or not words[1].startswith(START_PREFIX):
        return False
    await ensure_tables(db)
    code = words[1][len(START_PREFIX):]
    row = (await db.execute(text("SELECT shop, expires_at FROM partner_shop_codes WHERE code = :c"), {"c": code})).first()
    if not row or row.expires_at < now().isoformat():
        answer = "Ссылка устарела. Попросите у Сортировка 24 новую."
    else:
        sender = message.get("from") or {}
        name = " ".join(x for x in (sender.get("first_name"), sender.get("last_name")) if x) or sender.get("username") or ""
        await db.execute(text("DELETE FROM partner_shop_telegram WHERE shop = :s AND chat_id = :c"),
                         {"s": row.shop, "c": str(chat.get("id"))})
        await db.execute(text("INSERT INTO partner_shop_telegram (shop, chat_id, tg_name, linked_at) VALUES (:s, :c, :n, :t)"),
                         {"s": row.shop, "c": str(chat.get("id")), "n": name[:120], "t": now().isoformat()})
        await db.commit()
        shop = await _shop(db, row.shop, enabled_only=False)
        answer = (f"✅ Готово! Заказы «{shop.get('name') or row.shop}» с Сортировка 24 будут приходить сюда.\n\n"
                  "В каждом заказе — товары, сумма, имя, телефон и адрес клиента. Позвоните клиенту, "
                  "подтвердите заказ и нажмите «✅ Принял».\n\n"
                  "Цены, наличие и все заказы — в кабинете магазина: кнопка ниже или слово «Кабинет».")
        await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": answer, "reply_markup": cabinet.cabinet_button()})
        return True
    await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": answer})
    return True


async def handle_callback(db, client: httpx.AsyncClient, data: str, chat_id: Any, sender: dict, message: dict) -> str:
    """«✅ Принял» under an order: the first press marks it taken and shows who took it."""
    from services.news_agent import tg
    from services import partner_shop_cabinet as cabinet
    if data == f"{CALLBACK_PREFIX}k":
        return "Ссылка на кабинет — ниже" if await cabinet.send_login(db, client, chat_id) else "Этот чат не подключён к магазину"
    try:
        order_id = int(data.split(":")[2])
    except (IndexError, ValueError):
        return "Неизвестная команда"
    await ensure_tables(db)
    row = (await db.execute(text("SELECT * FROM partner_shop_orders WHERE id = :i"), {"i": order_id})).mappings().first()
    if not row or str(chat_id) not in await chats(db, row["shop"]):
        return "Этот чат не подключён к магазину"
    if row["status"] == "new":
        name = " ".join(x for x in (sender.get("first_name"), sender.get("last_name")) if x) or sender.get("username") or "сотрудник"
        await db.execute(text("UPDATE partner_shop_orders SET status = 'accepted', accepted_by = :w, updated_at = :t "
                              "WHERE id = :i AND status = 'new'"), {"w": name[:120], "t": now().isoformat(), "i": order_id})
        await db.commit()
    who = await db.scalar(text("SELECT accepted_by FROM partner_shop_orders WHERE id = :i"), {"i": order_id}) or ""
    shop = await _shop(db, row["shop"], enabled_only=False)
    order = {"id": row["id"], "lines": json.loads(row["items"]), "total": row["total"], "name": row["customer_name"],
             "phone": row["phone"], "address": row["address"], "zone": row["zone"], "wanted": row["wanted"],
             "comment": row["comment"]}
    try:
        await tg(client, "editMessageText", {"chat_id": chat_id, "message_id": message.get("message_id"),
                                             "text": order_card(shop, order, who), "parse_mode": "HTML",
                                             "disable_web_page_preview": True})
    except Exception as exc:
        logger.info("[PartnerShop] edit failed: %s", exc)
    return "Заказ принят"


# ---------------- admin ----------------
async def save_settings(db, slug: str, enabled: bool, settings: dict[str, Any]) -> None:
    await ensure_tables(db)
    await db.execute(text(
        "INSERT INTO partner_shops (slug, enabled, settings, updated_at) VALUES (:s, :e, :j, :t) "
        "ON CONFLICT (slug) DO UPDATE SET enabled = :e, settings = :j, updated_at = :t"),
        {"s": slug, "e": enabled, "j": json.dumps(settings, ensure_ascii=False), "t": now().isoformat()})
    await db.commit()


async def replace_products(db, slug: str, products: list[dict[str, Any]]) -> int:
    """The partner's whole price list: rows not in it are hidden (kept for old orders), the rest upserted by SKU."""
    await _shop(db, slug, enabled_only=False)
    await db.execute(text("UPDATE partner_shop_products SET active = FALSE WHERE shop = :s"), {"s": slug})
    for sort, p in enumerate(products):
        await db.execute(text(
            "INSERT INTO partner_shop_products (shop, sku, category, name, kind, height_cm, pot_cm, price, image, "
            "description, light, water, easy, active, sort) VALUES (:shop, :sku, :category, :name, :kind, :height_cm, :pot_cm, "
            ":price, :image, :description, :light, :water, :easy, TRUE, :sort) "
            "ON CONFLICT (shop, sku) DO UPDATE SET category = :category, name = :name, kind = :kind, height_cm = :height_cm, "
            "pot_cm = :pot_cm, price = :price, image = :image, description = :description, light = :light, water = :water, "
            "easy = :easy, active = TRUE, sort = :sort"),
            {"shop": slug, "description": None, "light": None, "water": None, "easy": False, **p, "sort": sort})
    await db.commit()
    return len(products)


async def orders_of_user(db, user_id: str, limit: int = 100) -> list[dict[str, Any]]:
    """A resident's shop orders for the personal cabinet's order history."""
    await ensure_tables(db)
    rows = (await db.execute(text(
        "SELECT o.id, o.shop, o.items, o.total, o.status, o.customer_name, o.phone, o.address, o.zone, o.wanted, o.comment, "
        "o.created_at, s.settings FROM partner_shop_orders o LEFT JOIN partner_shops s ON s.slug = o.shop "
        "WHERE o.user_id = :u ORDER BY o.id DESC LIMIT :l"), {"u": user_id, "l": limit})).mappings().all()
    out = []
    for r in rows:
        name = _settings(r["settings"]).get("name") or r["shop"]
        items = json.loads(r["items"])
        out.append({
            "id": f"shop_{r['id']}", "type": "shop", "status": r["status"], "amount": r["total"],
            "details": f"{name} — заказ #{r['id']}", "store_label": name, "store_path": f"/shop/{r['shop']}",
            "order_number": r["id"], "order_items": json.dumps([{"name": i["name"], "quantity": i["qty"], "price": i["price"]} for i in items], ensure_ascii=False),
            "customer_name": r["customer_name"], "customer_phone": r["phone"],
            "customer_address": " · ".join(x for x in (r["address"], r["zone"]) if x),
            "comment": " · ".join(x for x in (r["wanted"], r["comment"]) if x), "payment_method": "cash",
            "created_at": r["created_at"],
        })
    return out


async def recent_orders(db, slug: str, limit: int = 100) -> list[dict[str, Any]]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT id, total, customer_name, zone, status, accepted_by, created_at FROM partner_shop_orders "
                                  "WHERE shop = :s ORDER BY id DESC LIMIT :l"), {"s": slug, "l": limit})).mappings().all()
    return [dict(r) for r in rows]
