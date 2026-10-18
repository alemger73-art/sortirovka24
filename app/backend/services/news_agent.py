"""News agent: finds Karaganda / Sortirovka news, sends drafts to the owner in
Telegram for approval and publishes them on the site.

Flow (all on the server, no manual steps except the approve tap):
  1. every NEWS_AGENT_INTERVAL_MINUTES during the day, read the RSS feeds;
  2. keep items about Karaganda and its districts (Sortirovka first), skip
     anything already seen;
  3. optionally ask Claude (ANTHROPIC_API_KEY) to pick the interesting ones and
     retell them briefly in our own words; without a key the feed lead is used;
  4. create a *draft* news item (never published automatically) with a link to
     the original source, and send it to the owner's Telegram chat with
     «Опубликовать» / «Отклонить» buttons;
  5. the owner's tap publishes the draft or deletes it.

Copyright: we publish only a short retelling plus a link to the original,
never the full article or its photos.
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Optional
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

import httpx
from defusedxml import ElementTree as SafeET
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import hashlib

from models.module_settings import ModuleSettings
from models.news import News

logger = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Almaty")
SITE = os.getenv("PUBLIC_SITE_URL", "https://www.sortirovka24.kz").rstrip("/")
USER_AGENT = "Sortirovka24NewsBot/1.0 (+https://www.sortirovka24.kz)"
CATEGORIES = ["Происшествия", "События района", "ЖКХ", "Дороги", "Инфраструктура", "Объявления", "Важная информация"]
DEFAULT_CATEGORY = "События района"


def _google_news(query: str) -> str:
    return f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=ru&gl=KZ&ceid=KZ:ru"


# "local:" — the whole feed is about Karaganda, so every item counts as local.
DEFAULT_FEEDS = [
    "local:https://inkaraganda.kz/rss",
    "local:https://nv.kz/feed/",
    _google_news("Сортировка Караганда"),
    _google_news("Майкудук"),
    _google_news("Караганда"),
    "https://tengrinews.kz/news.rss",
    "https://kz.kursiv.media/feed/",
    "https://www.inform.kz/rss/ru.xml",
    "https://www.nur.kz/rss/all.rss",
]

SORTIROVKA_RE = re.compile(r"сортировк", re.I)
DISTRICT_RE = re.compile(
    r"майкудук|майқұдық|пришахтинск|михайловк|ф[её]доровк|кирзавод|юго-восток|"
    r"алихан[а]? бок[её]йхан|әлихан бөкейхан|казыбек би|қазыбек би",
    re.I,
)
CITY_RE = re.compile(r"караганд|қарағанд", re.I)
CATEGORY_RULES = [
    ("Происшествия", re.compile(r"дтп|пожар|авари|погиб|задерж|спасател|\bчс\b|утонул|травм", re.I)),
    ("ЖКХ", re.compile(r"отоплен|теплосет|горяч\w* вод|водоснаб|электроснаб|отключ|жкх|коммунал|мусор|канализ", re.I)),
    ("Дороги", re.compile(r"дорог|улиц\w* ремонт|ремонт улиц|трасс|автобус|маршрут|проезд|светофор|развязк", re.I)),
    ("Инфраструктура", re.compile(r"строит|школ|больниц|поликлиник|парк|сквер|благоустр|детск\w* сад", re.I)),
]


# ── settings ────────────────────────────────────────────────────────────────

def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def enabled() -> bool:
    from core.deploy_safety import external_side_effects_allowed
    return (os.getenv("NEWS_AGENT_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
            and external_side_effects_allowed())


def bot_token() -> str:
    return (os.getenv("NEWS_TELEGRAM_BOT_TOKEN") or "").strip()


def approval_chat() -> str:
    return (os.getenv("NEWS_TELEGRAM_CHAT_ID") or "").strip()


def admin_ids() -> set[str]:
    return {x.strip() for x in (os.getenv("NEWS_TELEGRAM_ADMIN_IDS") or "").split(",") if x.strip()}


def feeds() -> list[tuple[str, bool]]:
    raw = [x.strip() for x in (os.getenv("NEWS_AGENT_FEEDS") or "").split(",") if x.strip()] or DEFAULT_FEEDS
    out = []
    for entry in raw:
        local = entry.startswith("local:")
        url = entry[len("local:"):] if local else entry
        if url.startswith("https://"):
            out.append((url, local))
    return out


# ── reading feeds ───────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")


def clean_text(value: Optional[str]) -> str:
    value = html.unescape(_TAG_RE.sub(" ", value or ""))
    return re.sub(r"\s+", " ", value).strip()


def title_key(title: str) -> str:
    words = re.findall(r"[0-9a-zа-яёәғқңөұүһі]+", title.lower())
    return " ".join(words)[:120]


def _words(key: str) -> set[str]:
    return {w[:6] for w in key.split() if len(w) > 2}


def similar(key: str, others: list[set[str]], threshold: float = 0.7) -> bool:
    """Same story from another site: most of the meaningful headline words match."""
    mine = _words(key)
    if len(mine) < 4:
        return False
    return any(len(other) >= 4 and len(mine & other) / min(len(mine), len(other)) >= threshold for other in others)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child_text(node, name: str) -> str:
    for child in list(node):
        if _local(child.tag) == name:
            return (child.text or "").strip()
    return ""


def _parse_date(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def parse_feed(body: bytes | str, local: bool = False) -> list[dict[str, Any]]:
    """RSS 2.0 or Atom → list of {title, url, summary, source, published, local}."""
    root = SafeET.fromstring(body)
    channel_title = ""
    for node in root.iter():
        if _local(node.tag) in ("channel", "feed"):
            channel_title = _child_text(node, "title")
            break
    items = []
    for node in root.iter():
        kind = _local(node.tag)
        if kind not in ("item", "entry"):
            continue
        title = clean_text(_child_text(node, "title"))
        link = _child_text(node, "link")
        if not link:
            for child in list(node):
                if _local(child.tag) == "link" and child.get("href"):
                    link = child.get("href", "")
                    break
        summary = clean_text(_child_text(node, "description") or _child_text(node, "summary"))
        source = clean_text(_child_text(node, "source")) or clean_text(channel_title)
        if source and title.endswith(" - " + source):  # Google News "Title - Source"
            title = title[: -len(source) - 3].strip()
        if summary.startswith(title):  # Google News description repeats the title
            summary = summary[len(title):].strip(" -–—")
        if source and summary.endswith(source):
            summary = summary[: -len(source)].strip(" -–—")
        published = _parse_date(_child_text(node, "pubDate") or _child_text(node, "published") or _child_text(node, "updated"))
        if title and link.startswith("http"):
            items.append({"title": title[:300], "url": link[:1000], "summary": summary[:1200],
                          "source": (source or "")[:200], "published": published, "local": local})
    return items


def score(item: dict[str, Any]) -> int:
    text_all = f"{item['title']} {item.get('summary', '')}"
    if SORTIROVKA_RE.search(text_all):
        return 100
    if DISTRICT_RE.search(text_all):
        return 60
    points = 0
    if CITY_RE.search(item["title"]):
        points = 40
    elif CITY_RE.search(text_all):
        points = 30
    if item.get("local"):
        points = max(points, 30)
    return points


def guess_category(text_all: str) -> str:
    for name, rule in CATEGORY_RULES:
        if rule.search(text_all):
            return name
    return DEFAULT_CATEGORY


def short_lead(summary: str, limit: int = 500) -> str:
    summary = summary.strip()
    if len(summary) <= limit:
        return summary
    cut = summary[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return (cut[: end + 1] if end > 120 else cut.rstrip() + "…").strip()


def split_lead(text_body: str) -> tuple[Optional[str], str]:
    """First sentence becomes the lead, the rest the body, so the page never repeats itself."""
    parts = re.split(r"(?<=[.!?…])\s+", text_body.strip(), maxsplit=1)
    if len(parts) == 2 and 30 <= len(parts[0]) <= 220 and len(parts[1]) >= 30:
        return parts[0], parts[1]
    return None, text_body.strip()


async def fetch_all(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for url, local in feeds():
        try:
            resp = await client.get(url, timeout=20, follow_redirects=True)
            if resp.status_code != 200:
                logger.info("[NewsAgent] %s → HTTP %s", url, resp.status_code)
                continue
            results.extend(parse_feed(resp.content, local))
        except Exception as exc:  # one broken feed must not stop the others
            logger.info("[NewsAgent] feed %s skipped: %s", url, exc)
    return results


# ── AI selection (optional) ─────────────────────────────────────────────────

AI_PROMPT = """Ты редактор районного портала «Сортировка 24» (район Сортировка, город Караганда, Казахстан).
Ниже свежие новости из разных источников. Выбери не больше {limit}, которые действительно интересны и полезны жителям Караганды и особенно района Сортировка: жизнь города, ЖКХ, отключения, дороги, транспорт, стройки, благоустройство, события, решения акимата, важные происшествия в городе.
Не бери: новости без связи с Карагандой, общую политику, рекламу, слухи, повторы одной темы, подробности о частных лицах.
Для каждой выбранной напиши своими словами короткую заметку на русском (2–4 предложения), нейтрально, только по фактам из текста ниже, ничего не придумывай. Заголовок до 100 символов.
Категория — одна из: {categories}.
Ответь только JSON-массивом без пояснений: [{{"index": номер, "title": "...", "text": "...", "category": "..."}}]. Если ничего подходящего нет — [].

