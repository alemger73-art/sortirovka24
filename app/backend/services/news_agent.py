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
CATEGORIES = ["Караганда", "Сортировка", "Казахстан", "Происшествия", "ЖКХ", "Дороги", "Инфраструктура",
              "Экономика", "Спорт", "Общество", "Мир", "Важная информация"]
DEFAULT_CATEGORY = "Караганда"
# Big national newsrooms: their items are welcome even without a Karaganda angle.
NATIONAL_DOMAINS = ("tengrinews.kz", "kursiv.media", "inform.kz", "nur.kz")


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
    ("Дороги", re.compile(r"дорог|улиц\w* ремонт|ремонт улиц|автотрасс|трасс[аеуы] (?:караганд|астан|алмат|республ)|автобус|маршрут|проезд|светофор|развязк", re.I)),
    ("Спорт", re.compile(r"чемпион|турнир|матч|сборн\w+|олимпи|футбол|хокке|бокс|медал|спортсмен", re.I)),
    ("Экономика", re.compile(r"тенге|курс\w* (?:доллар|валют)|инфляц|нацбанк|бюджет|налог|зарплат|пенси|цен[аыу] на|экономик|бизнес", re.I)),
    ("Инфраструктура", re.compile(r"строител|строят|построят|построен|капремонт|реконструк|благоустр|сквер|подстанц|котельн|"
                                   r"газифик|новая школа|новую школу|новой школ|детск\w* сад|поликлиник|больниц", re.I)),
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
    if not points and any(d in (item.get("url") or "") for d in NATIONAL_DOMAINS):
        points = 32  # national news: a reader of a city portal wants the main news of the country too
    return points


def guess_category(text_all: str) -> str:
    for name, rule in CATEGORY_RULES:
        if rule.search(text_all):
            return name
    if SORTIROVKA_RE.search(text_all):
        return "Сортировка"
    if CITY_RE.search(text_all) or DISTRICT_RE.search(text_all):
        return "Караганда"
    return "Казахстан"


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

AI_PROMPT = """Ты редактор городского портала «Сортировка 24» (Караганда, Казахстан). Раздел называется просто «Новости».
Ниже свежие новости из разных источников. Выбери не больше {limit} самых интересных и полезных для жителей Караганды. Нужна живая разнообразная лента: в первую очередь Караганда и район Сортировка (город, ЖКХ, отключения, дороги, транспорт, стройки, события, решения акимата, важные происшествия), а также главные новости Казахстана (законы и решения, которые касаются людей, деньги и цены, спорт, заметные события). Разные темы, не две новости про одно и то же.
Не бери: рекламу, слухи, скандалы о частных лицах, жестокие подробности, мелкую политическую борьбу.
Для каждой выбранной напиши своими словами информативную заметку на русском (4–6 предложений): что произошло, где, когда, и что это значит для людей — если это есть в тексте. Нейтрально, только по фактам из текста ниже, ничего не придумывай, не копируй фразы дословно. Заголовок до 100 символов, понятный без контекста.
Категория — одна из: {categories}.
Ещё дай image_prompt — 1–2 предложения на английском, мирная сцена-иллюстрация к теме (обстановка, предметы, городской пейзаж Караганды/Казахстана), без текста, без реальных узнаваемых людей, без крови и аварий крупным планом.
Ответь только JSON-массивом без пояснений: [{{"index": номер, "title": "...", "text": "...", "category": "...", "image_prompt": "..."}}]. Если ничего подходящего нет — [].

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
        f"{i}. [{c['source']}] {c['title']}\n   {short_lead(c.get('text') or c.get('summary') or '', 1200)}"
        for i, c in enumerate(candidates)
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
                       "draft_text": body, "category": category,
                       "image_prompt": clean_text(str(pick.get("image_prompt") or ""))[:600]})
        if len(drafts) >= limit:
            break
    return drafts


def plain_select(candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Without AI: a short quote of the article's opening, clearly attributed to the source."""
    drafts = []
    for c in candidates[:limit]:
        lead = short_lead(c.get("text") or c.get("summary") or "", 600)
        if len(lead) < 60 or title_key(lead) == title_key(c["title"]):
            lead = "Подробности — по ссылке на источник ниже."
        else:
            lead = f"По сообщению {c['source'] or 'источника'}: {lead}"
        drafts.append({**c, "draft_title": c["title"][:160], "draft_text": lead,
                       "category": guess_category(f"{c['title']} {c.get('text') or c.get('summary', '')}")})
    return drafts


