"""DÄM ALEM operator in Telegram: change a placed order after the customer called.

The order card gets «✏️ Изменить состав». The card message turns into an editor: every dish with ➖ / ➕, «Добавить
блюдо» by menu category, then «Посчитать» shows the new total from the cabinet's own quote and «Сохранить» saves it
through the cabinet's receipt endpoint — the same recalculation of the total, the bonus base and the customer's receipt
as in the cabinet. The draft lives in the chat's «awaiting» state until it is saved or cancelled.
"""
from __future__ import annotations

import html
import json
from typing import Any, Optional

EDITABLE = ("new", "confirmed", "preparing", "ready")
REASON = "Клиент позвонил — состав изменён оператором в Telegram"
NAME_WIDTH = 22


def _money(value: Any) -> str:
    return f"{round(float(value or 0)):,}".replace(",", " ") + " ₸"


def draft_from_order(order: dict) -> dict:
    """The order's own lines (gifts are chosen again by the quote), each keeping its agreed price."""
    try:
        lines = json.loads(order.get("order_items") or "[]")
    except (TypeError, ValueError):
        lines = []
    draft = []
    for index, line in enumerate(lines if isinstance(lines, list) else []):
        if line.get("is_gift"):
            continue
        draft.append({"li": index, "name": str(line.get("name") or "Блюдо"), "price": float(line.get("price") or 0),
                      "q": int(line.get("quantity") or 1)})
    return {"kind": "edit", "order": int(order["id"]), "version": int(order.get("version") or 0), "lines": draft, "gift": None}


def payload(draft: dict) -> dict:
    items = []
    for line in draft["lines"]:
        if line.get("li") is not None:
            items.append({"line_index": line["li"], "quantity": line["q"]})
        else:
            items.append({"id": line["id"], "quantity": line["q"], "modifiers": line.get("mods") or [], "choices": []})
    body = {"expected_version": draft["version"], "items": items, "reason": REASON}
    if draft.get("gift"):
        body["selected_gift_id"] = draft["gift"]
    return body


def editor_text(draft: dict, note: str = "") -> str:
    rows = [f"✏️ <b>Заказ №{draft['order']} — изменение состава</b>",
            "Меняйте количество кнопками ➖ ➕ или добавьте блюдо. Новую сумму покажем перед сохранением.", ""]
    for line in draft["lines"]:
        rows.append(f"• {html.escape(line['name'])} × {line['q']} — {_money(line['price'] * line['q'])}")
    if not draft["lines"]:
        rows.append("<i>В заказе не осталось блюд — добавьте блюдо или отмените заказ.</i>")
    if note:
        rows += ["", note]
    return "\n".join(rows)


def editor_keyboard(draft: dict, cb: str) -> dict:
    oid = draft["order"]
    rows = []
    for index, line in enumerate(draft["lines"][:20]):
        name = line["name"] if len(line["name"]) <= NAME_WIDTH else line["name"][:NAME_WIDTH - 1] + "…"
        rows.append([{"text": "➖", "callback_data": f"{cb}eq:{oid}:{index}:-"},
                     {"text": f"{name} ×{line['q']}", "callback_data": f"{cb}ev:{oid}"},
                     {"text": "➕", "callback_data": f"{cb}eq:{oid}:{index}:+"}])
    rows.append([{"text": "➕ Добавить блюдо", "callback_data": f"{cb}ea:{oid}"}])
    rows.append([{"text": "🧮 Посчитать и сохранить", "callback_data": f"{cb}es:{oid}"}])
    rows.append([{"text": "✖ Отменить изменение", "callback_data": f"{cb}ex:{oid}"}])
    return {"inline_keyboard": rows}


