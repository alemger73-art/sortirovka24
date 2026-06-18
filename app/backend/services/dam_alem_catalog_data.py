"""DAM ALEM full menu catalog — categories, items, modifier groups."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

# (slug, name, sort_order, icon, category_type, is_active)
CATEGORIES: List[Tuple[str, str, int, str, Optional[str], bool]] = [
    ("kompleksnye-obedy", "Комплексные обеды", 1, "🍱", None, True),
    ("pizza-30", "Пицца 30 см", 2, "🍕", None, True),
    ("pizza-35", "Пицца 35 см", 3, "🍕", None, True),
    ("burgery", "Бургеры", 4, "🍔", None, True),
    ("donery", "Донеры", 5, "🌯", None, True),
    ("zakuski", "Закуски", 6, "🍟", None, True),
    ("fastfud", "Фастфуд", 7, "🍗", None, True),
    ("shashlyki", "Шашлыки", 8, "🔥", None, True),
    ("shashlychnye-sety", "Шашлычные сеты", 9, "🥩", None, True),
    ("pervye-blyuda", "Первые блюда", 10, "🍲", None, True),
    ("vtorye-blyuda", "Вторые блюда", 11, "🍛", None, True),
    ("salaty", "Салаты", 12, "🥗", None, True),
    ("kombo-fastfud", "Комбо фастфуд", 13, "🎁", None, True),
    ("sety-na-kompaniyu", "Сеты на компанию", 14, "👨‍👩‍👧‍👦", None, True),
    ("molochnye-kokteyli", "Молочные коктейли", 15, "🥤", None, True),
    ("bubble-napitki", "Bubble напитки", 16, "🧋", None, True),
    ("limonady", "Лимонады", 17, "🍋", None, True),
    ("napitki", "Напитки", 18, "🥤", None, True),
    ("sousy", "Соусы", 19, "🫙", None, True),
    ("dopolnitelno", "Дополнительно", 20, "➕", None, True),
    ("dostavka", "Доставка", 98, "🚚", "delivery", False),
    ("novyj-god", "Новый год", 99, "🎄", "seasonal", False),
]


def _desc(name: str, hint: str = "") -> str:
    base = hint.strip() or f"{name} — фирменное блюдо DAM ALEM"
    return f"{base}. Готовим из свежих продуктов, доставляем горячим по Сортировке."


def _item(
    cat: str,
    name: str,
    price: int,
    *,
    sort_order: int = 0,
    weight: str = "",
    is_combo: bool = False,
    is_popular: bool = False,
    description: str = "",
    mod_groups: Optional[List[str]] = None,
    sku: str = "",
) -> Dict[str, Any]:
    return {
        "category_slug": cat,
        "name": name,
        "price": price,
        "sort_order": sort_order,
        "weight": weight,
        "is_combo": is_combo,
        "is_popular": is_popular,
        "description": description or _desc(name),
        "mod_groups": mod_groups or [],
        "sku": sku,
    }


def build_items() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    n = 0

    def add(cat: str, name: str, price: int, **kw) -> None:
        nonlocal n
        n += 1
        items.append(_item(cat, name, price, sort_order=kw.pop("sort_order", n), **kw))

    add("kompleksnye-obedy", "Комплексный обед", 2500, is_popular=True)

    pizza_30 = [
        ("Пицца 4 сезона", 3500, 890),
        ("Пицца Грибная", 3000, 750),
        ("Пицца Курица Грибы", 3500, 890),
        ("Пицца Маргарита", 2400, 590),
        ("Пицца Пепперони", 3200, 800),
        ("Пицца Сырная", 2100, 390),
        ("Пицца Сырный Цыпленок", 3500, 890),
        ("Пицца Фирменная от Шефа", 3700, 890),
        ("Охотничья", 3250, 850),
    ]
    for name, price, up in pizza_30:
        add("pizza-30", name, price, mod_groups=[f"pizza_up_{up}"], weight="30 см")

    pizza_35 = [
        ("Пицца 4 сезона 35 см", 4390),
        ("Пицца Гавайская 35 см", 4500),
        ("Пицца Грибная 35 см", 3750),
        ("Пицца Курица Грибы 35 см", 4390),
        ("Пицца Маргарита 35 см", 2990),
        ("Пицца Пепперони 35 см", 4000),
        ("Пицца Сырная 35 см", 2490),
        ("Пицца Сырный цыпленок 35 см", 4390),
        ("Пицца Фирменная от шефа 35 см", 4590),
        ("Пицца Охотничья 35 см", 4100),
    ]
    for name, price in pizza_35:
        add("pizza-35", name, price, weight="35 см")

    burger_mod = ["burger_extras"]
    for name, price in [
        ("Бургер Криспи", 2300),
        ("Бургер Наггетс", 1800),
        ("Бургер с двойной котлетой", 3000),
        ("Чизбургер", 2500),
    ]:
        add("burgery", name, price, mod_groups=burger_mod, is_popular=name == "Бургер Криспи")

    doner_mod = ["doner_extras", "doner_spice", "doner_options"]
    for name, price in [
        ("Донер Куриный", 1500),
        ("Донер с креветкой", 2800),
        ("Донер с люля кебаб", 2200),
        ("Донер с наггетсами", 1500),
        ("Жареный донер", 1800),
        ("Жульен донер", 1700),
    ]:
        add("donery", name, price, mod_groups=doner_mod, is_popular=name == "Донер Куриный")

    for name, price, weight in [
        ("Картофель фри", 1000, "150 гр"),
        ("Картофельные дольки", 1200, "150 гр"),
        ("Картофельные шарики", 1200, "150 гр"),
        ("Луковые кольца", 1200, "10 шт"),
        ("Наггетсы", 1300, "8 шт"),
        ("Сырные палочки", 1400, "5 шт"),
    ]:
        add("zakuski", f"{name} {weight}", price, weight=weight)

    add("fastfud", "Крылышки в панировке 10 шт", 4500, weight="10 шт", is_popular=True)
    add("fastfud", "Чикен Фрай", 2300)

    shashlik_mod = ["shashlik_extras"]
    for name, price, combo in [
        ("Люля кебаб", 1200, False),
        ("Шашлык крылышки", 1200, False),
        ("Шашлык баранина", 1500, False),
        ("Шашлык филе курицы", 1200, False),
        ("Шашлык филе утки", 1200, False),
        ("Наполеон", 1600, False),
        ("Шашлычный BOX", 4900, True),
        ("Шашлычный BOX с бараниной", 5500, True),
    ]:
        add("shashlyki", name, price, mod_groups=shashlik_mod, is_combo=combo)

    for name, price in [
        ("Сет Праздничный 30 палок шашлыка", 35990),
        ("Сет Трио", 10990),
        ("Сет Шашлычная компания 15 палок шашлыка", 17990),
    ]:
        add("shashlychnye-sety", name, price, is_combo=True)

    for name, price, weight in [
        ("Кукси", 2100, ""),
        ("Лагман с бульоном", 2200, ""),
        ("Окрошка", 990, ""),
        ("Пельмени с бульоном", 1980, "350 гр"),
        ("Том Ям", 2990, ""),
        ("Том Ям с морепродуктами", 3490, ""),
    ]:
        add("pervye-blyuda", name, price, weight=weight)

    add("vtorye-blyuda", "Вок лапша с курицей", 2000)
    add("vtorye-blyuda", "Жаренные пельмени 300 гр", 1890, weight="300 гр")
    add("vtorye-blyuda", "Жареный лагман", 2100)
    add("vtorye-blyuda", "Казан Кебаб", 8000, is_popular=True)
    add("vtorye-blyuda", "Манты жареные", 390, mod_groups=["manti_fried_portion"], weight="1 шт")
    add("vtorye-blyuda", "Манты с фаршем", 360, mod_groups=["manti_portion"], weight="1 шт")
    add("vtorye-blyuda", "Мясо по-казахски", 3590)
    add("vtorye-blyuda", "Паста с креветками", 3490)
    add("vtorye-blyuda", "Паста фетучини", 2440)
    add("vtorye-blyuda", "Плов", 2590)
    add("vtorye-blyuda", "Плов 1 кг", 6990, weight="1 кг")

    salads = [
        ("Ачучук", 450, "100 г"),
        ("Весенний", 400, ""),
        ("Винегрет", 400, "100 г"),
        ("Гнездо глухаря", 3000, "500 г"),
        ("Греческий", 700, "100 г"),
        ("Деревенский", 3000, "1 кг"),
        ("Капустный салат", 400, "100 г"),
        ("Кrabовый", 400, "100 гр"),
        ("Морковча", 300, "100 г"),
        ("Оливье", 500, "100 г"),
        ("По-тайски", 5000, "1 кг"),
        ("Руккола с апельсинами", 2500, "350 г"),
        ("Салат с баклажанами", 3250, "500 г"),
        ("Селедка под шубой", 2500, "500 г"),
        ("Тбилиси", 700, "100 г"),
        ("Фантазия", 500, "100 г"),
        ("Хе с мясом", 500, "100 г"),
        ("Хрустящие шампиньоны", 3500, "500 г"),
        ("Цезарь", 3000, "500 г"),
    ]
    for name, price, weight in salads:
        nm = name
        if weight:
            nm = f"{name} {weight}"
        add("salaty", nm, price, weight=weight)

    combos_ff = [
        ("Донер сет", 2990),
        ("Комбо баскет", 9290),
        ("Комбо на двоих", 7990),
        ("Комбо на одного", 4190),
        ("Мясной", 4590),
        ("Пивной сет 1", 12390),
        ("Пивной сет 2", 17590),
        ("Рыбный", 5500),
        ("Семейное Комбо", 16990),
        ("Сет 1", 8300),
        ("Сет 2", 8390),
        ("Сет 3", 4590),
    ]
    for name, price in combos_ff:
        add("kombo-fastfud", name, price, is_combo=True)

    company_sets = [
        ("Большой восточный сет 20-25 человек", 44990),
        ("Куриное Ассорти", 13990),
        ("Рыбная тарелка", 18990),
        ("Рыбный сет", 26000),
        ("Сет на одного с мантами", 2590),
        ("Сет Казан Кебаб", 14590),
        ("Сет Локомотив", 36990),
        ("Сет Мини Экипаж", 22990),
        ("Сет на 4-6 человек", 11990),
        ("Сет на 2 с лагманом", 5990),
        ("Сет на двоих с мантами", 6090),
        ("Сет на двоих с пастой", 7290),
        ("Сет на двоих с пловом", 8690),
        ("Сет на компанию 10-12 человек", 27590),
        ("Сет на одного с лагманом", 3590),
        ("Сет на одного с пловом", 3590),
        ("Сет с лагманом", 8690),
        ("Сет Семейные", 14990),
    ]
    for name, price in company_sets:
        add("sety-na-kompaniyu", name, price, is_combo=True)

    for name, price in [
        ("Ванильный коктейль", 1200),
        ("Классический коктейль", 1000),
        ("Клубничный коктейль", 1200),
        ("Орео коктейль", 1250),
        ("Шоколадный коктейль", 1200),
    ]:
        add("molochnye-kokteyli", name, price, weight="350 мл")

    for name, price in [
        ("Bubble Oreo", 1200),
        ("Bubble Айс кофе", 1300),
        ("Bubble Баттерфляй", 1200),
    ]:
        add("bubble-napitki", name, price)

    for name, price in [
        ("Арбузный мохито", 1200),
        ("Киви Лайм", 1300),
        ("Манго Маракуйя", 1500),
        ("Матча малина", 1300),
        ("Мохито", 1200),
        ("Сан райз", 1300),
        ("Ягодный", 1300),
    ]:
        add("limonady", name, price)

    drinks = [
        ("Fanta", 700, "1 л"),
        ("Fuse Tea", 650, "1 л"),
        ("Fuse Tea", 500, "0.5 л"),
        ("Gorilla", 700, ""),
        ("Sprite", 700, "1 л"),
        ("Кола", 500, "0.5 л"),
        ("Кола", 650, "1 л"),
        ("Кола", 950, "2 л"),
        ("Компот", 200, "0.33 л"),
        ("Компот", 300, "0.5 л"),
        ("Компот", 600, "1 л"),
        ("Пико", 700, "1 л"),
        ("Сок Дена", 850, ""),
        ("Спрайт", 500, "0.5 л"),
        ("Фанта", 500, "0.5 л"),
        ("Фанта", 950, "2 л"),
        ("Флеш в ассортименте", 700, ""),
    ]
    for name, price, vol in drinks:
        title = f"{name} {vol}".strip() if vol else name
        add("napitki", title, price, weight=vol)

    for name, price in [
        ("Соус Белый Тар-Тар", 300),
        ("Соус Барбекю", 300),
        ("Соус Кавказский", 300),
        ("Соус Кетчуп", 300),
        ("Соус Сырный", 300),
        ("Халапеньо", 300),
    ]:
        add("sousy", name, price)

    for name, price in [
        ("Бауырсаки", 120),
        ("Лепешка", 340),
        ("Шелпеки", 120),
    ]:
        add("dopolnitelno", name, price)

    # Service / hidden
    for name, price in [
        ("Доставка Сортировка", 600),
        ("Доставка Сортировка от 5000 тг", 300),
        ("Рабочий поселок", 1200),
        ("ЖБИ", 1500),
        ("Майкудук", 2000),
        ("В город", 2500),
        ("Доставка до квартиры", 200),
    ]:
        add("dostavka", name, price, description="Служебный тариф доставки")

    for name, price in [
        ("Встречаем 2026 год", 20490),
        ("Елки Палки", 20600),
        ("Мясной сет", 29000),
        ("Новый год без хлопот", 31490),
        ("Рыбный сет", 26000),
    ]:
        add("novyj-god", name, price, is_combo=True, description="Сезонное новогоднее предложение DAM ALEM")

    return items


def build_modifier_groups() -> List[Dict[str, Any]]:
    groups: List[Dict[str, Any]] = []

    for up in (390, 590, 750, 800, 850, 890, 900):
        groups.append({
            "key": f"pizza_up_{up}",
            "name": "Размер пиццы",
            "type": "single",
            "is_required": True,
            "min_select": 1,
            "max_select": 1,
            "sort_order": 1,
            "options": [
                {"name": "Без добавок", "price": 0},
                {"name": f"35 см +{up}", "price": up},
            ],
        })

    groups.extend([
        {
            "key": "burger_extras",
            "name": "Добавки к бургеру",
            "type": "multiple",
            "is_required": False,
            "min_select": 0,
            "max_select": 3,
            "sort_order": 2,
            "options": [
                {"name": "Добавить сыр", "price": 300},
                {"name": "Халапеньо", "price": 300},
                {"name": "Соус на выбор", "price": 300},
            ],
        },
        {
            "key": "doner_extras",
            "name": "Добавки к донеру",
            "type": "multiple",
            "is_required": False,
            "min_select": 0,
            "max_select": 2,
            "sort_order": 3,
            "options": [
                {"name": "Добавка сыр к донеру", "price": 300},
                {"name": "Добавка халапеньо", "price": 300},
            ],
        },
        {
            "key": "doner_spice",
            "name": "Острота",
            "type": "single",
            "is_required": True,
            "min_select": 1,
            "max_select": 1,
            "sort_order": 4,
            "options": [
                {"name": "Не острый", "price": 0},
                {"name": "Острый", "price": 0},
            ],
        },
        {
            "key": "doner_options",
            "name": "Дополнительно",
            "type": "multiple",
            "is_required": False,
            "min_select": 0,
            "max_select": 1,
            "sort_order": 5,
            "options": [
                {"name": "Без лука", "price": 0},
            ],
        },
        {
            "key": "shashlik_extras",
            "name": "Дополнительно к шашлыку",
            "type": "multiple",
            "is_required": False,
            "min_select": 0,
            "max_select": 4,
            "sort_order": 6,
            "options": [
                {"name": "Соус", "price": 300},
                {"name": "Маринованный лук", "price": 0},
                {"name": "Лепешка", "price": 340},
                {"name": "Халапеньо", "price": 300},
            ],
        },
        {
            "key": "manti_portion",
            "name": "Порция мант",
            "type": "single",
            "is_required": True,
            "min_select": 1,
            "max_select": 1,
            "sort_order": 7,
            "options": [
                {"name": "1 шт", "price": 0},
                {"name": "Манты с фаршем 5 шт", "price": 1390},
            ],
        },
        {
            "key": "manti_fried_portion",
            "name": "Порция мант",
            "type": "single",
            "is_required": True,
            "min_select": 1,
            "max_select": 1,
            "sort_order": 8,
            "options": [
                {"name": "1 шт", "price": 0},
                {"name": "Жареные манты 5 шт", "price": 1510},
            ],
        },
    ])
    return groups


def verify_catalog() -> Dict[str, Any]:
    """Sanity check counts and prices for DAM ALEM menu."""
    items = build_items()
    groups = build_modifier_groups()
    prices = {it["name"]: it["price"] for it in items}
    by_cat: Dict[str, int] = {}
    for it in items:
        by_cat[it["category_slug"]] = by_cat.get(it["category_slug"], 0) + 1

    visible_cats = [c for c in CATEGORIES if c[5] and (c[4] or "") not in ("delivery", "seasonal")]
    return {
        "categories_total": len(CATEGORIES),
        "categories_visible": len(visible_cats),
        "items_total": len(items),
        "items_visible": sum(1 for it in items if it["category_slug"] not in ("dostavka", "novyj-god")),
        "items_expected_visible": 156,
        "items_expected_total": 168,
        "modifier_groups": len(groups),
        "items_by_category": by_cat,
        "sample_prices": {
            "Комплексный обед": prices.get("Комплексный обед"),
            "Пицца Маргарита": prices.get("Пицца Маргарита"),
            "Донер Куриный": prices.get("Донер Куриный"),
        },
    }
