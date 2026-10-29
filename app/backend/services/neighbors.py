"""«Мой дом» — neighbours of one building (or one street for private houses) on Сортировка 24.

A resident sets the address (street from the Sortirovka list, house, entrance; the flat number stays private)
and at once sees the neighbours and the house feed (open access, owner's decision 2026-10-29).
Protection without paperwork: one address per account, at most MAX_MOVES different houses in 30 days (no walking
from house to house to read who lives where), and «Это не мой сосед» — three marks from different neighbours
(or one from the elder) hide the person from the house and tell the owner, who can restore them in the admin.
The receipt / neighbour-confirmation code stays for a possible stricter mode later.

The house feed is not a chat: posts (авария / вопрос / объявление / потеряно-найдено) with comments and «У меня тоже».
Three reports from different neighbours hide a post or comment and tell the owner. Tables are created on first use.
"""
from __future__ import annotations

import asyncio
import base64
import html
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import text

logger = logging.getLogger(__name__)
KZ = timezone(timedelta(hours=5))
SITE = os.getenv("PUBLIC_SITE_URL", "https://www.sortirovka24.kz").rstrip("/")
CALLBACK_RE = re.compile(r"^nb:(a|r):(\d+)$")
KINDS = ("alarm", "question", "notice", "lost")
KIND_TITLES = {"alarm": "⚡ Авария", "question": "❓ Вопрос", "notice": "📢 Объявление", "lost": "🔍 Потеряно / найдено"}
HIDE_AFTER_REPORTS = 3
MAX_MOVES = 3
FEED_DAYS = 60
PAGE = 20
POSTS_PER_HOUR = 8
COMMENTS_PER_HOUR = 40
MAX_PROOF_BYTES = 1_500_000

# Streets of Sortirovka (from the police precinct lists) with the spellings people actually type.
STREETS: dict[str, tuple[str, ...]] = {
    "Жекибаева": ("жекибаев", "жекебаев", "жкб"),
    "Локомотивная": ("локомотивн",),
    "Маншук Маметовой": ("маметов",),
    "Победы": ("победы", "победа"),
    "Дружбы": ("дружбы", "дружба"),
    "Серова": ("серов",),
    "П. Морозова": ("морозов",),
    "Сочинская": ("сочинск",),
    "Карпатская": ("карпатск",),
    "Мануильского": ("мануильск",),
    "Гайдара": ("гайдар",),
    "Бородина": ("бородин",),
    "Тобольская": ("тобольск",),
    "Молдагулова": ("молдагулов",),
    "Успенского": ("успенск",),
    "Юная": ("юная",),
    "Р. Кошкарбаева": ("кошкарбаев",),
    "Макаренко": ("макаренко",),
    "Лермонтова": ("лермонтов",),
    "Мозаичная": ("мозаичн", "мозоичн"),
    "Рабочая": ("рабоч",),
    "Молдавская": ("молдавск",),
    "Огарёва": ("огарев", "огарёв", "огорев"),
    "Деповская": ("деповск",),
    "Саялы": ("саялы",),
    "Днепровская": ("днепровск",),
    "Вагонное депо": ("вагонное депо",),
    "Достоевского": ("достоевск",),
    "Вишнёвый пер.": ("вишнев", "вишнёв"),
    "Первомайский пер.": ("первомайск",),
    "Булавина": ("булавин",),
    "Почтовая": ("почтов",),
    "Интернациональная": ("интернациональн",),
    "Герцена": ("герцен",),
    "Набережная": ("набережн",),
    "Театральная": ("театральн",),
    "Артельная": ("артельн",),
    "Больничная": ("больничн",),
    "Заовражная": ("заовражн",),
    "Полярная": ("полярн",),
    "Менделеева": ("менделеев",),
    "Железнодорожная": ("железнодорожн",),
    "Зелёный Лог": ("зеленый лог", "зелёный лог"),
    "Златоустская": ("златоус",),
    "Цементная": ("цементн",),
    "Таймырская": ("таймырск",),
    "Жанаульская": ("жанаульск",),
    "Байкальская": ("байкальск",),
    "Магистральная": ("магистральн",),
    "Темиртауская": ("темиртауск",),
}
HOUSE_RE = re.compile(r"^\d{1,4}[А-ЯA-Z]?(/\d{1,3}[А-ЯA-Z]?)?$")

_ready: set[int] = set()


def now() -> datetime:
    return datetime.now(KZ)


def now_iso() -> str:
    return now().isoformat(timespec="milliseconds")


# ---------------- tables ----------------
async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    try:
        await _create_tables(db)
    except Exception:
        await db.rollback()  # two first requests at once: the other one created the tables
        await _create_tables(db)
    _ready.add(key)