# ── article text and pictures ───────────────────────────────────────────────

COVER_SLUGS = {"Происшествия": "proisshestviya", "События района": "sobytiya", "ЖКХ": "zhkh", "Дороги": "dorogi",
               "Инфраструктура": "infra", "Объявления": "obyavleniya", "Важная информация": "vazhno",
               "Сортировка": "sobytiya", "Караганда": "sobytiya", "Общество": "sobytiya"}


def cover_for(category: str, url: str) -> str:
    """Our own cover per category (two variants, picked by the article URL)."""
    variant = 1 + int(url_id(url), 16) % 2
    # Absolute URL: the mobile app bundles an older copy of the site, so a relative path would break there.
    return f"{SITE}/news-covers/{COVER_SLUGS.get(category, 'sobytiya')}-{variant}.jpg"


async def enrich(client: httpx.AsyncClient, candidates: list[dict[str, Any]], top: int = 10) -> list[dict[str, Any]]:
    """Open the best candidates' pages for real text; drop items with nothing to tell."""
    from services import news_article

    gate = asyncio.Semaphore(4)

    async def one(c: dict[str, Any]) -> None:
        async with gate:
            info = await news_article.fetch(client, c["url"])
        if not info:
            return
        c["article_url"] = info.get("url") or c["url"]
        c["text"] = " ".join(info.get("paragraphs") or []) or info.get("description") or ""
        if info.get("image") and news_article.is_government(c["article_url"]):
            c["image"] = info["image"]  # government press photos may be reused with attribution

    head = candidates[:top]
    await asyncio.gather(*(one(c) for c in head))
    useful = [c for c in head if len(c.get("text") or "") >= 200 or len(c.get("summary") or "") >= 100
              or c.get("score", 0) >= 100]
    return useful


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
            + (f"Источник: <a href=\"{e(url, quote=True)}\">{e(source or 'открыть')}</a>\n" if url else "Ваша новость\n")
            + f"Раздел: {e(news.category or '')}")


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


def channel_post_text(news: News) -> str:
    e = html.escape
    body = " ".join(x for x in (news.short_description, _body(news.content or "")) if x)
    if len(body) > 700:
        body = short_lead(body, 700)
    return f"<b>{e(news.title or '')}</b>\n\n{e(body)}\n\n👉 <a href=\"{SITE}/news/{news.id}\">Читать на «Сортировка 24»</a>"


async def post_to_channel(db: AsyncSession, client: httpx.AsyncClient, news: News) -> Optional[str]:
    """Post a published news item to the bound public Telegram channel. Returns its title or None."""
    _, state = await load_state(db)
    await db.commit()
    channel = state.get("channel") or {}
    if not channel.get("id") or channel.get("type") != "channel":
        return None
    await tg(client, "sendMessage", {"chat_id": channel["id"], "text": channel_post_text(news), "parse_mode": "HTML"})
    return channel.get("title") or "канал"


# The owner's working group: approvals go into its topics instead of the private chat.
TOPICS = {"news": "📰 Новости на согласование", "leads": "🤝 Заявки партнёров"}


async def destination(db: AsyncSession, kind: str) -> dict[str, Any]:
    """sendMessage target for approvals of `kind` ("news" or "leads")."""
    _, state = await load_state(db)
    await db.commit()
    ws = state.get("workspace") or {}
    if ws.get("id"):
        target: dict[str, Any] = {"chat_id": ws["id"]}
        thread = (ws.get("topics") or {}).get(kind)
        if thread:
            target["message_thread_id"] = thread
        return target
    return {"chat_id": approval_chat()}


