"""One menu and one line-pricing contract for storefront, staff and channel adapters.

Food_items remains the sellable entity, including combos. The recipe is an atomic
JSON aggregate on that entity; it references existing food items, never copies them.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, delete, update
from models.food_items import Food_items
from models.food_categories import Food_categories
from models.food_restaurants import Food_restaurants
from models.modifier_groups import Modifier_groups
from models.modifier_options import Modifier_options
from models.item_modifier_groups import Item_modifier_groups
from services.crm import DAM
from services.loyalty import audit


def money(value):
    try:
        n = Decimal(str(value))
        if not n.is_finite() or n < 0 or n > 100_000_000:
            raise ValueError()
        return n.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(422, 'Цена должна быть конечным неотрицательным числом') from None


def number(value, maximum=99):
    if isinstance(value, bool):
        raise HTTPException(422, 'Некорректное количество')
    try:
        d = Decimal(str(value))
        if not d.is_finite() or d != d.to_integral_value() or not 1 <= d <= maximum:
            raise ValueError()
        return int(d)
    except (ValueError, InvalidOperation, TypeError):
        raise HTTPException(422, 'Некорректное количество') from None


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class OptionInput(Strict):
    id: int | None = Field(None, gt=0)
    name: str = Field(min_length=1, max_length=150)
    price: Decimal = Field(ge=0, le=100_000_000, max_digits=12, decimal_places=2)
    is_active: bool = True
    archived: bool = False
    sort_order: int = Field(0, ge=0, le=10000)


class GroupInput(Strict):
    name: str = Field(min_length=1, max_length=150)
    type: str = 'multiple'
    is_active: bool = True
    archived: bool = False
    is_required: bool = False
    min_select: int = Field(0, ge=0, le=30)
    max_select: int = Field(1, ge=1, le=30)
    sort_order: int = Field(0, ge=0, le=10000)
    expected_version: int | None = Field(None, ge=1)
    options: list[OptionInput] = Field(default_factory=list, max_length=100)

    @model_validator(mode='after')
    def valid(self):
        if self.type not in ('single', 'multiple', 'quantity'):
            raise ValueError('Выберите один, несколько или количество вариантов')
        if self.min_select > self.max_select or (self.type == 'single' and self.max_select != 1):
            raise ValueError('Проверьте минимум и максимум выборов')
        ids = [x.id for x in self.options if x.id]
        if len(ids) != len(set(ids)):
            raise ValueError('Вариант указан дважды')
        return self


class ComponentInput(Strict):
    item_id: int = Field(gt=0)
    quantity: int = Field(1, ge=1, le=99)


class ChoiceInput(ComponentInput):
    surcharge: Decimal = Field(0, ge=0, le=100_000_000, max_digits=12, decimal_places=2)


class ChoiceGroupInput(Strict):
    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    name: str = Field(min_length=1, max_length=150)
    min_select: int = Field(1, ge=0, le=10)
    max_select: int = Field(1, ge=1, le=10)
    options: list[ChoiceInput] = Field(min_length=1, max_length=50)

    @model_validator(mode='after')
    def valid(self):
        if self.min_select > self.max_select or self.max_select > len(self.options):
            raise ValueError('Проверьте количество вариантов в группе комбо')
        ids = [x.item_id for x in self.options]
        if len(ids) != len(set(ids)):
            raise ValueError('Блюдо повторяется в группе комбо')
        return self


class ComboInput(Strict):
    components: list[ComponentInput] = Field(default_factory=list, max_length=50)
    groups: list[ChoiceGroupInput] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def valid(self):
        if not self.components and not self.groups:
            raise ValueError('Добавьте состав или группы выбора комбо')
        ids = [x.item_id for x in self.components]
        gids = [x.id for x in self.groups]
        if len(ids) != len(set(ids)) or len(gids) != len(set(gids)):
            raise ValueError('Не дублируйте компоненты и группы комбо')
        return self


class ItemInput(Strict):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field('', max_length=4000)
    price: Decimal = Field(gt=0, le=100_000_000, max_digits=12, decimal_places=2)
    image_url: str = Field('', max_length=2000)
    category_id: int | None = Field(None, gt=0)
    is_active: bool = True
    available: bool = True
    is_popular: bool = False
    weight: str = Field('', max_length=100)
    sort_order: int = Field(0, ge=0, le=10000)
    archived: bool = False
    is_combo: bool = False
    combo_config: ComboInput | None = None
    modifiers_enabled: bool = False
    modifier_group_ids: list[int] = Field(default_factory=list, max_length=30)
    expected_version: int | None = Field(None, ge=1)

    @model_validator(mode='after')
    def valid(self):
        if self.is_combo != bool(self.combo_config):
            raise ValueError('Для комбо укажите состав; обычному блюду состав комбо не нужен')
        if len(self.modifier_group_ids) != len(set(self.modifier_group_ids)) or any(x <= 0 for x in self.modifier_group_ids):
            raise ValueError('Проверьте выбранные группы добавок')
        if self.image_url and not self.image_url.startswith(('https://', '/uploads/', '/assets/', 'food/')):
            raise ValueError('Используйте загруженное фото или HTTPS-ссылку')
        return self


def active(row):
    return bool(row) and getattr(row, 'is_active', None) is not False and getattr(row, 'available', None) is not False and not getattr(row, 'archived_at', None)


def scope_matches(row, business_id):
    return getattr(row, 'business_id', None) == business_id


def combo_parts(product, products):
    recipe = getattr(product, 'combo_config', None) or {}
    components, groups, reasons = [], [], []
    for part in recipe.get('components', []):
        p = products.get(part['item_id'])
        ok = active(p) and p.restaurant_id == product.restaurant_id and not p.is_combo
        components.append({**part, 'name': p.name if p else 'Удалённое блюдо', 'available': bool(ok)})
        if not ok:
            reasons.append('Компонент «' + (p.name if p else 'Удалённое блюдо') + '» недоступен')
    for group in recipe.get('groups', []):
        opts = []
        for part in group['options']:
            p = products.get(part['item_id'])
            ok = active(p) and p.restaurant_id == product.restaurant_id and not p.is_combo
            opts.append({**part, 'name': p.name if p else 'Удалённое блюдо', 'available': bool(ok)})
        if sum(x['available'] for x in opts) < group['min_select']:
            reasons.append('В группе «' + group['name'] + '» недостаточно доступных вариантов')
        groups.append({**group, 'options': opts})
    return {'components': components, 'groups': groups}, reasons


def price_line(product, raw, products, groups, options, allowed_group_ids, *, business_id=None, trust_price=False):
    """Produce immutable line snapshot, never use client names/prices/totals."""
    qty = number(raw.get('quantity', raw.get('qty', 1)))
    if not active(product):
        raise HTTPException(400, 'Блюдо недоступно')
    base = money(product.price or 0)
    if not base:
        raise HTTPException(400, 'Для блюда не указана цена')
    recipe, problems = combo_parts(product, products)
    if problems:
        raise HTTPException(409, '; '.join(problems))
    selected = raw.get('choices') or []
    if not isinstance(selected, list) or len(selected) > 30:
        raise HTTPException(422, 'Некорректный выбор комбо')
    components = [{**p, 'kind': 'fixed'} for p in recipe['components']]
    checked_choices, choice_total, seen = [], Decimal(0), set()
    for choice in selected:
        if not isinstance(choice, dict):
            raise HTTPException(422, 'Некорректный выбор комбо')
        gid, pid = choice.get('group_id'), choice.get('item_id')
        group = next((g for g in recipe['groups'] if g['id'] == gid), None)
        part = next((p for p in group['options'] if p['item_id'] == pid and p['available']), None) if group else None
        if not part or (gid, pid) in seen or choice.get('quantity', 1) != 1:
            raise HTTPException(422, 'Этот вариант недоступен в выбранном комбо')
        seen.add((gid, pid))
        surcharge = money(part['surcharge'])
        choice_total += surcharge
        checked_choices.append({'group_id': gid, 'item_id': pid})
        components.append({**part, 'surcharge': float(surcharge), 'group_id': gid, 'group_name': group['name'], 'kind': 'choice'})
    for group in recipe['groups']:
        count = sum(gid == group['id'] for gid, _ in seen)
        if not group['min_select'] <= count <= group['max_select']:
            raise HTTPException(422, 'Проверьте выбор: ' + group['name'])
    if getattr(product, 'modifiers_enabled', None) is False:
        allowed_group_ids = set()
    allowed = {gid: groups[gid] for gid in allowed_group_ids if gid in groups and active(groups[gid]) and scope_matches(groups[gid], business_id)}
    mods = raw.get('modifiers') or []
    if not isinstance(mods, list) or len(mods) > 30:
        raise HTTPException(422, 'Некорректные добавки')
    counts, used, snapshots, extra = {}, set(), [], Decimal(0)
    for mod in mods:
        if not isinstance(mod, dict):
            raise HTTPException(422, 'Некорректная добавка')
        oid = number(mod.get('option_id', mod.get('id')), 2147483647)
        option = options.get(oid)
        group = allowed.get(option.group_id) if option else None
        if not group or not active(option) or not scope_matches(option, business_id) or oid in used:
            raise HTTPException(400, 'Добавка недоступна или не относится к блюду')
        count = number(mod.get('quantity', 1), 30)
        if group.type != 'quantity' and count != 1:
            raise HTTPException(422, 'Эту добавку можно выбрать один раз')
        counts[group.id] = counts.get(group.id, 0) + count
        used.add(oid)
        price = money(option.price or 0)
        extra += price * count
        snapshots.append({'option_id': oid, 'group_id': group.id, 'group_name': group.name, 'name': option.name, 'price': float(price), 'quantity': count, 'sum': float(price * count)})
    for gid, group in allowed.items():
        lower = max(int(group.min_select or 0), 1 if group.is_required else 0)
        upper = 1 if group.type in ('single', 'radio') else int(group.max_select or 30)
        if not lower <= counts.get(gid, 0) <= upper:
            raise HTTPException(400, 'Выберите допустимое количество добавок: ' + group.name)
    price = base + choice_total
    if not trust_price:
        if 'price' in raw and money(raw['price']) != price:
            raise HTTPException(400, 'Цена изменилась. Обновите состав заказа')
        supplied_extra = raw.get('modTotal', raw.get('mod_total'))
        if supplied_extra is not None and money(supplied_extra) != extra:
            raise HTTPException(400, 'Доплата за добавки не совпадает')
    return {'id': product.id, 'name': product.name, 'department': getattr(product, 'sales_department', None),
            'quantity': qty, 'base_price': float(base), 'price': float(price), 'choiceTotal': float(choice_total),
            'choices': checked_choices, 'combo_components': components, 'is_combo': bool(getattr(product, 'is_combo', False)),
            'modifiers': snapshots, 'modTotal': float(extra), 'sum': float((price + extra) * qty),
            'menu_version': getattr(product, 'menu_version', 1) or 1}


def serial(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}


async def restaurants(db, business_id=DAM):
    return list((await db.scalars(select(Food_restaurants).where(Food_restaurants.business_id == business_id).order_by(Food_restaurants.id))).all())


async def catalog(db, business_id=DAM, *, owner=False):
    rests = await restaurants(db, business_id)
    ids = [r.id for r in rests]
    products = list((await db.scalars(select(Food_items).where(Food_items.restaurant_id.in_(ids)).order_by(Food_items.sort_order, Food_items.id))).all())
    all_products = {p.id: p for p in products}
    groups = list((await db.scalars(select(Modifier_groups).where(Modifier_groups.business_id == business_id).order_by(Modifier_groups.sort_order, Modifier_groups.id))).all())
    options = list((await db.scalars(select(Modifier_options).where(Modifier_options.business_id == business_id).order_by(Modifier_options.sort_order, Modifier_options.id))).all())
    links = list((await db.scalars(select(Item_modifier_groups).where(Item_modifier_groups.business_id == business_id))).all())
    cats = list((await db.scalars(select(Food_categories).where(Food_categories.restaurant_id.in_(ids)).order_by(Food_categories.sort_order, Food_categories.id))).all())
    gs = []
    for group in groups:
        if not owner and not active(group):
            continue
        gs.append({**serial(group), 'type': {'radio': 'single', 'checkbox': 'multiple'}.get(group.type, group.type), 'options': [serial(o) for o in options if o.group_id == group.id and (owner or active(o))]})
    rows = []
    for p in products:
        if not owner and not active(p):
            continue
        attached = [g for g in gs if any(l.food_item_id == p.id and l.modifier_group_id == g['id'] for l in links)]
        configured = attached if p.modifiers_enabled is not False else []
        recipe, reasons = combo_parts(p, all_products)
        try:
            if not money(p.price or 0): reasons.append('Не указана цена')
        except HTTPException:
            reasons.append('Некорректная цена')
        for group in configured:
            if not active(next(g for g in groups if g.id == group['id'])):
                continue
            lower = max(group['min_select'] or 0, 1 if group['is_required'] else 0)
            count = sum(active(o) for o in options if o.group_id == group['id'])
            capacity = (group['max_select'] or 30) if group['type'] == 'quantity' and count else count
            if lower > capacity:
                reasons.append('В группе «' + group['name'] + '» недостаточно доступных добавок')
        rows.append({**serial(p), 'modifier_group_ids': [g['id'] for g in attached],
                     'modifier_groups': configured, 'combo': recipe if p.is_combo else None,
                     'sellable': active(p) and not reasons, 'unavailable_reasons': reasons})
    categories = [serial(c) for c in cats if owner or active(c)]
    if not owner and any(not p['category_id'] and not p['is_combo'] for p in rows):
        categories.append({'id': 0, 'name': 'Другие блюда', 'sort_order': 9999})
    return {'business_id': business_id, 'restaurant_id': ids[0] if ids else None, 'products': rows,
            'categories': categories, 'groups': gs,
            'options': [o for g in gs for o in g['options']],
            'links': [serial(l) for l in links if any(p['id'] == l.food_item_id and p['modifiers_enabled'] is not False for p in rows)]}


async def versioned(db, model, row_id, business_id, expected):
    row = await db.get(model, row_id)
    if not row or row.business_id != business_id:
        raise HTTPException(404, 'Запись меню не найдена')
    if expected is None or row.menu_version != expected:
        raise HTTPException(409, 'Меню уже изменено. Обновите редактор')
    claim = await db.execute(update(model).where(model.id == row_id, model.menu_version == expected).values(menu_version=expected + 1))
    if claim.rowcount != 1:
        raise HTTPException(409, 'Меню уже изменено. Обновите редактор')
    return row


async def save_group(db, body, actor, row_id=None, business_id=DAM):
    row = await versioned(db, Modifier_groups, row_id, business_id, body.expected_version) if row_id else Modifier_groups(business_id=business_id)
    before = serial(row) if row_id else None
    db.add(row)
    for key in ('name', 'type', 'is_active', 'is_required', 'min_select', 'max_select', 'sort_order'):
        setattr(row, key, getattr(body, key))
    row.archived_at = datetime.now(timezone.utc).isoformat() if body.archived else None
    await db.flush()
    old = {o.id: o for o in (await db.scalars(select(Modifier_options).where(Modifier_options.group_id == row.id))).all()}
    if before is not None:
        before['menu_version'] = body.expected_version
        before['options'] = [serial(o) for o in old.values()]
    keep = set()
    for data in body.options:
        option = old.get(data.id) if data.id else Modifier_options(group_id=row.id, business_id=business_id)
        if not option or option.business_id != business_id:
            raise HTTPException(422, 'Вариант не относится к этой группе')
        db.add(option)
        for key in ('name', 'is_active', 'sort_order'):
            setattr(option, key, getattr(data, key))
        option.price = float(data.price)
        option.archived_at = datetime.now(timezone.utc).isoformat() if data.archived else None
        await db.flush()
        keep.add(option.id)
    for oid, option in old.items():
        if oid not in keep:
            option.archived_at = datetime.now(timezone.utc).isoformat()
            option.is_active = False
    audit(db, 'menu_group_saved', actor, 'modifier_group', row.id, {'business_id': business_id, 'before': before, 'after': body.model_dump(mode='json')})
    await db.flush()
    return row


async def save_item(db, body, actor, row_id=None, business_id=DAM):
    rests = await restaurants(db, business_id)
    if not rests:
        raise HTTPException(409, 'Сначала настройте ресторан бизнеса')
    row = await versioned(db, Food_items, row_id, business_id, body.expected_version) if row_id else Food_items(restaurant_id=rests[0].id, business_id=business_id)
    before = serial(row) if row_id else None
    if before is not None:
        before['menu_version'] = body.expected_version
    if body.category_id:
        category = await db.get(Food_categories, body.category_id)
        if not category or category.restaurant_id != row.restaurant_id:
            raise HTTPException(422, 'Категория не относится к ресторану')
    group_ids = body.modifier_group_ids
    if group_ids:
        valid = list((await db.scalars(select(Modifier_groups.id).where(Modifier_groups.id.in_(group_ids), Modifier_groups.business_id == business_id, Modifier_groups.archived_at.is_(None)))).all())
        if set(valid) != set(group_ids):
            raise HTTPException(422, 'Группа добавок недоступна этому бизнесу')
    if body.combo_config:
        ids = {x.item_id for x in body.combo_config.components} | {x.item_id for g in body.combo_config.groups for x in g.options}
        components = list((await db.scalars(select(Food_items).where(Food_items.id.in_(ids)))).all())
        if len(components) != len(ids) or any(p.restaurant_id != row.restaurant_id or p.business_id != business_id or p.is_combo or p.id == row_id or p.archived_at for p in components):
            raise HTTPException(422, 'Состав должен содержать обычные блюда вашего ресторана')
    db.add(row)
    for key in ('name', 'description', 'image_url', 'category_id', 'is_active', 'available', 'is_popular', 'weight', 'sort_order', 'is_combo', 'modifiers_enabled'):
        setattr(row, key, getattr(body, key))
    row.price = float(body.price)
    row.combo_config = body.combo_config.model_dump(mode='json') if body.combo_config else None
    row.archived_at = datetime.now(timezone.utc).isoformat() if body.archived else None
    await db.flush()
    await db.execute(delete(Item_modifier_groups).where(Item_modifier_groups.food_item_id == row.id))
    for position, gid in enumerate(group_ids):
        db.add(Item_modifier_groups(food_item_id=row.id, modifier_group_id=gid, business_id=business_id, sort_order=position))
    audit(db, 'menu_item_saved', actor, 'food_item', row.id, {'business_id': business_id, 'before': before, 'after': body.model_dump(mode='json')})
    await db.flush()
    return row