async def _create_tables(db) -> None:
    dialect = getattr(getattr(db, "bind", None), "dialect", None)
    pk = "SERIAL PRIMARY KEY" if getattr(dialect, "name", "") == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"
    stmts = [
        f"CREATE TABLE IF NOT EXISTS nb_members (id {pk}, user_id VARCHAR(64) NOT NULL, building VARCHAR(160) NOT NULL, "
        "street VARCHAR(80), house VARCHAR(16), kind VARCHAR(8), entrance INTEGER, flat VARCHAR(12), "
        "display_name VARCHAR(40), anonymous INTEGER DEFAULT 0, custom_street INTEGER DEFAULT 0, status VARCHAR(12), "
        "role VARCHAR(12) DEFAULT 'member', proof TEXT, proof_at VARCHAR(32), consent_at VARCHAR(32), "
        "created_at VARCHAR(32), updated_at VARCHAR(32), confirmed_at VARCHAR(32), seen_at VARCHAR(32))",
        "CREATE UNIQUE INDEX IF NOT EXISTS nb_members_user ON nb_members (user_id)",
        "CREATE INDEX IF NOT EXISTS nb_members_building ON nb_members (building, status)",
        "CREATE TABLE IF NOT EXISTS nb_confirms (member_id INTEGER NOT NULL, by_user VARCHAR(64) NOT NULL, created_at VARCHAR(32))",
        "CREATE UNIQUE INDEX IF NOT EXISTS nb_confirms_once ON nb_confirms (member_id, by_user)",
        f"CREATE TABLE IF NOT EXISTS nb_posts (id {pk}, building VARCHAR(160) NOT NULL, user_id VARCHAR(64) NOT NULL, "
        "kind VARCHAR(12), entrance INTEGER, body TEXT, status VARCHAR(12) DEFAULT 'active', pinned INTEGER DEFAULT 0, "
        "reports INTEGER DEFAULT 0, me_too INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, "
        "created_at VARCHAR(32), last_activity VARCHAR(32))",
        "CREATE INDEX IF NOT EXISTS nb_posts_feed ON nb_posts (building, status, last_activity)",
        "CREATE INDEX IF NOT EXISTS nb_posts_user ON nb_posts (user_id, created_at)",
        f"CREATE TABLE IF NOT EXISTS nb_comments (id {pk}, post_id INTEGER NOT NULL, user_id VARCHAR(64) NOT NULL, "
        "body TEXT, status VARCHAR(12) DEFAULT 'active', reports INTEGER DEFAULT 0, created_at VARCHAR(32))",
        "CREATE INDEX IF NOT EXISTS nb_comments_post ON nb_comments (post_id, id)",
        "CREATE INDEX IF NOT EXISTS nb_comments_user ON nb_comments (user_id, created_at)",
        "CREATE TABLE IF NOT EXISTS nb_metoo (post_id INTEGER NOT NULL, user_id VARCHAR(64) NOT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS nb_metoo_once ON nb_metoo (post_id, user_id)",
        "CREATE TABLE IF NOT EXISTS nb_reports (target VARCHAR(4) NOT NULL, target_id INTEGER NOT NULL, user_id VARCHAR(64) NOT NULL, "
        "created_at VARCHAR(32))",
        "CREATE UNIQUE INDEX IF NOT EXISTS nb_reports_once ON nb_reports (target, target_id, user_id)",
        "CREATE TABLE IF NOT EXISTS nb_moves (user_id VARCHAR(64) NOT NULL, building VARCHAR(160) NOT NULL, created_at VARCHAR(32))",
        "CREATE INDEX IF NOT EXISTS nb_moves_user ON nb_moves (user_id, created_at)",
        # Open access: everyone who already waited for confirmation becomes a full member.
        "UPDATE nb_members SET status = 'confirmed' WHERE status = 'pending'",
    ]
    for stmt in stmts:
        await db.execute(text(stmt))
    await db.commit()


# ---------------- address ----------------
def canon_street(raw: str) -> tuple[str, bool]:
    """Returns (street, is_custom). Known streets get one spelling so neighbours always meet in one house."""
    value = re.sub(r"\s+", " ", str(raw or "")).strip()
    low = value.lower().replace("ё", "е")
    low = re.sub(r"^(ул(ица)?|пер(еулок)?|мкр)\.?\s*", "", low)
    for name, keys in STREETS.items():
        if name.lower().replace("ё", "е") == low or any(k.replace("ё", "е") in low for k in keys):
            return name, False
    clean = re.sub(r"[^\w .\-ёЁ]", "", value)[:60].strip(" .-")
    if len(clean) < 3:
        raise ValueError("Выберите улицу из списка")
    return clean[:1].upper() + clean[1:], True


def canon_house(raw: str) -> str:
    value = str(raw or "").upper().replace(" ", "").replace("«", "").replace("»", "").replace('"', "").replace("\\", "/")
    value = value.replace("Д.", "").replace("ДОМ", "")
    if not HOUSE_RE.match(value):
        raise ValueError("Номер дома: например 135, 133/1 или 139А")
    return value


def building_key(street: str, house: str, kind: str) -> str:
    return f"{street.lower()}|{house if kind == 'flat' else '*'}"


def building_title(m: dict) -> str:
    return f"ул. {m['street']}, {m['house']}" if m["kind"] == "flat" else f"ул. {m['street']}"


def clean_address(raw: dict, account_name: str = "") -> dict:
    kind = "private" if raw.get("kind") == "private" else "flat"
    street, custom = canon_street(raw.get("street", ""))
    house = canon_house(raw.get("house", ""))
    entrance = None
    if kind == "flat":
        try:
            entrance = int(str(raw.get("entrance") or "").strip())
        except ValueError:
            entrance = None
        if not entrance or not 1 <= entrance <= 30:
            raise ValueError("Укажите номер подъезда")
    flat = re.sub(r"[^\dА-Яа-яA-Za-z/]", "", str(raw.get("flat") or ""))[:8]
    name = re.sub(r"\s+", " ", str(raw.get("display_name") or "")).strip()[:30]
    if not name:
        name = (account_name or "").split(" ")[0][:30]
    if len(name) < 2:
        raise ValueError("Напишите, как вас называть")
    if not raw.get("consent"):
        raise ValueError("Нужно согласие на показ имени и подъезда соседям по дому")
    return {"kind": kind, "street": street, "custom_street": 1 if custom else 0, "house": house, "entrance": entrance,
            "flat": flat, "display_name": name, "anonymous": 1 if raw.get("anonymous") else 0,
            "building": building_key(street, house, kind)}


