"""DAM ALEM — готовый маркетинг: промокоды, подарки, слайды, баннеры."""

from __future__ import annotations

import json
from typing import Any, Dict, List

# Project CDN — stable delivery in KZ / mobile / Yandex Browser (no Unsplash)
_CDN = "https://mgx-backend-cdn.metadl.com/generate/images/1029162"
_IMG = {
    "pizza": f"{_CDN}/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png",
    "doner": f"{_CDN}/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png",
    "burger": f"{_CDN}/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png",
    "combo": f"{_CDN}/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png",
    "shake": f"{_CDN}/2026-03-31/5007abb2-2c10-46e9-9721-c83a5b9a7265.png",
    "fries": f"{_CDN}/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png",
    "lemonade": f"{_CDN}/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png",
    "family": f"{_CDN}/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png",
    "hero": f"{_CDN}/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png",
    "gift": f"{_CDN}/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png",
}

PROMO_CODES: List[Dict[str, Any]] = [
    {
        "code": "DAMALEM10",
        "type": "percent",
        "value": 10,
        "min_order": 2500,
        "active": True,
        "label": "−10% на заказ",
    },
    {
        "code": "PIZZA500",
        "type": "fixed",
        "value": 500,
        "min_order": 3500,
        "active": True,
        "label": "−500 ₸ на пиццу",
    },
    {
        "code": "OBED15",
        "type": "percent",
        "value": 15,
        "min_order": 2000,
        "active": True,
        "label": "−15% комплексный обед",
    },
    {
        "code": "DOSTAVKA",
        "type": "free_delivery",
        "value": 0,
        "min_order": 8000,
        "active": True,
        "label": "Бесплатная доставка",
    },
    {
        "code": "SEMYA20",
        "type": "percent",
        "value": 20,
        "min_order": 12000,
        "active": True,
        "label": "−20% семейный заказ",
    },
]

LOYALTY_GIFTS: List[Dict[str, Any]] = [
    {
        "id": "dam-gift-shake",
        "min_amount": 5000,
        "title": "Молочный коктейль 0.3 л",
        "description": "На выбор: шоколад, клубника или ваниль",
        "image_url": _IMG["shake"],
        "is_active": True,
        "sort_order": 1,
    },
    {
        "id": "dam-gift-fries",
        "min_amount": 8000,
        "title": "Картофель фри 150 г",
        "description": "Хрустящая порция в подарок",
        "image_url": _IMG["fries"],
        "is_active": True,
        "sort_order": 2,
    },
    {
        "id": "dam-gift-lemonade",
        "min_amount": 12000,
        "title": "Лимонад 0.5 л",
        "description": "Освежающий лимонад бесплатно",
        "image_url": _IMG["lemonade"],
        "is_active": True,
        "sort_order": 3,
    },
    {
        "id": "dam-gift-sauce",
        "min_amount": 15000,
        "title": "Соус на выбор",
        "description": "Чесночный, сырный или барбекю",
        "image_url": _IMG["burger"],
        "is_active": True,
        "sort_order": 4,
    },
    {
        "id": "dam-gift-dessert",
        "min_amount": 20000,
        "title": "Десерт к заказу",
        "description": "Сладкий финал от DAM ALEM",
        "image_url": _IMG["shake"],
        "is_active": True,
        "sort_order": 5,
    },
]

PROMO_SLIDES: List[Dict[str, Any]] = [
    {
        "title": "Бесплатная доставка",
        "lines": [
            "От 15 000 ₸ — доставим бесплатно",
            "Горячая еда прямо к подъезду",
            "Промокод DOSTAVKA — от 8 000 ₸",
        ],
    },
    {
        "title": "Промокод DAMALEM10",
        "lines": [
            "−10% на первый и каждый заказ",
            "Минимум всего 2 500 ₸",
            "Введите код при оформлении",
        ],
    },
    {
        "title": "Подарки к заказу",
        "lines": [
            "Коктейль от 5 000 ₸",
            "Лимонад от 12 000 ₸",
            "Добавляем автоматически",
        ],
    },
    {
        "title": "Семейный заказ −20%",
        "lines": [
            "Промокод SEMYA20",
            "От 12 000 ₸ на меню",
            "Идеально на компанию",
        ],
    },
]

MARKETING_SETTING_KEYS: Dict[str, str] = {
    "free_delivery_from": "15000",
    "loyalty_enabled": "1",
    "delivery_time": "35–45 мин",
    "working_hours": "10:00 – 22:00",
    "hero_banner_subtitle": "Горячая еда с доставкой · 35–45 мин · Сортировка",
    "promo_codes": json.dumps(PROMO_CODES, ensure_ascii=False),
    "loyalty_gifts": json.dumps(LOYALTY_GIFTS, ensure_ascii=False),
    "promo_slides": json.dumps(PROMO_SLIDES, ensure_ascii=False),
}

# Keys replaced when empty or when force-seeding marketing
MARKETING_JSON_KEYS = frozenset({"promo_codes", "loyalty_gifts", "promo_slides"})

FOOD_BANNERS: List[Dict[str, Any]] = [
    {
        "title": "−10% с кодом DAMALEM10",
        "subtitle": "Скидка на любой заказ от 2 500 ₸. Введите код при оформлении",
        "image_url": _IMG["pizza"],
        "button_text": "Акция",
        "button_url": "/food",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "Пицца выгоднее на 500 ₸",
        "subtitle": "Промокод PIZZA500 — на пиццу 30 и 35 см от 3 500 ₸",
        "image_url": _IMG["pizza"],
        "button_text": "Пицца",
        "button_url": "/food",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "Комплексный обед −15%",
        "subtitle": "Промокод OBED15 — горячий обед с доставкой от 2 000 ₸",
        "image_url": _IMG["combo"],
        "button_text": "Обеды",
        "button_url": "/food",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "Семейный набор −20%",
        "subtitle": "SEMYA20 — закажите на компанию от 12 000 ₸ и экономьте",
        "image_url": _IMG["family"],
        "button_text": "Сеты",
        "button_url": "/food",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "Подарок к каждому заказу",
        "subtitle": "Коктейль, фри, лимонад — бесплатно от 5 000 ₸",
        "image_url": _IMG["gift"],
        "button_text": "Подарки",
        "button_url": "/food",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "Донер и шашлык — хиты",
        "subtitle": "Самые заказываемые блюда Сортировки. Доставка 35–45 мин",
        "image_url": _IMG["doner"],
        "button_text": "Заказать",
        "button_url": "/food",
        "banner_type": "food_delivery",
        "active": True,
    },
]

REFERRAL_SHARE_TEXT = (
    "Привет! Заказываю в DAM ALEM — вкусная доставка по Сортировке 🍕\n"
    "Промокод DAMALEM10 — скидка 10% на заказ от 2 500 ₸"
)