async def ensure_topics(db: AsyncSession, client: httpx.AsyncClient) -> Optional[str]:
    """Create missing topics in a forum workspace. Returns an error text for the owner, or None."""
    row, state = await load_state(db)
    ws = state.get("workspace") or {}
    if not ws.get("id") or not ws.get("forum"):
        await db.commit()
        return None
    topics = ws.setdefault("topics", {})
    problem = None
    for kind, name in TOPICS.items():
        if topics.get(kind):
            continue
        try:
            data = await tg(client, "createForumTopic", {"chat_id": ws["id"], "name": name})
            topics[kind] = data["result"]["message_thread_id"]
        except Exception as exc:
            problem = f"Не получилось создать тему «{name}»: дайте мне право «Управление темами». ({exc})"
            break
    state["workspace"] = ws
    save_state(row, state)
    await db.commit()
    return problem


async def bind_channel(db: AsyncSession, client: httpx.AsyncClient, member: dict[str, Any]) -> None:
    """The owner added the bot somewhere:
    a channel → approved news are also posted there;
    a group → it becomes the working group (approvals arrive in its topics)."""
    chat = member.get("chat") or {}
    actor = str((member.get("from") or {}).get("id", ""))
    status = (member.get("new_chat_member") or {}).get("status")
    kind = chat.get("type")
    if kind not in ("channel", "group", "supergroup") or actor != approval_chat():
        return
    row, state = await load_state(db)
    title = chat.get("title") or "чат"
    key = "channel" if kind == "channel" else "workspace"
    if (state.get("channel") or {}).get("id") == chat.get("id") and key == "workspace":
        state.pop("channel", None)  # an older version stored the group as the channel
    active = status in ("administrator", "creator") or (status == "member" and kind != "channel")
    if active:
        current = state.get(key) or {}
        entry = {"id": chat.get("id"), "title": title, "type": kind, "forum": bool(chat.get("is_forum"))}
        if current.get("id") == chat.get("id"):
            entry["topics"] = current.get("topics") or {}
        state[key] = entry
        text = (f"Канал «{title}» подключён: одобренные новости будут выходить и там." if key == "channel" else
                f"Группа «{title}» подключена: новости на согласование и заявки партнёров будут приходить туда.")
    else:
        if (state.get(key) or {}).get("id") == chat.get("id"):
            state.pop(key, None)
        text = (f"Меня убрали из «{title}»." if status in ("left", "kicked") else
                f"В «{title}» сделайте меня администратором, чтобы я мог публиковать.")
    save_state(row, state)
    await db.commit()
    if active and key == "workspace":
        problem = await ensure_topics(db, client)
        if problem:
            text += "\n" + problem
        elif state[key].get("forum"):
            text += " Темы «Новости» и «Заявки партнёров» готовы."
        else:
            text += " Совет: включите в группе «Темы», и я разложу новости и заявки по отдельным темам."
    await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": text})


_ADMIN_CACHE: dict[tuple[str, str], tuple[float, bool]] = {}


async def may_decide(client: httpx.AsyncClient, db: AsyncSession, chat_id: str, sender: str) -> bool:
    """Owner (and NEWS_TELEGRAM_ADMIN_IDS) anywhere we post; in the working group also its admins."""
    if not approval_chat():
        return False
    trusted = admin_ids() | {approval_chat()}
    if chat_id == approval_chat():
        return sender in trusted
    _, state = await load_state(db)
    await db.commit()
    if str((state.get("workspace") or {}).get("id", "")) != chat_id:
        return False
    if sender in trusted:
        return True
    import time
    cached = _ADMIN_CACHE.get((chat_id, sender))
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    try:
        data = await tg(client, "getChatMember", {"chat_id": chat_id, "user_id": int(sender)})
        ok = data["result"].get("status") in ("creator", "administrator")
    except Exception:
        ok = False
    _ADMIN_CACHE[(chat_id, sender)] = (time.monotonic(), ok)
    return ok