def quote_text(draft: dict, quote: dict) -> str:
    rows = [f"✏️ <b>Заказ №{draft['order']} — проверьте новый состав</b>", ""]
    for line in quote.get("items") or []:
        price = float(line.get("price") or 0) * int(line.get("quantity") or 1)
        gift = " 🎁" if line.get("is_gift") else ""
        rows.append(f"• {html.escape(str(line.get('name') or 'Блюдо'))} × {line.get('quantity') or 1} — {_money(price)}{gift}")
    rows += ["", f"Было: {_money(quote.get('previous_total'))}", f"<b>Станет: {_money(quote.get('total_amount'))}</b>"]
    if float(quote.get("refund_due") or 0) > 0:
        rows.append(f"Вернуть клиенту: {_money(quote['refund_due'])}")
    if quote.get("gift_required"):
        rows += ["", "Сумма дотягивает до подарка — выберите подарок:"]
    return "\n".join(rows)


def quote_keyboard(draft: dict, quote: dict, cb: str) -> dict:
    oid = draft["order"]
    rows = []
    if quote.get("gift_required"):
        for index, gift in enumerate((quote.get("gift_choices") or [])[:6]):
            rows.append([{"text": f"🎁 {gift.get('title') or 'Подарок'}", "callback_data": f"{cb}eg:{oid}:{index}"}])
    else:
        rows.append([{"text": f"✅ Сохранить · {_money(quote.get('total_amount'))}", "callback_data": f"{cb}ey:{oid}"}])
    rows.append([{"text": "↩️ Изменить ещё", "callback_data": f"{cb}ev:{oid}"}])
    rows.append([{"text": "✖ Отменить изменение", "callback_data": f"{cb}ex:{oid}"}])
    return {"inline_keyboard": rows}


async def menu(db, restaurant_id: Optional[int]) -> dict:
    """Sellable dishes of the order's kitchen, grouped by category (the same catalog the cabinet editor uses)."""
    from services.menu_configuration import catalog
    current = await catalog(db)
    products = [p for p in current["products"] if p["sellable"] and (restaurant_id is None or p["restaurant_id"] == restaurant_id)]
    used = {p.get("category_id") or 0 for p in products}
    categories = [c for c in current["categories"] if c["id"] in used]
    return {"products": products, "categories": categories, "groups": current["groups"], "links": current["links"]}


def default_modifiers(product: dict, data: dict) -> list[dict]:
    """Required add-on groups get their first options, as the cabinet editor does for a newly added dish."""
    chosen = []
    for group in data["groups"]:
        if not any(l["food_item_id"] == product["id"] and l["modifier_group_id"] == group["id"] for l in data["links"]):
            continue
        need = max(group.get("min_select") or 0, 1 if group.get("is_required") else 0)
        chosen += [{"option_id": option["id"]} for option in group["options"][:need]]
    return chosen


def categories_keyboard(oid: int, data: dict, cb: str) -> dict:
    rows = [[{"text": c["name"][:40], "callback_data": f"{cb}ec:{oid}:{c['id']}"}] for c in data["categories"][:20]]
    rows.append([{"text": "↩️ Назад к заказу", "callback_data": f"{cb}ev:{oid}"}])
    return {"inline_keyboard": rows}


def products_keyboard(oid: int, category_id: int, data: dict, cb: str) -> dict:
    rows = [[{"text": f"{p['name'][:30]} · {_money(p['price'])}", "callback_data": f"{cb}ep:{oid}:{p['id']}"}]
            for p in data["products"] if (p.get("category_id") or 0) == category_id][:30]
    rows.append([{"text": "↩️ Категории", "callback_data": f"{cb}ea:{oid}"}])
    return {"inline_keyboard": rows}


def change_quantity(draft: dict, index: int, sign: str) -> None:
    line = draft["lines"][index]
    line["q"] = min(99, line["q"] + 1) if sign == "+" else line["q"] - 1
    if line["q"] <= 0:
        draft["lines"].pop(index)
    draft["gift"] = None


def add_product(draft: dict, product: dict, data: dict) -> None:
    for line in draft["lines"]:
        if line.get("li") is None and line.get("id") == product["id"]:
            line["q"] = min(99, line["q"] + 1)
            break
    else:
        draft["lines"].append({"li": None, "id": product["id"], "name": product["name"], "price": float(product["price"] or 0),
                               "q": 1, "mods": default_modifiers(product, data)})
    draft["gift"] = None