Новости:
{items}"""


def _ai_key() -> str:
    return (os.getenv("ANTHROPIC_API_KEY") or "").strip()


async def ai_select(client: httpx.AsyncClient, candidates: list[dict[str, Any]], limit: int) -> Optional[list[dict[str, Any]]]:
    """Return chosen drafts, or None when AI is not configured / failed (→ fallback)."""
    key = _ai_key()
    if not key or not candidates:
        return None
    listing = "\n".join(
        f"{i}. [{c['source']}] {c['title']}\n   {short_lead(c.get('summary') or '', 400)}" for i, c in enumerate(candidates)
    )
    prompt = AI_PROMPT.format(limit=limit, categories=", ".join(CATEGORIES), items=listing)
    try:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": os.getenv("NEWS_AGENT_MODEL", "claude-haiku-5-5"), "max_tokens": 2500,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=90,
        )
        resp.raise_for_status()
        reply = "".join(part.get("text", "") for part in resp.json().get("content", []) if part.get("type") == "text")
        start, end = reply.find("["), reply.rfind("]")
        picks = json.loads(reply[start : end + 1]) if start >= 0 and end > start else []
    except Exception as exc:
        logger.warning("[NewsAgent] AI selection failed, using plain mode: %s", exc)
        return None
    drafts, used = [], set()
    for pick in picks if isinstance(picks, list) else []:
        try:
            index = int(pick.get("index"))
        except (TypeError, ValueError, AttributeError):
            continue
        if index in used or not 0 <= index < len(candidates):
            continue
        body = clean_text(str(pick.get("text") or ""))[:1500]
        if len(body) < 40:
            continue
        used.add(index)
        category = pick.get("category") if pick.get("category") in CATEGORIES else guess_category(body)
        drafts.append({**candidates[index], "draft_title": clean_text(str(pick.get("title") or ""))[:160] or candidates[index]["title"],
                       "draft_text": body, "category": category})
        if len(drafts) >= limit:
            break
    return drafts


def plain_select(candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    drafts = []
    for c in candidates[:limit]:
        lead = short_lead(c.get("summary") or "")
        if len(lead) < 60 or title_key(lead) == title_key(c["title"]):
            lead = "Подробности — по ссылке на источник ниже."
        drafts.append({**c, "draft_title": c["title"][:160], "draft_text": lead,
                       "category": guess_category(f"{c['title']} {c.get('summary', '')}")})
    return drafts


# ── state (no extra tables: one JSON row in module_settings) ────────────────

STATE_KEY = "news_agent_state"
PENDING = "agent_pending"  # News.status of a draft waiting for the owner's tap


async def load_state(db: AsyncSession) -> tuple[ModuleSettings, dict[str, Any]]:
    row = await db.scalar(select(ModuleSettings).where(ModuleSettings.key == STATE_KEY).with_for_update())
    if not row:
        row = ModuleSettings(key=STATE_KEY, value="{}")
        db.add(row)
        await db.flush()
    try:
        state = json.loads(row.value or "{}")
    except ValueError:
        state = {}
    return row, state if isinstance(state, dict) else {}


def save_state(row: ModuleSettings, state: dict[str, Any]) -> None:
    state["urls"] = state.get("urls", [])[-3000:]
    state["keys"] = state.get("keys", [])[-1500:]
    row.value = json.dumps(state, ensure_ascii=False)


def url_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


# ── Telegram ────────────────────────────────────────────────────────────────

async def tg(client: httpx.AsyncClient, method: str, payload: dict[str, Any], timeout: float = 20) -> dict[str, Any]:
    resp = await client.post(f"https://api.telegram.org/bot{bot_token()}/{method}", json=payload, timeout=timeout)
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method}: {data.get('description') or resp.status_code}")
    return data


def _body(content: str) -> str:
    return content.split("\n\nИсточник:", 1)[0]


def approval_text(news: News, source: str, url: str) -> str:
    e = html.escape
    full = " ".join(x for x in (news.short_description, _body(news.content or "")) if x)
    return (f"📰 <b>Новость на согласование</b>\n\n<b>{e(news.title or '')}</b>\n\n{e(full)}\n\n"
            f"Источник: <a href=\"{e(url, quote=True)}\">{e(source or 'открыть')}</a>\n"
            f"Раздел: {e(news.category or '')}")


def approval_keyboard(news_id: int) -> dict[str, Any]:
    return {"inline_keyboard": [
        [{"text": "✅ Опубликовать", "callback_data": f"nw:p:{news_id}"},
         {"text": "❌ Отклонить", "callback_data": f"nw:r:{news_id}"}],
        [{"text": "✏️ Изменить на сайте", "url": f"{SITE}/admin?tab=news"}],
    ]}


def _now_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


async def decide(db: AsyncSession, news_id: int, publish: bool) -> tuple[str, Optional[News]]:
    """Apply the owner's decision. Idempotent: a second tap only reports the state."""
    news = await db.scalar(select(News).where(News.id == news_id).with_for_update())
    if not news:
        return "Черновик уже удалён", None
    if news.published:
        if news.status == PENDING:
            news.status = "published"
            await db.commit()
        return "Уже опубликовано", news
    if news.status != PENDING:
        return "Уже обработано", None
    if publish:
        news.published = True
        news.status = "published"
        news.created_at = _now_iso()
        await db.commit()
        return "Опубликовано на сайте", news
    await db.delete(news)
    await db.commit()
    return "Отклонено", None