async def handle_update(db: AsyncSession, client: httpx.AsyncClient, update: dict[str, Any]) -> None:
    if isinstance(update.get("my_chat_member"), dict):
        await bind_channel(db, client, update["my_chat_member"])
        return
    message = update.get("message")
    if isinstance(message, dict):
        chat = message.get("chat") or {}
        from services import telegram_login
        if await telegram_login.handle_message(db, client, message):
            return
        sender_id = str((message.get("from") or {}).get("id", ""))
        if chat.get("type") == "private" and str(message.get("text") or "").strip() == "/start" \
                and sender_id != approval_chat() and sender_id not in admin_ids():
            # A customer who opened the bot without the login link.
            await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text": telegram_login.ASK_TEXT,
                     "reply_markup": telegram_login.contact_keyboard()})
            return
        if chat.get("type") == "private" and str(message.get("text") or "").strip().split("@")[0] in ("/start", "/id"):
            await tg(client, "sendMessage", {"chat_id": chat.get("id"), "text":
                     f"Бот «Сортировка 24»: новости и заявки партнёров.\nНомер этого чата: {chat.get('id')}\n\n"
                     "Чтобы опубликовать свою новость, пришлите сюда текст (первая строка — заголовок) "
                     "и, если хотите, фото с подписью."})
            return
        if not (message.get("photo") or message.get("text") or message.get("caption")):
            return
        chat_id = str(chat.get("id", ""))
        sender = str((message.get("from") or {}).get("id", ""))
        if not await may_decide(client, db, chat_id, sender):
            return
        reply = message.get("reply_to_message") or {}
        # In a forum topic every message "replies" to the topic's first message; that is not a real reply.
        real_reply = bool(reply) and not reply.get("forum_topic_created") and \
            reply.get("message_id") != message.get("message_thread_id")
        answer = None
        try:
            if real_reply:
                if message.get("photo"):
                    answer = await attach_photo(db, client, message)
            elif await is_own_post_place(db, message):
                answer = await create_own_news(db, client, message)
        except Exception as exc:
            await db.rollback()
            logger.warning("[NewsAgent] owner message failed: %s", exc)
            answer = "Не получилось обработать сообщение, попробуйте ещё раз."
        if answer:
            await tg(client, "sendMessage", {"chat_id": chat_id, "text": answer,
                     "reply_to_message_id": message.get("message_id"),
                     **({"message_thread_id": message["message_thread_id"]} if message.get("message_thread_id") else {})})
        return
    callback = update.get("callback_query")
    if not isinstance(callback, dict):
        return
    data = str(callback.get("data") or "")
    callback_id = str(callback.get("id") or "")
    msg = callback.get("message") if isinstance(callback.get("message"), dict) else {}
    chat_id = str((msg.get("chat") or {}).get("id", ""))
    sender = str((callback.get("from") or {}).get("id", ""))
    allowed = await may_decide(client, db, chat_id, sender)
    news_match = re.fullmatch(r"nw:([pr]):(\d+)", data)
    lead_match = re.fullmatch(r"pl:([wndr]):(\d+)", data)
    if not allowed or not (news_match or lead_match):
        await tg(client, "answerCallbackQuery", {"callback_query_id": callback_id,
                 "text": "Нет доступа" if not allowed else "Готово"})
        return
    if lead_match:
        from services import partner_agent
        answer = await partner_agent.handle_callback(db, client, lead_match.group(1), int(lead_match.group(2)),
                                                     chat_id, msg.get("message_id"))
        await tg(client, "answerCallbackQuery", {"callback_query_id": callback_id, "text": answer})
        return
    answer, news = await decide(db, int(news_match.group(2)), news_match.group(1) == "p")
    if news and answer == "Опубликовано на сайте":
        try:
            where = await post_to_channel(db, client, news)
            if where:
                answer = f"Опубликовано на сайте и в «{where}»"
        except Exception as exc:
            logger.warning("[NewsAgent] channel post failed: %s", exc)
            answer = "Опубликовано на сайте (в канал не получилось)"
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
    return now - last >= timedelta(minutes=max(30, _int("NEWS_AGENT_INTERVAL_MINUTES", 90)))


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
    max_age = timedelta(hours=_int("NEWS_AGENT_MAX_AGE_HOURS", 24))
    per_run, daily_max = _int("NEWS_AGENT_PER_RUN", 3), _int("NEWS_AGENT_DAILY_MAX", 14)

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
        readable = await enrich(client, candidates)
        chosen = await ai_select(client, readable, limit) if readable else []
        if chosen is None:
            chosen = plain_select(readable, limit)

    # Remember every candidate that was looked at, so nothing is proposed twice, chosen or not.
    examined = candidates[:10] if limit else []
    state.setdefault("urls", []).extend(url_id(c["url"]) for c in examined)
    state.setdefault("keys", []).extend(c["title_key"] for c in examined)
    drafts = []
    from services.news_cover import make_cover
    for c in chosen:
        lead, text_body = split_lead(c["draft_text"])
        link = c.get("article_url") or c["url"]
        # Own picture for every item: AI illustration (if configured) or a branded headline cover.
        image = c.get("image") or await make_cover(client, title=c["draft_title"], category=c["category"],
                                                   link=link, image_prompt=c.get("image_prompt", "")) \
            or cover_for(c["category"], link)
        news = News(title=c["draft_title"], short_description=lead,
                    content=f"{text_body}\n\nИсточник: {c['source'] or 'оригинал'} — {link}",
                    category=c["category"], image_url=image,
                    published=False, status=PENDING, created_at=_now_iso())
        db.add(news)
        drafts.append((news, c))
    state["sent_day"], state["sent_count"] = today, sent_today + len(drafts)
    save_state(row, state)
    await db.commit()

    for news, c in drafts:
        try:
            message_id = await send_approval(client, db, news, c["source"], c.get("article_url") or c["url"])
            await remember_message(db, message_id, news.id)
            report["sent"] += 1
        except Exception as exc:
            # The draft stays on the site under «Черновики»; the owner can publish it there.
            logger.warning("[NewsAgent] Telegram send failed: %s", exc)
            report["error"] = f"Telegram: {exc}"[:500]


