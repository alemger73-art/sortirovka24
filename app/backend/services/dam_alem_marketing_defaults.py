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
        "max_discount": 1500,
        "active": True,
        "label": "−10% другу / себе",
    },
    {
        "code": "ALEM500",
        "type": "fixed",
        "value": 500,
        "min_order": 3000,
        "active": True,
        "label": "−500 ₸ на заказ",
    },
    {
        "code": "PIZZA500",
        "type": "fixed",
        "value": 500,
        "min_order": 3500,
        "active": True,
        "label": "−500 ₸ на заказ",
    },
    {
        "code": "OBED15",
        "type": "percent",
        "value": 15,
        "min_order": 4000,
        "max_discount": 1200,
        "active": True,
        "label": "−15% на обед",
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
        "max_discount": 3000,
        "active": True,
        "label": "−20% семейный заказ",
    },
    {
        "code": "WEEKEND",
        "type": "percent",
        "value": 12,
        "min_order": 5000,
        "max_discount": 2000,
        "active": True,
        "label": "−12% выходные",
    },
]

LOYALTY_GIFTS: List[Dict[str, Any]] = [
    {
        "id": "dam-gift-fries",
        "min_amount": 5000,
        "title": "Картофель фри 150 г",
        "description": "Выберите бесплатно к заказу",
        "image_url": _IMG["fries"],
        "is_active": True,
        "sort_order": 1,
    },
    {
        "id": "dam-gift-lemonade",
        "min_amount": 5000,
        "title": "Лимонад 0.5 л",
        "description": "Выберите бесплатно к заказу",
        "image_url": _IMG["lemonade"],
        "is_active": True,
        "sort_order": 2,
    },
    {
        "id": "dam-gift-sauce",
        "min_amount": 5000,
        "title": "Соус на выбор",
        "description": "Выберите бесплатно к заказу",
        "image_url": _IMG["burger"],
        "is_active": True,
        "sort_order": 3,
    },
    {
        "id": "dam-gift-dessert",
        "min_amount": 10000,
        "title": "Десерт дня",
        "description": "Следующий уровень — десерт бесплатно",
        "image_url": _IMG["shake"],
        "is_active": True,
        "sort_order": 4,
    },
]

PROMO_SLIDES: List[Dict[str, Any]] = [
    {
        "title": "Бесплатно до квартиры",
        "lines": [
            "От 15 000 ₸ — доставка и подъём бесплатно",
            "Горячая еда прямо до двери",
            "Промокод DOSTAVKA — от 8 000 ₸",
        ],
    },
    {
        "title": "Промокод DAMALEM10",
        "lines": [
            "−10% на заказ, максимум 1 000 ₸",
            "Минимум всего 2 500 ₸",
            "Введите код при оформлении",
        ],
    },
    {
        "title": "Подарки к заказу",
        "lines": [
            "От 5 000 ₸ — подарок бесплатно",
            "Фри, лимонад или соус",
            "Выберите при оформлении",
        ],
    },
    {
        "title": "Семейный заказ −20%",
        "lines": [
            "Промокод SEMYA20",
            "От 12 000 ₸ на меню",
            "Максимальная скидка 3 000 ₸",
        ],
    },
]

REFERRAL_SHARE_TEXT = (
    "Привет! Заказываю в DAM ALEM 2.0 — доставка по Сортировке.\n"
    "Промокод DAMALEM10 — скидка 10% на заказ от 2 500 ₸"
)

MARKETING_SETTING_KEYS: Dict[str, str] = {
    "free_delivery_from": "15000",
    "apartment_delivery_price": "300",
    "apartment_free_from": "15000",
    "loyalty_enabled": "1",
    "delivery_time": "35–45 мин",
    "working_hours": "10:00 – 22:00",
    "hero_banner_subtitle": "Горячая еда с доставкой · 35–45 мин · Сортировка",
    "promo_codes": json.dumps(PROMO_CODES, ensure_ascii=False),
    "loyalty_gifts": json.dumps(LOYALTY_GIFTS, ensure_ascii=False),
    "promo_slides": json.dumps(PROMO_SLIDES, ensure_ascii=False),
    "referral_enabled": "1",
    "referral_promo_code": "DAMALEM10",
    "referral_title": "Отправить другу — скидка 10%",
    "referral_subtitle": "Друг получает код DAMALEM10 на заказ от 2 500 ₸",
    "referral_share_text": REFERRAL_SHARE_TEXT,
}

# Keys replaced when empty or when force-seeding marketing
MARKETING_JSON_KEYS = frozenset({"promo_codes", "loyalty_gifts", "promo_slides"})

FOOD_BANNERS: List[Dict[str, Any]] = [
    {
        "title": "−10% с кодом DAMALEM10",
        "subtitle": "Скидка на любой заказ от 2 500 ₸. Введите код при оформлении",
        "image_url": _IMG["pizza"],
        "button_text": "Акция",
        "button_url": "/food#promo=DAMALEM10",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "−500 ₸ с кодом ALEM500",
        "subtitle": "На заказ от 3 000 ₸",
        "image_url": _IMG["burger"],
        "button_text": "Применить",
        "button_url": "/food#promo=ALEM500",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "Доставка бесплатно",
        "subtitle": "Промокод DOSTAVKA — бесплатная доставка от 8 000 ₸",
        "image_url": _IMG["combo"],
        "button_text": "Применить",
        "button_url": "/food#promo=DOSTAVKA",
        "banner_type": "food_delivery",
        "active": True,
    },
    {
        "title": "Подарок на выбор от 5 000 ₸",
        "subtitle": "Фри, лимонад или соус — выберите один бесплатно",
        "image_url": _IMG["gift"],
        "button_text": "Подарки",
        "button_url": "/food#gifts",
        "banner_type": "food_delivery",
        "active": True,
    },
]