async def handle_update(db: AsyncSession, client: httpx.AsyncClient, update: dict[str, Any]) -> None:
    message = update.get("message")
    if isinstance(message, dict):
        chat = message.get("chat") or {}
        if chat.get("type") == "private" and str(message.get("text") or "").strip().split("@")[0] in ("/start", "/id"):
            await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text":
                     f"Бот новостей «Сортировка 24».\nНомер этого чата: {chat.get('id')}\n"
                     "Сюда будут приходить новости на согласование."})
        return
    callback = update.get("callback_query")
    if not isinstance(callback, dict):
        return
    data = str(callback.get("data") or "")
    callback_id = str(callback.get("id") or "")
    msg = callback.get("message") if isinstance(callback.get("message"), dict) else {}
    chat_id = str((msg.get("chat") or {}).get("id", ""))
    sender = str((callback.get("from") or {}).get("id", ""))
    allowed = bool(approval_chat()) and chat_id == approval_chat() and (
        sender in admin_ids() if admin_ids() else sender == chat_id)
    match = re.fullmatch(r"nw:([pr]):(\d+)", data)
    if not allowed or not match:
        await tg(client, "answerCallbackQuery", {"callback_query_id": callback_id,
                 "text": "Нет доступа" if not allowed else "Готово"})
        return
    answer, news = await decide(db, int(match.group(2)), match.group(1) == "p")
    button = ({"text": "✅ Опубликовано — открыть", "url": f"{SITE}/news/{news.id}"} if news
              else {"text": f"• {answer}", "callback_data": "nw:x"})
    try:
        await tg(client, "editMessageReplyMarkup", {"chat_id": chat_id, "message_id": msg.get("message_id"),
                 "reply_markup": {"inline_keyboard": [[button]]}})
    except Exception as exc:
        logger.info("[NewsAgent] could not update buttons: %s", exc)
    await tg(client, "answerCallbackQuery", {"callback_query_id": callback_id, "text": answer})