async def send_approval(client: httpx.AsyncClient, db: AsyncSession, news: News, source: str, url: str) -> int:
    """Approval card with the picture; falls back to plain text if Telegram can't fetch the photo."""
    target = await destination(db, "news")
    text = approval_text(news, source, url)
    photo = news.image_url or ""
    if photo.startswith("/"):
        photo = SITE + photo
    if photo.startswith("http"):
        caption = text if len(text) <= 1000 else text[:990].rsplit(" ", 1)[0] + "…"
        try:
            data = await tg(client, "sendPhoto", {**target, "photo": photo, "caption": caption, "parse_mode": "HTML",
                                                  "reply_markup": approval_keyboard(news.id)})
            return int(data["result"]["message_id"])
        except Exception as exc:
            logger.info("[NewsAgent] photo card failed, sending text: %s", exc)
    data = await tg(client, "sendMessage", {**target, "text": text, "parse_mode": "HTML",
                                            "disable_web_page_preview": True, "reply_markup": approval_keyboard(news.id)})
    return int(data["result"]["message_id"])


async def remember_message(db: AsyncSession, message_id: int, news_id: int) -> None:
    row, state = await load_state(db)
    msgs = state.setdefault("msgs", {})
    msgs[str(message_id)] = news_id
    if len(msgs) > 300:
        for key in sorted(msgs, key=int)[:-300]:
            msgs.pop(key, None)
    save_state(row, state)
    await db.commit()


async def upload_telegram_photo(client: httpx.AsyncClient, photos: list[dict[str, Any]]) -> str:
    """Download the biggest size of a Telegram photo and store it like admin uploads. Returns the object key."""
    best = max(photos, key=lambda p: p.get("file_size") or p.get("width", 0))
    info = await tg(client, "getFile", {"file_id": best["file_id"]})
    resp = await client.get(f"https://api.telegram.org/file/bot{bot_token()}/{info['result']['file_path']}", timeout=60)
    resp.raise_for_status()
    from uuid import uuid4
    from services.storage import StorageService, _build_image_keys
    storage = StorageService()
    image_key, thumb_key = _build_image_keys(f"news/{uuid4().hex}.jpg")
    token = storage._make_upload_token("portal-images", image_key, thumbnail_key=thumb_key, is_image=True)
    saved = await storage.upload_via_token(token, resp.content, "image/jpeg")
    return saved["object_key"]


def split_own_post(text: str) -> tuple[str, str]:
    """First line → title, the rest → body. A one-paragraph post uses its first sentence as the title."""
    text = text.strip()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if len(lines) >= 2 and len(lines[0]) <= 160:
        return lines[0].rstrip("."), "\n".join(lines[1:])
    parts = re.split(r"(?<=[.!?…])\s+", text, maxsplit=1)
    if len(parts) == 2 and len(parts[0]) <= 160:
        return parts[0].rstrip("."), parts[1]
    return (text[:100].rsplit(" ", 1)[0] + "…"), text