def public_name(m: dict) -> str:
    if m.get("anonymous"):
        return f"Сосед из {m['entrance']} подъезда" if m.get("entrance") else "Сосед с улицы"
    return m.get("display_name") or "Сосед"


# ---------------- members ----------------
def _row(r) -> dict:
    return dict(r._mapping)


async def member_of(db, user_id: str) -> Optional[dict]:
    await ensure_tables(db)
    r = (await db.execute(text("SELECT * FROM nb_members WHERE user_id = :u"), {"u": str(user_id)})).first()
    return _row(r) if r else None


async def member_by_id(db, member_id: int) -> Optional[dict]:
    await ensure_tables(db)
    r = (await db.execute(text("SELECT * FROM nb_members WHERE id = :i"), {"i": member_id})).first()
    return _row(r) if r else None


async def confirmed_count(db, building: str) -> int:
    return int((await db.execute(text(
        "SELECT COUNT(*) FROM nb_members WHERE building = :b AND status = 'confirmed'"), {"b": building})).scalar() or 0)


async def save_address(db, user_id: str, data: dict) -> dict:
    """Creates or changes the address; the person is a full member of the house at once."""
    await ensure_tables(db)
    old = await member_of(db, user_id)
    if old and old["status"] == "blocked":
        raise PermissionError("Соседи отметили, что вы не живёте в этом доме. Напишите в поддержку — разберёмся")
    stamp = now_iso()
    same_house = bool(old and old["building"] == data["building"])
    if not same_house:
        since = (now() - timedelta(days=30)).isoformat(timespec="seconds")
        moves = {r[0] for r in (await db.execute(text(
            "SELECT DISTINCT building FROM nb_moves WHERE user_id = :u AND created_at >= :s"), {"u": str(user_id), "s": since})).all()}
        if data["building"] not in moves and len(moves) >= MAX_MOVES:
            raise PermissionError("Адрес можно менять не чаще 3 раз в месяц. Если ошиблись — напишите в поддержку")
        await db.execute(text("INSERT INTO nb_moves (user_id, building, created_at) VALUES (:u, :b, :t)"),
                         {"u": str(user_id), "b": data["building"], "t": stamp})
    params = {**data, "u": str(user_id), "t": stamp}
    if old:
        await db.execute(text(
            "UPDATE nb_members SET building = :building, street = :street, house = :house, kind = :kind, entrance = :entrance, "
            "flat = :flat, display_name = :display_name, anonymous = :anonymous, custom_street = :custom_street, "
            "status = 'confirmed', updated_at = :t, consent_at = :t" + ("" if same_house else ", role = 'member', confirmed_at = :t")
            + " WHERE user_id = :u"), params)
        if not same_house:
            await db.execute(text("DELETE FROM nb_reports WHERE target = 'memb' AND target_id = :m"), {"m": old["id"]})
    else:
        await db.execute(text(
            "INSERT INTO nb_members (user_id, building, street, house, kind, entrance, flat, display_name, anonymous, custom_street, "
            "status, role, consent_at, created_at, updated_at, confirmed_at, seen_at) VALUES (:u, :building, :street, :house, :kind, "
            ":entrance, :flat, :display_name, :anonymous, :custom_street, 'confirmed', 'member', :t, :t, :t, :t, :t)"), params)
    await db.commit()
    return await member_of(db, user_id)


async def report_member(db, voter: dict, member_id: int) -> dict:
    """«Это не мой сосед»: 3 marks from different neighbours (or the elder's one) hide the person from the house."""
    target = await member_by_id(db, member_id)
    if not target or target["building"] != voter["building"] or target["status"] != "confirmed":
        raise LookupError("Сосед не найден")
    if target["user_id"] == voter["user_id"]:
        raise PermissionError("Себя отметить нельзя")
    exists = (await db.execute(text("SELECT 1 FROM nb_reports WHERE target = 'memb' AND target_id = :i AND user_id = :u"),
                               {"i": member_id, "u": voter["user_id"]})).first()
    if not exists:
        await db.execute(text("INSERT INTO nb_reports (target, target_id, user_id, created_at) VALUES ('memb', :i, :u, :c)"),
                         {"i": member_id, "u": voter["user_id"], "c": now_iso()})
    marks = int((await db.execute(text("SELECT COUNT(*) FROM nb_reports WHERE target = 'memb' AND target_id = :i"),
                                  {"i": member_id})).scalar() or 0)
    blocked = marks >= HIDE_AFTER_REPORTS or voter.get("role") == "elder"
    if blocked:
        await db.execute(text("UPDATE nb_members SET status = 'blocked', updated_at = :t WHERE id = :i"), {"t": now_iso(), "i": member_id})
    await db.commit()
    if blocked:
        _spawn(_tell_owner(f"🚩 «Мой дом»: жителя №{member_id} ({target['display_name']}, {building_title(target)}) соседи отметили "
                           f"«не живёт здесь» ({marks}). Он скрыт из дома. Вернуть — админка → Объявления → «Мой дом»."))
    return {"blocked": blocked, "marks": marks}


def needed_confirms(confirmed_in_house: int) -> int:
    return 0 if confirmed_in_house == 0 else min(2, confirmed_in_house)


async def confirm_state(db, m: dict) -> dict:
    total = await confirmed_count(db, m["building"])
    got = int((await db.execute(text("SELECT COUNT(*) FROM nb_confirms WHERE member_id = :m"), {"m": m["id"]})).scalar() or 0)
    return {"confirmed_in_house": total, "needed": needed_confirms(total), "got": got,
            "proof_sent": bool(m.get("proof_at")), "proof_waiting": bool(m.get("proof"))}


