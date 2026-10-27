"""Server-rendered SEO shell for the React SPA.

The application remains a Vite/React SPA.  This module enriches the initial
HTML response with route-specific metadata and useful visible content so that
search engines and link preview bots do not have to execute JavaScript first.
React replaces ``#seo-prerender`` after the application starts.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass, field
from typing import Any
from xml.sax.saxutils import escape as xml_escape

from sqlalchemy import select

from core.database import db_manager
from models.announcements import Announcements
from models.food_categories import Food_categories
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.jobs import Jobs
from models.masters import Masters
from models.news import News
from models.real_estate import Real_estate
from models.salons import Salons
from models.partner_profiles import PartnerShowcase
from services.module_settings import is_module_enabled

SITE_URL = "https://www.sortirovka24.kz"
SITE_NAME = "Сортировка 24"
FALLBACK_IMAGE = f"{SITE_URL}/og-cover-v1.jpg"  # 1200×630 card for link previews
LOGO_IMAGE = f"{SITE_URL}/icon-512-v4.png"
PHONE = "+77004280280"
EMAIL = "srt-group.24@mail.ru"


@dataclass
class SeoPage:
    title: str
    description: str
    path: str
    heading: str
    intro: str
    robots: str = "index, follow, max-image-preview:large"
    image: str = FALLBACK_IMAGE
    og_type: str = "website"
    body: str = ""
    schemas: list[dict[str, Any]] = field(default_factory=list)
    status_code: int = 200

    @property
    def canonical(self) -> str:
        return f"{SITE_URL}{self.path if self.path != '/' else '/'}"


PUBLIC_PAGES: dict[str, tuple[str, str, str]] = {
    "/": (
        "Сортировка Караганда — новости и сервисы района | Сортировка 24",
        "Новости района Сортировка в Караганде, объявления, работа, полезный справочник, расписание транспорта и доставка еды DÄM ALEM.",
        "Сортировка 24 — всё о Сортировке в одном месте",
    ),
    "/news": ("Новости Караганды и Казахстана | Сортировка 24", "Свежие новости Караганды, района Сортировка и Казахстана: город, ЖКХ, дороги, экономика, спорт.", "Новости"),
    "/announcements": ("Объявления Сортировки Караганда | Сортировка 24", "Объявления жителей района Сортировка: товары, услуги и полезные предложения.", "Объявления Сортировки"),
    "/real-estate": ("Недвижимость в Сортировке Караганда | Сортировка 24", "Квартиры, дома и коммерческая недвижимость в районе Сортировка Караганды: продажа и аренда.", "Недвижимость в Сортировке"),
    "/jobs": ("Работа в Сортировке Караганда — вакансии | Сортировка 24", "Свежие вакансии и предложения работы в районе Сортировка и Караганде.", "Работа и вакансии в Сортировке"),
    "/food": ("DÄM ALEM — доставка еды по Сортировке, Караганда | Сортировка 24", "Меню DÄM ALEM: UFO-бургеры, пицца, закуски и напитки с доставкой по району Сортировка в Караганде.", "DÄM ALEM — доставка еды в Сортировке"),
    "/directory": ("Полезный справочник Сортировки Караганда | Сортировка 24", "Телефоны экстренных служб, организаций и полезные контакты района Сортировка.", "Полезный справочник Сортировки"),
    "/transport": ("Автобусы Сортировки — маршруты и остановки | Сортировка 24", "Маршруты, остановки и расписание общественного транспорта района Сортировка.", "Автобусы и остановки Сортировки"),
    "/inspectors": ("Участковые инспекторы Сортировки | Сортировка 24", "Контакты участковых инспекторов и отделов полиции района Сортировка в Караганде.", "Участковые инспекторы Сортировки"),
    "/business": ("Бизнес и услуги Сортировки Караганда | Сортировка 24", "Местные компании, магазины, заведения и услуги района Сортировка.", "Бизнес района Сортировка"),
    "/masters": ("Мастера в Сортировке Караганда | Сортировка 24", "Каталог мастеров и бытовых услуг в районе Сортировка Караганды.", "Мастера и услуги в Сортировке"),
    "/salons": ("Салоны и заведения Сортировки Караганда | Сортировка 24", "Салоны, заведения и локальные услуги района Сортировка в Караганде.", "Салоны и заведения Сортировки"),
    "/support": ("Поддержать проект Сортировка 24", "Поддержите развитие полезного цифрового портала района Сортировка.", "Поддержать Сортировка 24"),
    "/questions": ("Вопросы жителей Сортировки | Сортировка 24", "Вопросы и ответы жителей района Сортировка в Караганде.", "Вопросы жителей"),
    "/complaints": ("Обращения жителей Сортировки | Сортировка 24", "Обращения жителей о проблемах района Сортировка в Караганде.", "Обращения жителей"),
    "/announcements/official": ("Разместить в Sortirovka Official — 30 000 жителей Сортировки | Сортировка 24", "Покажем ваше объявление 30 000 подписчикам Sortirovka Official: бизнес, недвижимость и услуги, вакансии и частные объявления.", "Разместить в Sortirovka Official"),
    "/toy": ("Электронное приглашение на той — свадьба, қыз ұзату, сүндет той | Сортировка 24", "Красивое приглашение на той на казахском и русском: дата, карта, программа и ответы гостей по одной ссылке для WhatsApp.", "Приглашение на той"),
}

PRIVATE_PREFIXES = (
    "/api", "/admin", "/partner", "/cabinet", "/account", "/login", "/register",
    "/system-portal-924", "/delivery", "/dam-alem", "/checkout", "/payment", "/auth", "/taxi/ride",
)

NOINDEX_CLIENT_ROUTES = (
    r"/(?:announcements|real-estate|jobs)/(?:new|create)",
    r"/(?:announcements|real-estate|jobs)/\d+/edit",
    r"/questions/(?:new|\d+)",
    r"/masters/(?:become|request|\d+)",
    r"/complaints/new",
    r"/toy/(?:new|my|edit/\d+)",
    r"/food/(?:park|restaurants|courier)",
    r"/(?:more|history|taxi|legal|report-problem|gastronom|volna|prorab|apteka)(?:/.*)?",
)

DYNAMIC_PUBLIC_ROUTE = re.compile(r"/(news|announcements|real-estate|jobs|masters|salons)/(\d+)")


def _text(value: Any, limit: int = 240) -> str:
    clean = re.sub(r"\s+", " ", str(value or "")).strip()
    return clean if len(clean) <= limit else clean[: limit - 1].rstrip() + "…"


def _absolute_image(value: Any) -> str:
    image = _text(value, 1000)
    if not image:
        return FALLBACK_IMAGE
    if image.startswith("https://") or image.startswith("http://"):
        return image
    return f"{SITE_URL}/{image.lstrip('/')}"


def _visible(flag: Any, status: Any = None) -> bool:
    if flag is False:
        return False
    return str(status or "published").lower() in {"published", "approved", "active", "available", ""}


def _link(path: str, title: Any, detail: Any = "") -> str:
    safe_path = html.escape(path, quote=True)
    safe_title = html.escape(_text(title, 120))
    safe_detail = html.escape(_text(detail, 180))
    return f'<article><h2><a href="{safe_path}">{safe_title}</a></h2>{f"<p>{safe_detail}</p>" if safe_detail else ""}</article>'


def _facts(values: list[tuple[str, Any]]) -> str:
    items = "".join(
        f"<li><strong>{html.escape(label)}:</strong> {html.escape(_text(value, 500))}</li>"
        for label, value in values if _text(value, 500)
    )
    return f"<ul>{items}</ul>" if items else ""


# Public sections owned by an admin-toggleable module (see services/module_settings.py).
PATH_MODULE = {
    "/news": "news", "/announcements": "announcements", "/real-estate": "real_estate",
    "/jobs": "jobs", "/food": "food", "/directory": "directory", "/transport": "transport",
    "/inspectors": "inspectors", "/business": "business", "/masters": "masters",
    "/salons": "salons", "/questions": "questions", "/complaints": "complaints",
}


def _module_for(path: str) -> str | None:
    for prefix, key in PATH_MODULE.items():
        if path == prefix or path.startswith(prefix + "/"):
            return key
    return None


async def _disabled_modules() -> set[str]:
    """Modules switched off by the owner; empty on any database problem (fail open)."""
    if not db_manager.async_session_maker:
        return set()
    try:
        async with db_manager.async_session_maker() as session:
            from services.module_settings import get_settings_dict
            return {key for key, value in (await get_settings_dict(session)).items() if value == "false"}
    except Exception:
        return set()


def _base_page(path: str) -> SeoPage:
    if path == "/delete-account":
        return SeoPage(
            "Удаление аккаунта и данных | Сортировка 24",
            "Запрос удаления аккаунта Sortirovka24 и связанных личных данных. Обработка — до 30 календарных дней.",
            path, "Удаление аккаунта и данных", "Начать удаление можно после входа в свой аккаунт. Поддержка: srt-group.24@mail.ru.",
            robots="noindex, follow",
        )
    if path in PUBLIC_PAGES:
        title, description, heading = PUBLIC_PAGES[path]
        page = SeoPage(title, description, path, heading, description)
    elif any(path == prefix or path.startswith(prefix + "/") for prefix in PRIVATE_PREFIXES):
        page = SeoPage(SITE_NAME, "Служебная страница Сортировка 24.", path, SITE_NAME, "", robots="noindex, nofollow")
    elif DYNAMIC_PUBLIC_ROUTE.fullmatch(path):
        # The database-backed metadata is filled below. Keep the fallback out
        # of the index if the database is temporarily unavailable.
        page = SeoPage(SITE_NAME, "Материал Сортировка 24.", path, SITE_NAME, "", robots="noindex, follow")
    elif any(re.fullmatch(pattern, path) for pattern in NOINDEX_CLIENT_ROUTES):
        page = SeoPage(SITE_NAME, "Городской сервис района Сортировка в Караганде.", path, SITE_NAME, "", robots="noindex, follow")
    else:
        page = SeoPage("Страница не найдена | Сортировка 24", "Запрашиваемая страница не найдена.", path, "Страница не найдена", "Вернитесь на главную страницу Сортировка 24.", robots="noindex, follow", status_code=404)
    return page


def _website_schema() -> dict[str, Any]:
    return {
        "@context": "https://schema.org", "@type": "WebSite", "name": SITE_NAME,
        "alternateName": "Sortirovka24", "url": f"{SITE_URL}/", "inLanguage": ["ru", "kk"],
        "publisher": {"@type": "Organization", "name": SITE_NAME, "url": f"{SITE_URL}/", "logo": LOGO_IMAGE},
    }


def _breadcrumb(path: str, name: str) -> dict[str, Any]:
    return {
        "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Главная", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": f"{SITE_URL}{path}"},
        ],
    }


TOY_ROUTE = re.compile(r"/toy/([a-z0-9-]{3,64})")


async def _toy_seo_page(path: str, slug: str) -> SeoPage:
    """A той invitation: real names in the WhatsApp preview, never indexed (it is a private family event)."""
    missing = SeoPage("Шақыру табылмады | Сортировка 24", "Приглашение не найдено или ещё не опубликовано.", path,
                      "Шақыру табылмады", "", robots="noindex, nofollow", status_code=404)
    if not db_manager.async_session_maker:
        return missing
    try:
        from sqlalchemy import text as sql_text
        async with db_manager.async_session_maker() as session:
            row = (await session.execute(sql_text("SELECT status, data FROM toy_invites WHERE slug = :s"), {"s": slug})).first()
    except Exception:
        return missing
    if not row or row.status != "published":
        return missing
    try:
        data = json.loads(row.data or "{}")
    except ValueError:
        data = {}
    who = " и ".join(_text(v, 40) for v in (data.get("name1"), data.get("name2") if data.get("kind") == "wedding" else "") if v)
    when = ".".join(reversed(str(data.get("date", "")).split("-")))
    place = _text(data.get("place"), 80)
    title = f"{who} — шақыру / приглашение на той"
    description = " · ".join(p for p in (f"{when} {_text(data.get('time'), 5)}".strip(), place) if p) or "Приглашение на той"
    return SeoPage(title, description, path, title, description, robots="noindex, nofollow")


async def build_seo_page(path: str) -> SeoPage:
    path = "/" + path.strip("/") if path.strip("/") else "/"
    toy = TOY_ROUTE.fullmatch(path)
    if toy and toy.group(1) not in ("new", "my"):
        return await _toy_seo_page(path, toy.group(1))
    if path == "/partners" or path.startswith("/partners/"):
        return await _partner_seo_page(path)
    page = _base_page(path)
    disabled = await _disabled_modules()
    if _module_for(path) in disabled:
        # A switched-off section must not be indexed or linked as if it worked.
        return SeoPage("Раздел временно недоступен | Сортировка 24", "Раздел временно отключён.", path,
                       "Раздел временно недоступен", "Вернитесь на главную страницу Сортировка 24.",
                       robots="noindex, follow", status_code=404)
    dynamic_match = DYNAMIC_PUBLIC_ROUTE.fullmatch(path)
    if page.status_code == 404 or (page.robots.startswith("noindex") and not dynamic_match):
        return page

    if path == "/":
        sections = [(p, n) for p, n in (("/news", "Новости"), ("/announcements", "Объявления"),
            ("/real-estate", "Недвижимость"), ("/jobs", "Работа"), ("/food", "DÄM ALEM"),
            ("/directory", "Справочник"), ("/transport", "Транспорт")) if PATH_MODULE[p] not in disabled]
        page.body = (
            "<section><h2>Вся Сортировка в одном месте</h2><p>Новости района, полезные контакты "
            "и повседневные сервисы для жителей Сортировки.</p>"
            '<nav aria-label="Основные разделы">' + " · ".join(f'<a href="{p}">{n}</a>' for p, n in sections) + "</nav></section>"
        )
        page.schemas.append(_website_schema())
        page.schemas.append({
            "@context": "https://schema.org", "@type": "Organization", "@id": f"{SITE_URL}/#organization",
            "name": SITE_NAME, "alternateName": ["Sortirovka24", "Сортировка24", "S24"],
            "url": f"{SITE_URL}/", "logo": {"@type": "ImageObject", "url": LOGO_IMAGE, "width": 512, "height": 512},
            "image": FALLBACK_IMAGE, "email": EMAIL, "telephone": PHONE,
            "description": "Цифровой портал района Сортировка в Караганде: новости, справочник, транспорт, бизнес и доставка еды.",
            "address": {"@type": "PostalAddress", "addressLocality": "Караганда", "addressRegion": "Карагандинская область", "addressCountry": "KZ"},
            "contactPoint": {"@type": "ContactPoint", "telephone": PHONE, "contactType": "customer support",
                             "areaServed": "KZ", "availableLanguage": ["Russian", "Kazakh"]},
            "areaServed": {"@type": "AdministrativeArea", "name": "район Сортировка, Караганда"},
        })

    if not db_manager.async_session_maker:
        return page

    try:
        async with db_manager.async_session_maker() as session:
            if path == "/news":
                rows = (await session.execute(select(News).where(News.published.is_(True)).order_by(News.id.desc()).limit(20))).scalars().all()
                page.body = "".join(_link(f"/news/{row.id}", row.title, row.short_description or row.content) for row in rows)
            elif path == "/announcements":
                rows = (await session.execute(select(Announcements).where(Announcements.active.is_(True)).order_by(Announcements.id.desc()).limit(20))).scalars().all()
                page.body = "".join(_link(f"/announcements/{row.id}", row.title, f"{_text(row.price, 50)} {_text(row.address, 80)}") for row in rows if _visible(row.active, row.status))
            elif path == "/real-estate":
                rows = (await session.execute(select(Real_estate).where(Real_estate.active.is_(True)).order_by(Real_estate.id.desc()).limit(20))).scalars().all()
                page.body = "".join(_link(f"/real-estate/{row.id}", row.title, f"{_text(row.price, 50)} · {_text(row.rooms, 30)} · {_text(row.area, 30)}") for row in rows if _visible(row.active, row.status))
            elif path == "/jobs":
                rows = (await session.execute(select(Jobs).where(Jobs.active.is_(True)).order_by(Jobs.id.desc()).limit(20))).scalars().all()
                page.body = "".join(_link(f"/jobs/{row.id}", row.job_title, f"{_text(row.employer, 80)} · {_text(row.salary, 50)}") for row in rows if _visible(row.active, row.status))
            elif path == "/masters":
                rows = (await session.execute(select(Masters).order_by(Masters.id.desc()).limit(40))).scalars().all()
                page.body = "".join(_link(f"/masters/{row.id}", row.name, f"{_text(row.category, 80)} · {_text(row.district, 80)}") for row in rows)
            elif path == "/salons":
                rows = (await session.execute(select(Salons).order_by(Salons.sort_order, Salons.id.desc()).limit(40))).scalars().all()
                page.body = "".join(_link(f"/salons/{row.id}", row.name, f"{_text(row.category, 80)} · {_text(row.address, 100)}") for row in rows)
            elif path == "/food":
                categories = (await session.execute(select(Food_categories).where(Food_categories.is_active.is_(True)).order_by(Food_categories.sort_order, Food_categories.id))).scalars().all()
                items = (await session.execute(select(Food_items).where(Food_items.is_active.is_(True)).order_by(Food_items.sort_order, Food_items.id))).scalars().all()
                restaurant = (await session.execute(select(Food_restaurants).where(Food_restaurants.is_active.is_(True)).order_by(Food_restaurants.sort_order, Food_restaurants.id).limit(1))).scalars().first()
                blocks = []
                if restaurant:
                    blocks.append(
                        "<section><h2>Заказ и доставка</h2>"
                        f"<p>{html.escape(_text(restaurant.description, 1000))}</p>"
                        + _facts([
                            ("Время работы", restaurant.working_hours),
                            ("Срок доставки", restaurant.delivery_time),
                            ("Минимальный заказ", f"{restaurant.min_order:g} ₸" if restaurant.min_order is not None else ""),
                            ("Телефон и WhatsApp", restaurant.whatsapp_phone),
                        ])
                        + "</section>"
                    )
                for category in categories:
                    dishes = [item for item in items if item.category_id == category.id and item.available is not False]
                    if dishes:
                        blocks.append(f"<section><h2>{html.escape(_text(category.name, 80))}</h2>" + "".join(
                            f"<article><h3>{html.escape(_text(item.name, 100))}</h3><p>{html.escape(_text(item.description, 220))}</p><p>{html.escape(_text(item.price, 30))} ₸</p></article>" for item in dishes
                        ) + "</section>")
                page.body = "".join(blocks)
                restaurant_schema = {"@context": "https://schema.org", "@type": "Restaurant", "name": _text(getattr(restaurant, "name", None), 100) or "DÄM ALEM", "url": page.canonical, "image": _absolute_image(getattr(restaurant, "photo", None)), "servesCuisine": _text(getattr(restaurant, "cuisine_type", None), 100) or "Бургеры, пицца и закуски", "areaServed": "район Сортировка, Караганда", "hasMenu": page.canonical}
                if restaurant and restaurant.whatsapp_phone:
                    restaurant_schema["telephone"] = _text(restaurant.whatsapp_phone, 50)
                page.schemas.append(restaurant_schema)
            else:
                match = dynamic_match
                if match:
                    kind, raw_id = match.groups()
                    model = {"news": News, "announcements": Announcements, "real-estate": Real_estate, "jobs": Jobs, "masters": Masters, "salons": Salons}[kind]
                    row = await session.get(model, int(raw_id))
                    visible = row is not None and (_visible(getattr(row, "published", getattr(row, "active", True)), getattr(row, "status", None)))
                    if not visible:
                        return SeoPage("Материал не найден | Сортировка 24", "Материал удалён или ещё не опубликован.", path, "Материал не найден", "", robots="noindex, follow", status_code=404)
                    title_value = _text(getattr(row, "title", None) or getattr(row, "job_title", None) or getattr(row, "name", None), 100)
                    content = _text(getattr(row, "short_description", None) or getattr(row, "description", None) or getattr(row, "content", None), 155)
                    page.title = f"{title_value} | Сортировка 24"
                    page.description = content or f"{title_value} — информация для жителей района Сортировка."
                    page.heading = title_value
                    page.intro = page.description
                    page.image = _absolute_image(getattr(row, "image_url", None) or getattr(row, "photo_url", None))
                    page.og_type = "article" if kind == "news" else "website"
                    page.robots = "index, follow, max-image-preview:large"
                    if kind == "news":
                        page.body = f"<article><p>{html.escape(_text(getattr(row, 'content', None), 6000))}</p></article>"
                    elif kind == "announcements":
                        page.body = (
                            f"<article><p>{html.escape(_text(getattr(row, 'description', None), 4000))}</p>"
                            + _facts([("Цена", getattr(row, "price", None)), ("Адрес", getattr(row, "address", None)), ("Дата публикации", getattr(row, "created_at", None))])
                            + "</article>"
                        )
                    elif kind == "real-estate":
                        page.body = (
                            f"<article><p>{html.escape(_text(getattr(row, 'description', None), 4000))}</p>"
                            + _facts([("Тип", getattr(row, "re_type", None)), ("Цена", getattr(row, "price", None)), ("Комнаты", getattr(row, "rooms", None)), ("Площадь", getattr(row, "area", None)), ("Этаж", getattr(row, "floor_info", None)), ("Адрес", getattr(row, "address", None)), ("Дата публикации", getattr(row, "created_at", None))])
                            + "</article>"
                        )
                    elif kind == "jobs":
                        page.body = (
                            f"<article><p>{html.escape(_text(getattr(row, 'description', None), 4000))}</p>"
                            + _facts([("Работодатель", getattr(row, "employer", None)), ("Зарплата", getattr(row, "salary", None)), ("График", getattr(row, "schedule", None)), ("Район", getattr(row, "district", None)), ("Дата публикации", getattr(row, "created_at", None))])
                            + "</article>"
                        )
                    elif kind == "masters":
                        page.body = f"<article><p>{html.escape(_text(row.description, 4000))}</p>" + _facts([("Категория", row.category), ("Услуги", row.services), ("Опыт", f"{row.experience_years} лет" if row.experience_years is not None else ""), ("Район", row.district)]) + "</article>"
                    else:
                        page.body = f"<article><p>{html.escape(_text(row.description, 4000))}</p>" + _facts([("Категория", row.category), ("Услуги", row.services), ("Адрес", row.address), ("Время работы", row.working_hours), ("Цена от", row.price_from)]) + "</article>"
                    if kind == "news":
                        page.schemas.append({"@context": "https://schema.org", "@type": "NewsArticle", "headline": title_value, "description": page.description, "image": [page.image], "datePublished": _text(getattr(row, "created_at", None), 40), "author": {"@type": "Organization", "name": SITE_NAME}, "publisher": {"@type": "Organization", "name": SITE_NAME, "logo": {"@type": "ImageObject", "url": LOGO_IMAGE}}, "mainEntityOfPage": page.canonical})
                    elif kind == "announcements":
                        product_schema = {"@context": "https://schema.org", "@type": "Product", "name": title_value, "description": page.description, "image": page.image}
                        price = _text(getattr(row, "price", None), 40)
                        if price:
                            product_schema["offers"] = {"@type": "Offer", "price": price, "priceCurrency": "KZT", "availability": "https://schema.org/InStock", "url": page.canonical}
                        page.schemas.append(product_schema)
                    elif kind == "real-estate":
                        residence_schema = {"@context": "https://schema.org", "@type": "Residence", "name": title_value, "description": page.description, "image": page.image, "address": {"@type": "PostalAddress", "streetAddress": _text(getattr(row, "address", None), 150), "addressLocality": "Караганда", "addressCountry": "KZ"}}
                        area = _text(getattr(row, "area", None), 30)
                        if area:
                            residence_schema["floorSize"] = {"@type": "QuantitativeValue", "value": area, "unitText": "м²"}
                        page.schemas.append(residence_schema)
                    elif kind == "jobs":
                        job_schema = {"@context": "https://schema.org", "@type": "JobPosting", "title": title_value, "description": page.description, "datePosted": _text(getattr(row, "created_at", None), 40), "hiringOrganization": {"@type": "Organization", "name": _text(getattr(row, "employer", None), 100) or SITE_NAME}, "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": "Караганда", "addressRegion": _text(getattr(row, "district", None), 100) or "Сортировка", "addressCountry": "KZ"}}, "url": page.canonical}
                        schedule = _text(getattr(row, "schedule", None), 80)
                        if schedule:
                            job_schema["employmentType"] = schedule
                        page.schemas.append(job_schema)
                    elif kind == "masters":
                        page.schemas.append({"@context": "https://schema.org", "@type": "ProfessionalService", "name": title_value, "description": page.description, "image": page.image, "areaServed": _text(row.district, 100) or "Сортировка, Караганда", "url": page.canonical})
                    else:
                        page.schemas.append({"@context": "https://schema.org", "@type": "LocalBusiness", "name": title_value, "description": page.description, "image": page.image, "telephone": _text(row.phone, 50), "address": {"@type": "PostalAddress", "streetAddress": _text(row.address, 150), "addressLocality": "Караганда", "addressCountry": "KZ"}, "url": page.canonical})
                    page.schemas.append(_breadcrumb(path, title_value))
    except Exception:
        # Search pages must remain available when the database is cold; static
        # metadata still gives crawlers a correct, indexable response.
        return page

    return page


def _replace_meta(document: str, page: SeoPage) -> str:
    values = {
        r"<title>.*?</title>": f"<title>{html.escape(page.title)}</title>",
        r'<meta name="description" content="[^"]*"\s*/?>': f'<meta name="description" content="{html.escape(page.description, quote=True)}" />',
        r'<meta name="robots" content="[^"]*"\s*/?>': f'<meta name="robots" content="{html.escape(page.robots, quote=True)}" />',
        r'<link rel="canonical" href="[^"]*"\s*/?>': f'<link rel="canonical" href="{html.escape(page.canonical, quote=True)}" />',
        r'<meta property="og:title" content="[^"]*"\s*/?>': f'<meta property="og:title" content="{html.escape(page.title, quote=True)}" />',
        r'<meta property="og:description" content="[^"]*"\s*/?>': f'<meta property="og:description" content="{html.escape(page.description, quote=True)}" />',
        r'<meta property="og:type" content="[^"]*"\s*/?>': f'<meta property="og:type" content="{page.og_type}" />',
        r'<meta property="og:url" content="[^"]*"\s*/?>': f'<meta property="og:url" content="{html.escape(page.canonical, quote=True)}" />',
        r'<meta property="og:image" content="[^"]*"\s*/?>': f'<meta property="og:image" content="{html.escape(page.image, quote=True)}" />',
        r'<meta name="twitter:title" content="[^"]*"\s*/?>': f'<meta name="twitter:title" content="{html.escape(page.title, quote=True)}" />',
        r'<meta name="twitter:description" content="[^"]*"\s*/?>': f'<meta name="twitter:description" content="{html.escape(page.description, quote=True)}" />',
        r'<meta name="twitter:image" content="[^"]*"\s*/?>': f'<meta name="twitter:image" content="{html.escape(page.image, quote=True)}" />',
    }
    for pattern, replacement in values.items():
        document = re.sub(pattern, lambda _match, value=replacement: value, document, count=1, flags=re.DOTALL | re.IGNORECASE)
    return document


def render_html(document: str, page: SeoPage) -> str:
    document = _replace_meta(document, page)
    schemas = page.schemas or [{"@context": "https://schema.org", "@type": "WebPage", "name": page.title, "description": page.description, "url": page.canonical, "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": f"{SITE_URL}/"}}]
    json_ld = "".join(
        '<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>"
        for schema in schemas
    )
    document = document.replace("</head>", json_ld + "</head>", 1)
    body = (
        '<main id="seo-prerender" style="max-width:1180px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">'
        f'<h1>{html.escape(page.heading)}</h1><p>{html.escape(page.intro)}</p>{page.body}'
        '<p><a href="/">Сортировка 24 — главная</a></p></main>'
    )
    return document.replace('<div id="root"></div>', f'<div id="root">{body}</div>', 1)


async def build_sitemap_xml() -> str:
    """Build a sitemap from public routes and currently published records."""
    disabled = await _disabled_modules()
    urls: dict[str, str | None] = {path: None for path in PUBLIC_PAGES if _module_for(path) not in disabled}
    if db_manager.async_session_maker:
        try:
            async with db_manager.async_session_maker() as session:
                news_rows = (await session.execute(select(News.id, News.created_at).where(News.published.is_(True)))).all()
                announcement_rows = (await session.execute(select(Announcements.id, Announcements.created_at, Announcements.active, Announcements.status).where(Announcements.active.is_(True)))).all()
                estate_rows = (await session.execute(select(Real_estate.id, Real_estate.created_at, Real_estate.active, Real_estate.status).where(Real_estate.active.is_(True)))).all()
                job_rows = (await session.execute(select(Jobs.id, Jobs.created_at, Jobs.active, Jobs.status).where(Jobs.active.is_(True)))).all()
                master_rows = (await session.execute(select(Masters.id, Masters.created_at))).all()
                salon_rows = (await session.execute(select(Salons.id, Salons.created_at))).all()
                for row in news_rows:
                    urls[f"/news/{row.id}"] = _sitemap_date(row.created_at)
                for row in announcement_rows:
                    if _visible(row.active, row.status):
                        urls[f"/announcements/{row.id}"] = _sitemap_date(row.created_at)
                for row in estate_rows:
                    if _visible(row.active, row.status):
                        urls[f"/real-estate/{row.id}"] = _sitemap_date(row.created_at)
                for row in job_rows:
                    if _visible(row.active, row.status):
                        urls[f"/jobs/{row.id}"] = _sitemap_date(row.created_at)
                for row in master_rows:
                    urls[f"/masters/{row.id}"] = _sitemap_date(row.created_at)
                for row in salon_rows:
                    urls[f"/salons/{row.id}"] = _sitemap_date(row.created_at)
        except Exception:
            pass

    if db_manager.async_session_maker:
        try:
            async with db_manager.async_session_maker() as session:
                if await is_module_enabled(session, "business"):
                    urls["/partners"] = None
                    rows = (await session.execute(select(PartnerShowcase).where(PartnerShowcase.published.is_(True)))).scalars().all()
                    for row in rows:
                        urls[f"/partners/{row.slug}"] = _sitemap_date(row.updated_at)
        except Exception:
            pass

    urls = {path: lastmod for path, lastmod in urls.items() if _module_for(path) not in disabled}
    entries = []
    for path, lastmod in urls.items():
        loc = xml_escape(f"{SITE_URL}{path if path != '/' else '/'}")
        modified = f"\n    <lastmod>{lastmod}</lastmod>" if lastmod else ""
        entries.append(f"  <url>\n    <loc>{loc}</loc>{modified}\n  </url>")
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(entries) + "\n</urlset>\n"


def _sitemap_date(value: Any) -> str | None:
    raw = _text(value, 40)
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", raw)
    return match.group(1) if match else None


async def _partner_seo_page(path: str) -> SeoPage:
    page = SeoPage("Партнёры района | Сортировка 24", "Местные компании, услуги и контакты в Караганде.", path, "Партнёры района", "Компании и услуги для жителей Сортировки.")
    if not db_manager.async_session_maker:
        page.robots = "noindex, follow"
        return page
    try:
        async with db_manager.async_session_maker() as session:
            if not await is_module_enabled(session, "business"):
                page.status_code = 404
                page.robots = "noindex, nofollow"
                return page
            if path == "/partners":
                rows = (await session.execute(select(PartnerShowcase).where(PartnerShowcase.published.is_(True)))).scalars().all()
                page.body = "".join(_link(f"/partners/{r.slug}", r.content.get("name"), r.content.get("headline")) for r in rows)
                return page
            row = await session.get(PartnerShowcase, path.removeprefix("/partners/"))
            if row is None or not row.published:
                page.title = page.heading = "Компания не найдена"
                page.robots = "noindex, follow"
                page.status_code = 404
                return page
            data = row.content
            page.title = f"{data['name']} — {data['category']}, Караганда | Сортировка 24"
            page.heading = data["name"]
            page.description = data["headline"]
            page.intro = data["description"]
            image = data.get("cover", "")
            if image.startswith("/") and not image.startswith("//"):
                page.image = SITE_URL + image
            elif image.startswith("https://"):
                page.image = image
            page.body = "<h2>Услуги</h2><ul>" + "".join(f"<li>{html.escape(s)}</li>" for s in data.get("services", [])) + "</ul>"
            page.body += f"<p>{html.escape(data.get('area', ''))}</p><p>{html.escape(data.get('phone', ''))}</p>"
            page.schemas.append({"@context":"https://schema.org", "@type":"Organization", "name":data["name"], "url":page.canonical, "telephone":data.get("phone", ""), "sameAs":[data["instagram"]] if data.get("instagram") else []})
    except Exception:
        page.robots = "noindex, follow"
    return page