async def is_own_post_place(db: AsyncSession, message: dict[str, Any]) -> bool:
    """Owner's own news go in the private chat with the bot or in the news topic of the working group."""
    chat = message.get("chat") or {}
    if chat.get("type") == "private":
        return True
    _, state = await load_state(db)
    await db.commit()
    ws = state.get("workspace") or {}
    if str(ws.get("id", "")) != str(chat.get("id", "")):
        return False
    news_topic = (ws.get("topics") or {}).get("news")
    return not news_topic or message.get("message_thread_id") == news_topic


async def create_own_news(db: AsyncSession, client: httpx.AsyncClient, message: dict[str, Any]) -> Optional[str]:
    """The owner wrote a news item (text, optionally with a photo) → draft + approval card."""
    text = (message.get("caption") or message.get("text") or "").strip()
    if text.startswith("/") or len(text) < 20:
        return ("Чтобы сделать новость, напишите текст: первая строка — заголовок, дальше — сама новость. "
                "Можно приложить фото.") if message.get("photo") else None
    title, body = split_own_post(text)
    category = guess_category(text)
    image = await upload_telegram_photo(client, message["photo"]) if message.get("photo") else None
    lead, rest = split_lead(body)
    news = News(title=title[:160], short_description=lead, content=rest, category=category,
                image_url=image or cover_for(category, f"own:{message.get('message_id')}:{title}"),
                published=False, status=PENDING, created_at=_now_iso())
    db.add(news)
    await db.commit()
    message_id = await send_approval(client, db, news, "", "")
    await remember_message(db, message_id, news.id)
    return None


async def attach_photo(db: AsyncSession, client: httpx.AsyncClient, message: dict[str, Any]) -> Optional[str]:
    """The owner replied to an approval card with a photo → it becomes the news picture."""
    reply = message.get("reply_to_message") or {}
    photos = message.get("photo") or []
    if not photos or not reply:
        return None
    _, state = await load_state(db)
    await db.commit()
    news_id = (state.get("msgs") or {}).get(str(reply.get("message_id")))
    if not news_id:
        return None
    news = await db.get(News, int(news_id))
    if not news:
        return "Эта новость уже удалена."
    news.image_url = await upload_telegram_photo(client, photos)
    await db.commit()
    return f"📷 Фото добавлено к новости «{news.title}»." + (" Она уже на сайте." if news.published else "")


# ── background loop ─────────────────────────────────────────────────────────

async def _collect_once(session_maker, client: httpx.AsyncClient) -> None:
    try:
        async with session_maker() as db:
            report = await collect(db, client)
            if report:
                logger.info("[NewsAgent] run: %s", report)
    except Exception as exc:
        logger.warning("[NewsAgent] collect failed: %s", exc)


async def run_forever(session_maker) -> None:
    """One bot, one loop: news collection, partner leads, and the owner's button taps."""
    from core.deploy_safety import external_side_effects_allowed
    from services import partner_agent

    await asyncio.sleep(20)
    offset: Optional[int] = None
    next_reminder = 0.0
    collecting: Optional[asyncio.Task] = None
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        while True:
            try:
                if not bot_token() or not approval_chat() or not external_side_effects_allowed():
                    await asyncio.sleep(300)
                    continue
                if enabled() and (collecting is None or collecting.done()):
                    # Collection reads many sites; it runs aside so login codes and taps stay instant.
                    collecting = asyncio.create_task(_collect_once(session_maker, client))
                async with session_maker() as db:
                    if partner_agent.enabled():
                        try:
                            await partner_agent.process_new(db, client)
                            if asyncio.get_running_loop().time() >= next_reminder:
                                next_reminder = asyncio.get_running_loop().time() + 600
                                await partner_agent.remind(db, client)
                        except Exception as exc:
                            await db.rollback()
                            logger.warning("[PartnerAgent] pass failed: %s", exc)
                    params: dict[str, Any] = {"timeout": 25,
                                              "allowed_updates": ["callback_query", "message", "my_chat_member"]}
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