async def set_confirmed(db, member_id: int) -> Optional[dict]:
    stamp = now_iso()
    await db.execute(text("UPDATE nb_members SET status = 'confirmed', confirmed_at = :t, updated_at = :t, proof = NULL "
                          "WHERE id = :i"), {"t": stamp, "i": member_id})
    await db.commit()
    m = await member_by_id(db, member_id)
    if m:
        await _cabinet(db, m["user_id"], f"nb:ok:{member_id}:{stamp[:10]}", "Вы подтверждены как житель",
                       f"Теперь вы видите соседей и можете писать в «Мой дом» — {building_title(m)}.")
    return m


async def confirm_neighbour(db, voter: dict, member_id: int) -> dict:
    target = await member_by_id(db, member_id)
    if not target or target["building"] != voter["building"] or target["status"] != "pending":
        raise LookupError("Этот сосед уже подтверждён или сменил адрес")
    if voter["status"] != "confirmed":
        raise PermissionError("Подтверждать могут только подтверждённые соседи")
    if target["user_id"] == voter["user_id"]:
        raise PermissionError("Себя подтвердить нельзя")
    exists = (await db.execute(text("SELECT 1 FROM nb_confirms WHERE member_id = :m AND by_user = :u"),
                               {"m": member_id, "u": voter["user_id"]})).first()
    if not exists:
        await db.execute(text("INSERT INTO nb_confirms (member_id, by_user, created_at) VALUES (:m, :u, :t)"),
                         {"m": member_id, "u": voter["user_id"], "t": now_iso()})
        await db.commit()
    state = await confirm_state(db, target)
    if voter.get("role") == "elder" or state["got"] >= max(1, state["needed"]):
        await set_confirmed(db, member_id)
        return {"confirmed": True}
    return {"confirmed": False, "got": state["got"], "needed": state["needed"]}


async def leave(db, user_id: str) -> None:
    """Deletes the address and everything the person wrote — «удалить мои данные»."""
    m = await member_of(db, user_id)
    u = {"u": str(user_id)}
    post_ids = [r[0] for r in (await db.execute(text("SELECT id FROM nb_posts WHERE user_id = :u"), u)).all()]
    for pid in post_ids:
        await db.execute(text("DELETE FROM nb_comments WHERE post_id = :p"), {"p": pid})
        await db.execute(text("DELETE FROM nb_metoo WHERE post_id = :p"), {"p": pid})
    await db.execute(text("DELETE FROM nb_posts WHERE user_id = :u"), u)
    commented = [r[0] for r in (await db.execute(text("SELECT DISTINCT post_id FROM nb_comments WHERE user_id = :u"), u)).all()]
    await db.execute(text("DELETE FROM nb_comments WHERE user_id = :u"), u)
    for pid in commented:
        await _recount_comments(db, pid)
    touched = [r[0] for r in (await db.execute(text("SELECT post_id FROM nb_metoo WHERE user_id = :u"), u)).all()]
    await db.execute(text("DELETE FROM nb_metoo WHERE user_id = :u"), u)
    for pid in touched:
        await db.execute(text("UPDATE nb_posts SET me_too = (SELECT COUNT(*) FROM nb_metoo WHERE post_id = :p) WHERE id = :p"), {"p": pid})
    await db.execute(text("DELETE FROM nb_reports WHERE user_id = :u"), u)
    await db.execute(text("DELETE FROM nb_confirms WHERE by_user = :u"), u)
    if m:
        await db.execute(text("DELETE FROM nb_confirms WHERE member_id = :m"), {"m": m["id"]})
    if m and m["status"] == "blocked":
        # The content is gone, but the mark stays — otherwise «delete and come back» would undo the neighbours' decision.
        await db.execute(text("UPDATE nb_members SET display_name = '', anonymous = 1, flat = '' WHERE user_id = :u"), u)
    else:
        await db.execute(text("DELETE FROM nb_members WHERE user_id = :u"), u)
    await db.commit()


async def neighbours(db, m: dict) -> dict:
    rows = (await db.execute(text(
        "SELECT id, user_id, display_name, anonymous, entrance, status, role, confirmed_at FROM nb_members "
        "WHERE building = :b AND status IN ('confirmed', 'pending') ORDER BY entrance, confirmed_at, id"), {"b": m["building"]})).all()
    mine = {r[0] for r in (await db.execute(text(
        "SELECT target_id FROM nb_reports WHERE target = 'memb' AND user_id = :u"), {"u": m["user_id"]})).all()}
    people, waiting = [], []
    for r in rows:
        d = _row(r)
        item = {"id": d["id"], "name": public_name(d), "entrance": d["entrance"], "elder": d["role"] == "elder",
                "me": d["user_id"] == m["user_id"], "since": (d["confirmed_at"] or "")[:10]}
        if d["status"] == "confirmed":
            people.append(item | {"i_reported": d["id"] in mine})
    entrances: dict[str, int] = {}
    for p in people:
        if p["entrance"]:
            entrances[str(p["entrance"])] = entrances.get(str(p["entrance"]), 0) + 1
    return {"people": people, "waiting": waiting, "entrances": entrances, "total": len(people)}


async def district_stats(db) -> dict:
    await ensure_tables(db)
    r = (await db.execute(text(
        "SELECT COUNT(*), COUNT(DISTINCT building) FROM nb_members WHERE status = 'confirmed'"))).first()
    return {"neighbours": int(r[0] or 0), "houses": int(r[1] or 0)}


async def house_preview(db, building: str) -> dict:
    return {"confirmed": await confirmed_count(db, building)}


