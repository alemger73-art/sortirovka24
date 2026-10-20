"""Site analytics and error watch: collection, summary, Telegram alerts and the daily report.

Everything stays in our database. Visitors are anonymous random ids made in the browser;
no names, phones, addresses or IPs are stored.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.site_analytics import SiteError, SiteEvent

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Almaty")
KIND_RE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}$")
RETENTION_DAYS = 180
OWN_HOSTS = ("sortirovka24.kz", "localhost", "127.0.0.1")


def now() -> datetime:
    return datetime.now(timezone.utc)


# ── user agent → device / platform / browser (coarse, no fingerprinting) ───

def parse_ua(ua: str) -> dict[str, str]:
    ua = ua or ""
    if re.search(r"iPhone|iPod", ua):
        platform, device = "ios", "mobile"
    elif "iPad" in ua or ("Macintosh" in ua and "Mobile" in ua):
        platform, device = "ios", "tablet"
    elif "Android" in ua:
        platform, device = "android", "mobile" if "Mobile" in ua else "tablet"
    elif "Windows" in ua:
        platform, device = "windows", "desktop"
    elif "Macintosh" in ua:
        platform, device = "mac", "desktop"
    else:
        platform, device = "other", "desktop" if "X11" in ua else "other"
    for name, pattern in (("instagram", r"Instagram"), ("telegram", r"Telegram"), ("whatsapp", r"WhatsApp"),
                          ("facebook", r"FBAN|FBAV"), ("yandex", r"YaBrowser|YaSearch"), ("samsung", r"SamsungBrowser"),
                          ("opera", r"OPR/|OPT/"), ("edge", r"Edg"), ("xiaomi", r"MiuiBrowser"), ("firefox", r"Firefox|FxiOS"),
                          ("chrome", r"Chrome|CriOS"), ("safari", r"Safari")):
        if re.search(pattern, ua):
            return {"platform": platform, "device": device, "browser": name}
    return {"platform": platform, "device": device, "browser": "other"}


def referrer_host(value: Any) -> Optional[str]:
    try:
        host = (urlparse(str(value or "")).hostname or "").lower()
    except ValueError:
        return None
    host = host.removeprefix("www.").removeprefix("m.").removeprefix("l.")
    if not host or any(host.endswith(own) for own in OWN_HOSTS):
        return None
    return host[:120]


def clean_props(props: Any) -> Optional[str]:
    if not isinstance(props, dict):
        return None
    out: dict[str, Any] = {}
    for key, value in list(props.items())[:12]:
        key = str(key)[:30]
        if isinstance(value, bool) or value is None:
            out[key] = value
        elif isinstance(value, (int, float)):
            out[key] = value if abs(value) < 1e9 else None
        else:
            text = re.sub(r"\s+", " ", str(value)).strip()
            # Never keep anything that looks like a phone number or e-mail.
            text = re.sub(r"\+?\d[\d\s()-]{8,}\d", "[номер]", text)
            text = re.sub(r"\S+@\S+", "[почта]", text)
            out[key] = text[:200]
    return json.dumps(out, ensure_ascii=False) if out else None


def clean_path(value: Any) -> Optional[str]:
    text = str(value or "")[:300]
    if not text.startswith("/"):
        return None
    path = text.split("#", 1)[0]
    base, _, query = path.partition("?")
    # Keep only harmless query keys (tab/section/category); drop tokens, codes, phones.
    keep = [p for p in query.split("&") if p.split("=", 1)[0] in ("tab", "section", "category", "q")]
    return base + ("?" + "&".join(keep) if keep else "")


async def ingest(db: AsyncSession, body: dict[str, Any], user_agent: str) -> int:
    visitor, session = str(body.get("visitor") or ""), str(body.get("session") or "")
    if not ID_RE.match(visitor) or not ID_RE.match(session):
        return 0
    ua = parse_ua(user_agent)
    stamp = now()
    added = 0
    for raw in (body.get("events") or [])[:30]:
        if not isinstance(raw, dict) or not KIND_RE.match(str(raw.get("kind") or "")):
            continue
        db.add(SiteEvent(created_at=stamp, visitor=visitor, session=session, logged_in=bool(body.get("logged_in")),
                         kind=raw["kind"], path=clean_path(raw.get("path")), referrer=referrer_host(raw.get("referrer")),
                         device=ua["device"], platform=ua["platform"], browser=ua["browser"],
                         standalone=bool(body.get("standalone")), props=clean_props(raw.get("props"))))
        added += 1
    if added:
        await db.commit()
    return added


# ── errors ──────────────────────────────────────────────────────────────────

def fingerprint(source: str, message: str, stack: str, path: str) -> str:
    msg = re.sub(r"\d+", "#", message or "")[:300]
    frame = next((line.strip() for line in (stack or "").splitlines() if "at " in line or "File " in line), "")
    frame = re.sub(r"[?&]v=[^:)]*|-[A-Za-z0-9_]{8}\.js|:\d+:\d+|line \d+", "", frame)[:200]
    route = re.sub(r"/\d+", "/:id", (path or "").split("?", 1)[0])[:120]
    return hashlib.sha256(f"{source}|{msg}|{frame}|{route}".encode()).hexdigest()


async def record_error(db: AsyncSession, *, source: str, message: str, stack: str = "", path: str = "",
                       browser: str = "", release: str = "", visitor: str = "") -> tuple[SiteError, bool]:
    message = (message or "Ошибка без текста")[:2000]
    path = clean_path(path) or (path or "")[:300]
    fp = fingerprint(source, message, stack, path)
    row = await db.scalar(select(SiteError).where(SiteError.fingerprint == fp))
    stamp = now()
    new = row is None
    if new:
        row = SiteError(fingerprint=fp, source=source, message=message, stack=(stack or "")[:8000], path=path,
                        browser=browser[:60], release=release[:40], count=1, first_seen=stamp, last_seen=stamp,
                        status="new", notified=False, visitors=json.dumps([visitor] if visitor else []))
        db.add(row)
    else:
        row.count = (row.count or 0) + 1
        row.last_seen = stamp
        row.browser, row.release = browser[:60] or row.browser, release[:40] or row.release
        if row.status == "fixed":
            row.status, row.notified = "new", False  # came back after a fix
        if visitor:
            seen = json.loads(row.visitors or "[]")
            if visitor not in seen and len(seen) < 50:
                row.visitors = json.dumps(seen + [visitor])
    await db.commit()
    return row, new


def affected(row: SiteError) -> int:
    try:
        return len(json.loads(row.visitors or "[]"))
    except ValueError:
        return 0


# ── summary ─────────────────────────────────────────────────────────────────

FUNNEL = [("food_view", "Открыли меню Дам Алем"), ("add_to_cart", "Положили в корзину"),
          ("checkout_open", "Начали оформление"), ("checkout_step2", "Дошли до оплаты"),
          ("checkout_step3", "Дошли до подтверждения"), ("order_placed", "Оформили заказ")]


def _props(event: SiteEvent) -> dict[str, Any]:
    try:
        return json.loads(event.props or "{}")
    except ValueError:
        return {}


def _section(path: Optional[str]) -> str:
    base = (path or "/").split("?", 1)[0]
    if base == "/":
        return "Главная"
    first = base.strip("/").split("/", 1)[0]
    return {"food": "Дам Алем", "news": "Новости", "cabinet": "Личный кабинет", "account": "Вход", "directory": "Справочник",
            "transport": "Транспорт", "business": "Бизнес", "inspectors": "Участковые", "partners": "Партнёры",
            "more": "Ещё", "delivery": "Отслеживание заказа", "legal": "Документы"}.get(first, "/" + first)


async def summary(db: AsyncSession, days: int = 1) -> dict[str, Any]:
    days = max(1, min(days, 90))
    local_today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    start = (local_today - timedelta(days=days - 1)).astimezone(timezone.utc)
    events = (await db.scalars(select(SiteEvent).where(SiteEvent.created_at >= start)
                                .order_by(SiteEvent.id).limit(300000))).all()
    visitors = {e.visitor for e in events}
    returning = set((await db.scalars(select(SiteEvent.visitor).where(
        SiteEvent.created_at < start, SiteEvent.visitor.in_(list(visitors)[:5000])).distinct())).all()) if visitors else set()
    pageviews = [e for e in events if e.kind == "page_view"]
    sessions = {e.session for e in events}
    by_kind_visitors: dict[str, set[str]] = defaultdict(set)
    for e in events:
        by_kind_visitors[e.kind].add(e.visitor)

    def top(counter: Counter, n: int = 10) -> list[dict[str, Any]]:
        return [{"name": k, "count": v} for k, v in counter.most_common(n)]

    first: dict[str, SiteEvent] = {}
    for e in events:
        first.setdefault(e.visitor, e)
    sources = Counter((f.referrer or "Напрямую / закладка") for f in first.values())

    def per_visitor(attr: str) -> Counter:
        return Counter(getattr(f, attr) or "—" for f in first.values())
    searches = [(_props(e).get("area") or "сайт", str(_props(e).get("q") or "").lower(), _props(e).get("results"))
                for e in events if e.kind == "search"]
    hours = Counter(e.created_at.astimezone(TZ).hour for e in pageviews if e.created_at)
    daily = Counter(e.created_at.astimezone(TZ).date().isoformat() for e in pageviews)
    daily_visitors: dict[str, set[str]] = defaultdict(set)
    for e in events:
        daily_visitors[e.created_at.astimezone(TZ).date().isoformat()].add(e.visitor)
    orders = [_props(e) for e in events if e.kind == "order_placed"]
    errors = (await db.scalars(select(SiteError).where(SiteError.status != "fixed")
                                .order_by(SiteError.last_seen.desc()).limit(20))).all()
    return {
        "days": days,
        "visitors": len(visitors),
        "new_visitors": len(visitors - returning),
        "returning_visitors": len(visitors & returning),
        "logged_in_visitors": len({e.visitor for e in events if e.logged_in}),
        "sessions": len(sessions),
        "pageviews": len(pageviews),
        "pages_per_session": round(len(pageviews) / len(sessions), 1) if sessions else 0,
        "app_users": len({e.visitor for e in events if e.standalone}),
        "by_day": [{"day": d, "visitors": len(daily_visitors[d]), "pageviews": daily.get(d, 0)} for d in sorted(daily_visitors)],
        "hours": [{"hour": h, "pageviews": hours.get(h, 0)} for h in range(24)],
        "sections": top(Counter(_section(e.path) for e in pageviews), 12),
        "pages": top(Counter((e.path or "/").split("?", 1)[0] for e in pageviews), 15),
        "sources": top(sources, 10),
        "devices": top(per_visitor("device")),
        "platforms": top(per_visitor("platform")),
        "browsers": top(per_visitor("browser")),
        "searches": top(Counter(f"{a}: {q}" for a, q, _ in searches if q), 20),
        "searches_without_results": top(Counter(f"{a}: {q}" for a, q, r in searches if q and r == 0), 20),
        "dishes_viewed": top(Counter(_props(e).get("name") for e in events if e.kind == "dish_view" and _props(e).get("name")), 15),
        "dishes_added": top(Counter(_props(e).get("name") for e in events if e.kind == "add_to_cart" and _props(e).get("name")), 15),
        "news_read": top(Counter(_props(e).get("title") for e in events if e.kind == "news_read" and _props(e).get("title")), 10),
        "funnel": [{"step": label, "visitors": len(by_kind_visitors.get(kind, set()))} for kind, label in FUNNEL],
        "orders": {"count": len(orders), "sum": round(sum(float(o.get("total") or 0) for o in orders)),
                   "payment": dict(Counter(o.get("payment") or "—" for o in orders)),
                   "method": dict(Counter(o.get("method") or "—" for o in orders))},
        "app": {"install_offered": len(by_kind_visitors.get("pwa_install_cta_shown", set())),
                "install_clicked": len(by_kind_visitors.get("pwa_install_cta_clicked", set())),
                "installed": len(by_kind_visitors.get("pwa_install_accepted", set()) | by_kind_visitors.get("pwa_appinstalled", set())),
                "push_enabled": len(by_kind_visitors.get("push_enabled", set()))},
        "login": {"opened": len(by_kind_visitors.get("login_open", set())),
                  "code_requested": len(by_kind_visitors.get("login_code_requested", set())),
                  "logged_in": len(by_kind_visitors.get("login_success", set()))},
        "events": top(Counter(e.kind for e in events), 40),
        "errors": [error_view(r) for r in errors],
    }


def error_view(r: SiteError) -> dict[str, Any]:
    return {"id": r.id, "source": r.source, "message": r.message[:500], "path": r.path, "count": r.count,
            "visitors": affected(r), "browser": r.browser, "status": r.status, "release": r.release,
            "first_seen": r.first_seen.isoformat() if r.first_seen else None,
            "last_seen": r.last_seen.isoformat() if r.last_seen else None, "stack": (r.stack or "")[:3000], "note": r.note}


# ── Telegram ────────────────────────────────────────────────────────────────

def _esc(text: Any) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def telegram(text: str) -> bool:
    from services.news_agent import approval_chat, bot_token, tg
    if not (bot_token() and approval_chat()):
        return False
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": text[:4000], "parse_mode": "HTML",
                                              "disable_web_page_preview": True})
        return True
    except Exception as exc:
        logger.warning("[SiteWatch] Telegram failed: %s", exc)
        return False


_alerts: list[float] = []


async def alert_new_error(row: SiteError) -> None:
    """At most 10 alerts an hour, one per distinct error."""
    import time
    stamp = time.time()
    _alerts[:] = [t for t in _alerts if stamp - t < 3600]
    if len(_alerts) >= 10:
        return
    _alerts.append(stamp)
    where = "на сайте у посетителя" if row.source == "client" else "на сервере"
    text = (f"⚠️ <b>Новая ошибка {where}</b>\n"
            f"Страница: {_esc(row.path or '—')}\nБраузер: {_esc(row.browser or '—')}\n"
            f"<code>{_esc(row.message[:400])}</code>\n\n"
            "Подробности — в админке, раздел «Посещаемость» → «Ошибки».")
    await telegram(text)


def report_text(s: dict[str, Any]) -> str:
    lines = [f"📊 <b>Сортировка 24 — итоги дня</b>",
             f"Посетителей: <b>{s['visitors']}</b> (новых {s['new_visitors']}, вернулись {s['returning_visitors']}, "
             f"вошли в аккаунт {s['logged_in_visitors']})",
             f"Просмотров страниц: {s['pageviews']} · через приложение: {s['app_users']}"]
    if s["sources"]:
        lines.append("Откуда пришли: " + ", ".join(f"{_esc(x['name'])} {x['count']}" for x in s["sources"][:5]))
    if s["sections"]:
        lines.append("Смотрели: " + ", ".join(f"{_esc(x['name'])} {x['count']}" for x in s["sections"][:6]))
    funnel = " → ".join(str(x["visitors"]) for x in s["funnel"])
    lines.append(f"Дам Алем (меню → корзина → оформление → оплата → подтверждение → заказ): {funnel}")
    if s["orders"]["count"]:
        lines.append(f"Заказов с сайта: {s['orders']['count']} на {s['orders']['sum']} ₸")
    if s["dishes_added"]:
        lines.append("Чаще кладут в корзину: " + ", ".join(_esc(x["name"]) for x in s["dishes_added"][:5]))
    if s["searches"]:
        lines.append("Искали: " + ", ".join(_esc(x["name"]) for x in s["searches"][:6]))
    if s["searches_without_results"]:
        lines.append("❗ Искали и не нашли: " + ", ".join(_esc(x["name"]) for x in s["searches_without_results"][:6]))
    app = s["app"]
    lines.append(f"Приложение: предложили {app['install_offered']}, нажали {app['install_clicked']}, "
                 f"установили {app['installed']}; уведомления включили {app['push_enabled']}")
    if s["errors"]:
        lines.append(f"⚠️ Открытых ошибок: {len(s['errors'])} (самая частая: {_esc(s['errors'][0]['message'][:120])})")
    else:
        lines.append("✅ Ошибок нет")
    return "\n".join(lines)


async def run_forever(session_maker) -> None:
    """Daily report at REPORT_HOUR (Almaty) and cleanup of old events."""
    if os.getenv("SITE_REPORT_ENABLED", "1").strip().lower() in {"0", "false", "no", "off"}:
        return
    sent_day = None
    while True:
        try:
            local = datetime.now(TZ)
            hour = int(os.getenv("SITE_REPORT_HOUR", "21"))
            if local.hour >= hour and sent_day != local.date():
                async with session_maker() as db:
                    from models.module_settings import ModuleSettings
                    mark = await db.scalar(select(ModuleSettings).where(ModuleSettings.key == "site_report_day"))
                    if not mark or mark.value != local.date().isoformat():
                        await telegram(report_text(await summary(db, 1)))
                        if not mark:
                            mark = ModuleSettings(key="site_report_day")
                            db.add(mark)
                        mark.value = local.date().isoformat()
                        await db.execute(delete(SiteEvent).where(SiteEvent.created_at < now() - timedelta(days=RETENTION_DAYS)))
                        await db.commit()
                sent_day = local.date()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("[SiteWatch] report loop: %s", exc)
        await asyncio.sleep(300)