# ── collection pass ─────────────────────────────────────────────────────────

def in_working_hours(now: Optional[datetime] = None) -> bool:
    local = (now or datetime.now(timezone.utc)).astimezone(TZ)
    return _int("NEWS_AGENT_START_HOUR", 8) <= local.hour < _int("NEWS_AGENT_END_HOUR", 21)


def run_due(state: dict[str, Any], now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if not in_working_hours(now):
        return False
    try:
        last = datetime.fromisoformat(state["last_run"])
    except (KeyError, TypeError, ValueError):
        return True
    return now - last >= timedelta(minutes=max(30, _int("NEWS_AGENT_INTERVAL_MINUTES", 120)))


async def collect(db: AsyncSession, client: httpx.AsyncClient, force: bool = False) -> Optional[dict[str, Any]]:
    """One pass when due. Returns {found, sent, error}, or None when not due.

    The state row is locked while the schedule is checked, so two app
    instances (during a deploy) never both run the same pass."""
    now = datetime.now(timezone.utc)
    row, state = await load_state(db)
    if not force and not run_due(state, now):
        await db.commit()
        return None
    state["last_run"] = now.isoformat()
    save_state(row, state)
    await db.commit()  # spacing holds even if this pass fails
    report: dict[str, Any] = {"found": 0, "sent": 0, "error": None}
    try:
        await _collect(db, client, report, now)
    except Exception as exc:
        await db.rollback()
        report["error"] = str(exc)[:500]
        logger.exception("[NewsAgent] collection failed")
    return report


async def _collect(db: AsyncSession, client: httpx.AsyncClient, report: dict[str, Any], now: datetime) -> None:
    max_age = timedelta(hours=_int("NEWS_AGENT_MAX_AGE_HOURS", 36))
    per_run, daily_max = _int("NEWS_AGENT_PER_RUN", 3), _int("NEWS_AGENT_DAILY_MAX", 10)

    raw = await fetch_all(client)
    row, state = await load_state(db)
    seen_urls = set(state.get("urls", []))
    seen_keys = set(state.get("keys", []))
    for title in (await db.scalars(select(News.title).order_by(News.id.desc()).limit(300))).all():
        seen_keys.add(title_key(title or ""))

    candidates, batch_keys = [], set()
    known_words = [_words(k) for k in seen_keys]
    for item in raw:
        if item["published"] and now - item["published"] > max_age:
            continue
        key = title_key(item["title"])
        if not key or url_id(item["url"]) in seen_urls or key in seen_keys or key in batch_keys:
            continue
        if similar(key, known_words):
            continue
        item["score"] = score(item)
        if item["score"] < 30:
            continue
        batch_keys.add(key)
        known_words.append(_words(key))
        item["title_key"] = key
        candidates.append(item)
    candidates.sort(key=lambda c: (c["score"], c["published"] or now), reverse=True)
    candidates = candidates[:20]
    report["found"] = len(candidates)

    today = now.astimezone(TZ).date().isoformat()
    sent_today = state.get("sent_count", 0) if state.get("sent_day") == today else 0
    limit = max(0, min(per_run, daily_max - sent_today))

    chosen: list[dict[str, Any]] = []
    if limit and candidates:
        chosen = await ai_select(client, candidates, limit)
        if chosen is None:
            chosen = plain_select(candidates, limit)

    # Remember every candidate so nothing is proposed twice, chosen or not.
    state.setdefault("urls", []).extend(url_id(c["url"]) for c in candidates)
    state.setdefault("keys", []).extend(c["title_key"] for c in candidates)
    drafts = []
    for c in chosen:
        lead, text_body = split_lead(c["draft_text"])
        news = News(title=c["draft_title"], short_description=lead,
                    content=f"{text_body}\n\nИсточник: {c['source'] or 'оригинал'} — {c['url']}",
                    category=c["category"], published=False, status=PENDING, created_at=_now_iso())
        db.add(news)
        drafts.append((news, c))
    state["sent_day"], state["sent_count"] = today, sent_today + len(drafts)
    save_state(row, state)
    await db.commit()

    for news, c in drafts:
        try:
            await tg(client, "sendMessage", {
                "chat_id": approval_chat(), "text": approval_text(news, c["source"], c["url"]), "parse_mode": "HTML",
                "disable_web_page_preview": True, "reply_markup": approval_keyboard(news.id),
            })
            report["sent"] += 1
        except Exception as exc:
            # The draft stays on the site under «Черновики»; the owner can publish it there.
            logger.warning("[NewsAgent] Telegram send failed: %s", exc)
            report["error"] = f"Telegram: {exc}"[:500]


# ── background loop ─────────────────────────────────────────────────────────

async def run_forever(session_maker) -> None:
    """Long-polls the bot for decisions and runs collection when due."""
    await asyncio.sleep(20)
    offset: Optional[int] = None
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        while True:
            try:
                if not enabled() or not bot_token():
                    await asyncio.sleep(300)
                    continue
                async with session_maker() as db:
                    report = await collect(db, client)
                    if report:
                        logger.info("[NewsAgent] run: %s", report)
                    params: dict[str, Any] = {"timeout": 25, "allowed_updates": ["callback_query", "message"]}
                    if offset is not None:
                        params["offset"] = offset
                    data = await tg(client, "getUpdates", params, timeout=35)
                    for update in data.get("result", []):
                        offset = int(update["update_id"]) + 1
                        try:
                            await handle_update(db, client, update)
                        except Exception as exc:
                            await db.rollback()
                            logger.warning("[NewsAgent] update failed: %s", exc)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("[NewsAgent] loop error: %s", exc)
                await asyncio.sleep(30)