# ---------------- receipt proof ----------------
def decode_proof(data_url: str) -> bytes:
    match = re.match(r"^data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$", str(data_url or "").strip())
    if not match:
        raise ValueError("Пришлите фото квитанции (JPG или PNG)")
    raw = base64.b64decode(match.group(2), validate=True)
    if len(raw) > MAX_PROOF_BYTES:
        raise ValueError("Фото слишком большое — сделайте снимок поменьше")
    if len(raw) < 2000:
        raise ValueError("Фото не читается — попробуйте ещё раз")
    return raw


async def save_proof(db, m: dict, data_url: str) -> dict:
    raw = decode_proof(data_url)
    stamp = now_iso()
    await db.execute(text("UPDATE nb_members SET proof = :p, proof_at = :t, updated_at = :t WHERE id = :i"),
                     {"p": data_url.strip(), "t": stamp, "i": m["id"]})
    await db.commit()
    m = await member_by_id(db, m["id"])
    _spawn(_send_proof_to_owner(m, raw))
    return m


def proof_caption(m: dict) -> str:
    esc = html.escape
    lines = [f"🏠 <b>Мой дом: проверка жителя №{m['id']}</b>",
             f"{esc(building_title(m))}" + (f", подъезд {m['entrance']}, кв. {esc(m['flat'] or '')}" if m["kind"] == "flat" else f", дом {esc(m['house'])}"),
             f"Имя: {esc(m['display_name'] or '')}" + (" (скрыто от соседей)" if m.get("anonymous") else "")]
    if m.get("custom_street"):
        lines.append("⚠️ Улицы нет в нашем списке — проверьте написание.")
    lines += ["", "Совпадает адрес на квитанции? Фото удалится сразу после решения."]
    return "\n".join(lines)


async def _send_proof_to_owner(m: dict, raw: bytes) -> None:
    from services.news_agent import approval_chat, bot_token
    if not (bot_token() and approval_chat()):
        return
    import json as _json
    markup = {"inline_keyboard": [[{"text": "✅ Подтвердить жителя", "callback_data": f"nb:a:{m['id']}"},
                                   {"text": "❌ Не совпадает", "callback_data": f"nb:r:{m['id']}"}]]}
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            await client.post(f"https://api.telegram.org/bot{bot_token()}/sendPhoto",
                              data={"chat_id": approval_chat(), "caption": proof_caption(m)[:1000], "parse_mode": "HTML",
                                    "reply_markup": _json.dumps(markup)},
                              files={"photo": ("receipt.jpg", raw, "image/jpeg")})
    except Exception as exc:
        logger.warning("[Neighbors] proof to Telegram failed: %s", exc)


async def decide_proof(db, member_id: int, approve: bool) -> tuple[str, Optional[dict]]:
    m = await member_by_id(db, member_id)
    if not m:
        return "Житель удалил адрес", None
    if m["status"] == "confirmed":
        await db.execute(text("UPDATE nb_members SET proof = NULL WHERE id = :i"), {"i": member_id})
        await db.commit()
        return "Уже подтверждён", m
    if approve:
        return "Житель подтверждён", await set_confirmed(db, member_id)
    await db.execute(text("UPDATE nb_members SET proof = NULL, updated_at = :t WHERE id = :i"), {"t": now_iso(), "i": member_id})
    await db.commit()
    await _cabinet(db, m["user_id"], f"nb:no:{member_id}:{now_iso()[:16]}", "Квитанция не подошла",
                   "Адрес на фото не совпал или его не видно. Пришлите другое фото или попросите соседей подтвердить вас.")
    return "Отказано, житель получил уведомление", await member_by_id(db, member_id)


async def handle_callback(db, client: httpx.AsyncClient, data: str, chat_id: Any, message: dict) -> Optional[str]:
    from services.news_agent import tg
    match = CALLBACK_RE.match(data or "")
    if not match:
        return None
    answer, _ = await decide_proof(db, int(match.group(2)), match.group(1) == "a")
    try:
        await tg(client, "editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message.get("message_id"),
                                                    "reply_markup": {"inline_keyboard": [[{"text": f"• {answer}", "callback_data": "nb:x"}]]}})
    except Exception as exc:
        logger.info("[Neighbors] could not update buttons: %s", exc)
    return answer


# ---------------- feed ----------------
def clean_body(raw: Any, limit: int) -> str:
    value = re.sub(r"[ \t]+", " ", str(raw or "")).strip()
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value[:limit]


async def _names(db, user_ids: set[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    ids = list(user_ids)
    marks = ", ".join(f":u{i}" for i in range(len(ids)))
    rows = (await db.execute(text(f"SELECT user_id, display_name, anonymous, entrance, role FROM nb_members WHERE user_id IN ({marks})"),
                             {f"u{i}": v for i, v in enumerate(ids)})).all()
    out = {r.user_id: {"name": public_name(_row(r)), "entrance": r.entrance, "elder": r.role == "elder"} for r in rows}
    return out


def _since() -> str:
    return (now() - timedelta(days=FEED_DAYS)).isoformat(timespec="seconds")


async def feed(db, m: dict, *, before: str = "", kind: str = "", my_entrance: bool = False) -> dict:
    where = ["building = :b", "status = 'active'", "last_activity >= :since",
             "user_id NOT IN (SELECT user_id FROM nb_members WHERE status = 'blocked')"]
    params: dict[str, Any] = {"b": m["building"], "since": _since(), "lim": PAGE + 1}
    if kind in KINDS:
        where.append("kind = :k")
        params["k"] = kind
    if my_entrance and m.get("entrance"):
        where.append("(entrance = :e OR entrance IS NULL)")
        params["e"] = m["entrance"]
    if before:
        where.append("last_activity < :before")
        params["before"] = before
    order = "pinned DESC, last_activity DESC, id DESC" if not before else "last_activity DESC, id DESC"
    if before:
        where.append("pinned = 0")
    rows = (await db.execute(text(f"SELECT * FROM nb_posts WHERE {' AND '.join(where)} ORDER BY {order} LIMIT :lim"), params)).all()
    posts = [_row(r) for r in rows]
    more = len(posts) > PAGE
    posts = posts[:PAGE]
    ids = [p["id"] for p in posts]
    mine: set[int] = set()
    if ids:
        marks = ", ".join(f":p{i}" for i in range(len(ids)))
        mine = {r[0] for r in (await db.execute(text(
            f"SELECT post_id FROM nb_metoo WHERE user_id = :u AND post_id IN ({marks})"),
            {"u": m["user_id"], **{f"p{i}": v for i, v in enumerate(ids)}})).all()}
    names = await _names(db, {p["user_id"] for p in posts})
    items = [_post_out(p, m, names, p["id"] in mine) for p in posts]
    cursor = posts[-1]["last_activity"] if more and posts else ""
    return {"items": items, "next": cursor}


def _post_out(p: dict, viewer: dict, names: dict, me_too: bool) -> dict:
    author = names.get(p["user_id"], {"name": "Бывший сосед", "entrance": None, "elder": False})
    return {"id": p["id"], "kind": p["kind"], "body": p["body"], "entrance": p["entrance"], "pinned": bool(p["pinned"]),
            "me_too": int(p["me_too"] or 0), "i_me_too": me_too, "comments": int(p["comments"] or 0),
            "created_at": p["created_at"], "last_activity": p["last_activity"], "author": author,
            "mine": p["user_id"] == viewer["user_id"],
            "can_moderate": viewer.get("role") == "elder" and p["user_id"] != viewer["user_id"]}


async def _recent(db, table: str, user_id: str) -> int:
    since = (now() - timedelta(hours=1)).isoformat(timespec="seconds")
    return int((await db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE user_id = :u AND created_at >= :s"),
                                 {"u": user_id, "s": since})).scalar() or 0)


async def create_post(db, m: dict, kind: str, body: str, only_entrance: bool) -> dict:
    if kind not in KINDS:
        raise ValueError("Выберите тип записи")
    body = clean_body(body, 1500)
    if len(body) < 5:
        raise ValueError("Напишите чуть подробнее")
    if await _recent(db, "nb_posts", m["user_id"]) >= POSTS_PER_HOUR:
        raise PermissionError("Слишком много записей за час — попробуйте позже")
    stamp = now_iso()
    entrance = m["entrance"] if only_entrance and m.get("entrance") else None
    res = await db.execute(text(
        "INSERT INTO nb_posts (building, user_id, kind, entrance, body, status, pinned, reports, me_too, comments, created_at, last_activity) "
        "VALUES (:b, :u, :k, :e, :body, 'active', 0, 0, 0, 0, :t, :t) RETURNING id"),
        {"b": m["building"], "u": m["user_id"], "k": kind, "e": entrance, "body": body, "t": stamp})
    pid = int(res.scalar())
    await db.commit()
    post = await get_post(db, pid)
    if kind in ("alarm", "notice"):
        _spawn(_notify_house(m, post))
    return _post_out(post, m, await _names(db, {m["user_id"]}), False)


async def get_post(db, post_id: int) -> Optional[dict]:
    r = (await db.execute(text("SELECT * FROM nb_posts WHERE id = :i"), {"i": post_id})).first()
    return _row(r) if r else None


async def post_for(db, m: dict, post_id: int) -> dict:
    p = await get_post(db, post_id)
    if not p or p["building"] != m["building"] or p["status"] == "deleted":
        raise LookupError("Запись не найдена")
    if p["status"] == "hidden" and p["user_id"] != m["user_id"]:
        raise LookupError("Запись скрыта")
    return p


async def post_detail(db, m: dict, post_id: int) -> dict:
    p = await post_for(db, m, post_id)
    rows = (await db.execute(text("SELECT * FROM nb_comments WHERE post_id = :p AND status = 'active' ORDER BY id LIMIT 300"),
                             {"p": post_id})).all()
    comments = [_row(r) for r in rows]
    names = await _names(db, {p["user_id"]} | {c["user_id"] for c in comments})
    me = (await db.execute(text("SELECT 1 FROM nb_metoo WHERE post_id = :p AND user_id = :u"), {"p": post_id, "u": m["user_id"]})).first()
    return _post_out(p, m, names, bool(me)) | {
        "hidden": p["status"] == "hidden",
        "thread": [{"id": c["id"], "body": c["body"], "created_at": c["created_at"], "mine": c["user_id"] == m["user_id"],
                    "author": names.get(c["user_id"], {"name": "Бывший сосед", "entrance": None, "elder": False}),
                    "is_author": c["user_id"] == p["user_id"]} for c in comments]}


async def _recount_comments(db, post_id: int) -> None:
    await db.execute(text("UPDATE nb_posts SET comments = (SELECT COUNT(*) FROM nb_comments WHERE post_id = :p AND status = 'active') "
                          "WHERE id = :p"), {"p": post_id})


async def add_comment(db, m: dict, post_id: int, body: str) -> dict:
    p = await post_for(db, m, post_id)
    if p["status"] != "active":
        raise LookupError("Запись скрыта")
    body = clean_body(body, 800)
    if len(body) < 2:
        raise ValueError("Напишите комментарий")
    if await _recent(db, "nb_comments", m["user_id"]) >= COMMENTS_PER_HOUR:
        raise PermissionError("Слишком много комментариев за час — попробуйте позже")
    stamp = now_iso()
    await db.execute(text("INSERT INTO nb_comments (post_id, user_id, body, status, reports, created_at) VALUES (:p, :u, :b, 'active', 0, :t)"),
                     {"p": post_id, "u": m["user_id"], "b": body, "t": stamp})
    await _recount_comments(db, post_id)
    await db.execute(text("UPDATE nb_posts SET last_activity = :t WHERE id = :p"), {"t": stamp, "p": post_id})
    await db.commit()
    if p["user_id"] != m["user_id"]:
        await _cabinet(db, p["user_id"], f"nb:c:{post_id}:{stamp}", "Ответ соседа в «Мой дом»",
                       f"{public_name(m)}: {body[:120]}", path=f"/dom/post/{post_id}")
    return await post_detail(db, m, post_id)


async def toggle_me_too(db, m: dict, post_id: int) -> dict:
    p = await post_for(db, m, post_id)
    has = (await db.execute(text("SELECT 1 FROM nb_metoo WHERE post_id = :p AND user_id = :u"), {"p": post_id, "u": m["user_id"]})).first()
    if has:
        await db.execute(text("DELETE FROM nb_metoo WHERE post_id = :p AND user_id = :u"), {"p": post_id, "u": m["user_id"]})
    else:
        await db.execute(text("INSERT INTO nb_metoo (post_id, user_id) VALUES (:p, :u)"), {"p": post_id, "u": m["user_id"]})
    await db.execute(text("UPDATE nb_posts SET me_too = (SELECT COUNT(*) FROM nb_metoo WHERE post_id = :p) WHERE id = :p"), {"p": post_id})
    await db.commit()
    count = int((await db.execute(text("SELECT me_too FROM nb_posts WHERE id = :p"), {"p": p["id"]})).scalar() or 0)
    return {"me_too": count, "i_me_too": not has}


async def delete_post(db, m: dict, post_id: int) -> None:
    p = await post_for(db, m, post_id)
    if p["user_id"] != m["user_id"] and m.get("role") != "elder":
        raise PermissionError("Удалить может только автор")
    await db.execute(text("UPDATE nb_posts SET status = 'deleted' WHERE id = :p"), {"p": post_id})
    await db.commit()


async def delete_comment(db, m: dict, comment_id: int) -> None:
    c = (await db.execute(text("SELECT * FROM nb_comments WHERE id = :i"), {"i": comment_id})).first()
    if not c:
        raise LookupError("Комментарий не найден")
    c = _row(c)
    p = await post_for(db, m, c["post_id"])
    if c["user_id"] != m["user_id"] and m.get("role") != "elder":
        raise PermissionError("Удалить может только автор")
    await db.execute(text("UPDATE nb_comments SET status = 'deleted' WHERE id = :i"), {"i": comment_id})
    await _recount_comments(db, p["id"])
    await db.commit()


async def pin_post(db, m: dict, post_id: int) -> dict:
    p = await post_for(db, m, post_id)
    if m.get("role") != "elder":
        raise PermissionError("Закреплять может старший по дому")
    await db.execute(text("UPDATE nb_posts SET pinned = :v WHERE id = :p"), {"v": 0 if p["pinned"] else 1, "p": post_id})
    await db.commit()
    return {"pinned": not p["pinned"]}


async def report(db, m: dict, target: str, target_id: int) -> dict:
    if target == "post":
        p = await post_for(db, m, target_id)
        owner, table = p["user_id"], "nb_posts"
    elif target == "comment":
        c = (await db.execute(text("SELECT * FROM nb_comments WHERE id = :i"), {"i": target_id})).first()
        if not c:
            raise LookupError("Комментарий не найден")
        c = _row(c)
        await post_for(db, m, c["post_id"])
        owner, table = c["user_id"], "nb_comments"
    else:
        raise ValueError("Неизвестная цель")
    if owner == m["user_id"]:
        raise PermissionError("На себя пожаловаться нельзя")
    key = target[:4]
    exists = (await db.execute(text("SELECT 1 FROM nb_reports WHERE target = :t AND target_id = :i AND user_id = :u"),
                               {"t": key, "i": target_id, "u": m["user_id"]})).first()
    if exists:
        return {"hidden": False, "already": True}
    await db.execute(text("INSERT INTO nb_reports (target, target_id, user_id, created_at) VALUES (:t, :i, :u, :c)"),
                     {"t": key, "i": target_id, "u": m["user_id"], "c": now_iso()})
    await db.execute(text(f"UPDATE {table} SET reports = COALESCE(reports, 0) + 1 WHERE id = :i"), {"i": target_id})
    reports = int((await db.execute(text(f"SELECT reports FROM {table} WHERE id = :i"), {"i": target_id})).scalar() or 0)
    hidden = reports >= HIDE_AFTER_REPORTS or m.get("role") == "elder"
    if hidden:
        await db.execute(text(f"UPDATE {table} SET status = 'hidden' WHERE id = :i AND status = 'active'"), {"i": target_id})
        if target == "comment":
            await _recount_comments(db, c["post_id"])
    await db.commit()
    if hidden:
        _spawn(_tell_owner(f"🚩 «Мой дом»: {'запись' if target == 'post' else 'комментарий'} №{target_id} скрыт(а) по жалобам "
                           f"({reports}). Проверьте в админке → Объявления → «Мой дом»."))
    return {"hidden": hidden}


# ---------------- notifications ----------------
_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    try:
        task = asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        coro.close()
        return
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _cabinet(db, user_id: str, event_key: str, title: str, body: str, path: str = "/dom") -> None:
    try:
        from services.user_notifications import notify_user_by_id
        await notify_user_by_id(db, user_id=str(user_id), category="announcements", event_key=event_key,
                                title=title, body=body, path=path, entity_type="neighbors", entity_id=None)
    except Exception as exc:
        logger.info("[Neighbors] cabinet notice skipped: %s", exc)


async def _notify_house(author: dict, post: dict) -> None:
    """Аварии и объявления — всем подтверждённым соседям дома (в фоне, отдельной сессией: запрос автора не ждёт)."""
    try:
        from core.database import db_manager
        if not db_manager.async_session_maker:
            return
        async with db_manager.async_session_maker() as db:
            params = {"b": post["building"], "u": author["user_id"]}
            sql = "SELECT user_id FROM nb_members WHERE building = :b AND status = 'confirmed' AND user_id != :u"
            if post.get("entrance"):
                sql += " AND entrance = :e"
                params["e"] = post["entrance"]
            users = [r[0] for r in (await db.execute(text(sql), params)).all()]
            title = ("⚡ Авария в доме" if post["kind"] == "alarm" else "📢 Объявление в доме")
            body = f"{public_name(author)}: {post['body'][:140]}"
            for uid in users[:500]:
                await _cabinet(db, uid, f"nb:p:{post['id']}", title, body, path=f"/dom/post/{post['id']}")
                await db.commit()
    except Exception as exc:
        logger.warning("[Neighbors] house notice failed: %s", exc)


async def _tell_owner(message: str) -> None:
    from services.news_agent import approval_chat, bot_token, tg
    if not (bot_token() and approval_chat()):
        return
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": message[:3500]})
    except Exception as exc:
        logger.info("[Neighbors] owner message failed: %s", exc)


# ---------------- admin ----------------
async def admin_overview(db) -> dict:
    await ensure_tables(db)
    waiting = [_row(r) for r in (await db.execute(text(
        "SELECT id, user_id, street, house, kind, entrance, flat, display_name, anonymous, custom_street, proof_at, created_at "
        "FROM nb_members WHERE status = 'pending' AND proof IS NOT NULL ORDER BY proof_at"))).all()]
    houses = [{"building": r[0], "title": r[1], "people": int(r[2])} for r in (await db.execute(text(
        "SELECT building, MIN(street) || CASE WHEN MIN(kind) = 'flat' THEN ', ' || MIN(house) ELSE '' END, COUNT(*) "
        "FROM nb_members WHERE status = 'confirmed' GROUP BY building ORDER BY COUNT(*) DESC LIMIT 100"))).all()]
    hidden_posts = [_row(r) for r in (await db.execute(text(
        "SELECT id, building, kind, body, reports, created_at FROM nb_posts WHERE status = 'hidden' ORDER BY id DESC LIMIT 50"))).all()]
    hidden_comments = [_row(r) for r in (await db.execute(text(
        "SELECT id, post_id, body, reports, created_at FROM nb_comments WHERE status = 'hidden' ORDER BY id DESC LIMIT 50"))).all()]
    blocked = [_row(r) for r in (await db.execute(text(
        "SELECT id, street, house, kind, entrance, flat, display_name, updated_at FROM nb_members WHERE status = 'blocked' "
        "ORDER BY updated_at DESC LIMIT 50"))).all()]
    stats = await district_stats(db)
    pending = int((await db.execute(text("SELECT COUNT(*) FROM nb_members WHERE status = 'pending'"))).scalar() or 0)
    return {"stats": stats | {"pending": pending}, "waiting": waiting, "houses": houses, "blocked": blocked,
            "hidden_posts": hidden_posts, "hidden_comments": hidden_comments}


async def admin_members(db, building: str) -> list[dict]:
    await ensure_tables(db)
    rows = (await db.execute(text(
        "SELECT id, display_name, anonymous, entrance, flat, status, role, confirmed_at FROM nb_members WHERE building = :b "
        "ORDER BY entrance, id"), {"b": building})).all()
    return [_row(r) for r in rows]


async def admin_proof(db, member_id: int) -> str:
    return str((await db.execute(text("SELECT proof FROM nb_members WHERE id = :i"), {"i": member_id})).scalar() or "")


async def admin_set_role(db, member_id: int, role: str) -> Optional[dict]:
    if role not in ("member", "elder"):
        raise ValueError("Неизвестная роль")
    await db.execute(text("UPDATE nb_members SET role = :r WHERE id = :i AND status = 'confirmed'"), {"r": role, "i": member_id})
    await db.commit()
    return await member_by_id(db, member_id)


async def admin_restore(db, target: str, target_id: int, keep: bool) -> None:
    table = "nb_posts" if target == "post" else "nb_comments"
    await db.execute(text(f"UPDATE {table} SET status = :s, reports = 0 WHERE id = :i"),
                     {"s": "active" if keep else "deleted", "i": target_id})
    if keep:
        await db.execute(text("DELETE FROM nb_reports WHERE target = :t AND target_id = :i"), {"t": target[:4], "i": target_id})
    if target == "comment":
        pid = (await db.execute(text("SELECT post_id FROM nb_comments WHERE id = :i"), {"i": target_id})).scalar()
        if pid:
            await _recount_comments(db, int(pid))
    await db.commit()


async def admin_unblock(db, member_id: int) -> None:
    await db.execute(text("UPDATE nb_members SET status = 'confirmed' WHERE id = :i AND status = 'blocked'"), {"i": member_id})
    await db.execute(text("DELETE FROM nb_reports WHERE target = 'memb' AND target_id = :i"), {"i": member_id})
    await db.commit()
