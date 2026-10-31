"""Опросы жителей за бонусы.

The owner writes a survey in the admin panel; a resident with a confirmed phone answers it once and gets
bonuses in DAM ALEM (an ordinary loyalty lot that burns after `BONUS_DAYS`). Answers are anonymous for the
admin: results are counted per question, without names or phones.

Honest answers are protected in two ways, and an answer that fails either one is kept apart and earns nothing:
the survey can't be finished faster than a person can read it (the server starts the clock when the survey
is opened), and a survey may hold a check question («отметьте вариант …»).
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import text

logger = logging.getLogger(__name__)

TYPES = ("single", "multi", "scale", "text", "check")
STATUSES = ("draft", "active", "closed")
REWARD = 500
BONUS_DAYS = 30
MAX_QUESTIONS = 25
MAX_OPTIONS = 12
SECONDS_PER_QUESTION = 3
MIN_SECONDS = 20
STATE_KEY = "surveys_state"

_ready: set[int] = set()


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().isoformat(timespec="milliseconds")


# ---------------- storage ----------------
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
    for stmt in (
        f"CREATE TABLE IF NOT EXISTS surveys (id {pk}, title VARCHAR(160) NOT NULL, intro TEXT, questions TEXT NOT NULL, "
        "reward INTEGER DEFAULT 500, max_rewards INTEGER, status VARCHAR(8) DEFAULT 'draft', "
        "created_at VARCHAR(32), updated_at VARCHAR(32), started_at VARCHAR(32), closed_at VARCHAR(32))",
        "CREATE TABLE IF NOT EXISTS survey_starts (survey_id INTEGER NOT NULL, user_id VARCHAR(64) NOT NULL, started_at VARCHAR(32))",
        "CREATE UNIQUE INDEX IF NOT EXISTS survey_starts_once ON survey_starts (survey_id, user_id)",
        f"CREATE TABLE IF NOT EXISTS survey_responses (id {pk}, survey_id INTEGER NOT NULL, user_id VARCHAR(64) NOT NULL, "
        "answers TEXT NOT NULL, seconds INTEGER, valid INTEGER DEFAULT 1, reason VARCHAR(40), rewarded INTEGER DEFAULT 0, "
        "created_at VARCHAR(32))",
        "CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_once ON survey_responses (survey_id, user_id)",
        "CREATE INDEX IF NOT EXISTS survey_responses_survey ON survey_responses (survey_id, valid)",
    ):
        await db.execute(text(stmt))
    await db.commit()
    await _seed(db)


async def _state(db) -> tuple[Any, dict]:
    from sqlalchemy import select
    from models.module_settings import ModuleSettings
    row = await db.scalar(select(ModuleSettings).where(ModuleSettings.key == STATE_KEY))
    try:
        state = json.loads(row.value or "{}") if row else {}
    except ValueError:
        state = {}
    return row, state if isinstance(state, dict) else {}


async def _seed(db) -> None:
    """Two drafts the owner can launch as they are or edit first."""
    from models.module_settings import ModuleSettings
    row, state = await _state(db)
    if state.get("seeded"):
        return
    if not await db.scalar(text("SELECT COUNT(*) FROM surveys")):
        for title, intro, questions in SEED:
            await db.execute(text("INSERT INTO surveys (title, intro, questions, reward, status, created_at, updated_at) "
                                  "VALUES (:t, :i, :q, :r, 'draft', :n, :n)"),
                             {"t": title, "i": intro, "q": json.dumps(clean_questions(questions), ensure_ascii=False),
                              "r": REWARD, "n": now_iso()})
    if not row:
        row = ModuleSettings(key=STATE_KEY)
        db.add(row)
    row.value = json.dumps({**state, "seeded": True})
    await db.commit()


# ---------------- validation ----------------
def _line(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def clean_questions(raw: Any) -> list[dict]:
    if not isinstance(raw, list) or not raw:
        raise ValueError("Добавьте хотя бы один вопрос")
    if len(raw) > MAX_QUESTIONS:
        raise ValueError(f"Не больше {MAX_QUESTIONS} вопросов")
    out = []
    for n, q in enumerate(raw, 1):
        q = q if isinstance(q, dict) else {}
        kind = q.get("type") if q.get("type") in TYPES else "single"
        title = _line(q.get("text"), 300)
        if not title:
            raise ValueError(f"Вопрос {n}: напишите текст вопроса")
        item: dict[str, Any] = {"id": f"q{n}", "type": kind, "text": title, "required": kind == "check" or q.get("required", True) is not False}
        if kind in ("single", "multi", "check"):
            options = [_line(o, 120) for o in (q.get("options") or []) if _line(o, 120)][:MAX_OPTIONS]
            if len(options) < 2:
                raise ValueError(f"Вопрос {n}: нужно минимум два варианта ответа")
            item["options"] = options
            if kind != "check":
                item["other"] = bool(q.get("other"))
            else:
                answer = q.get("answer")
                if not isinstance(answer, int) or not 0 <= answer < len(options):
                    raise ValueError(f"Вопрос {n}: отметьте правильный вариант проверочного вопроса")
                item["answer"] = answer
        if kind == "scale":
            item["low"] = _line(q.get("low"), 40) or "Совсем нет"
            item["high"] = _line(q.get("high"), 40) or "Очень"
        out.append(item)
    return out


def clean_survey(body: dict[str, Any]) -> dict[str, Any]:
    title = _line(body.get("title"), 160)
    if not title:
        raise ValueError("Напишите название опроса")
    try:
        reward = int(body.get("reward", REWARD))
        max_rewards = int(body["max_rewards"]) if body.get("max_rewards") not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        raise ValueError("Бонус и лимит — целые числа")
    if not 0 <= reward <= 5000:
        raise ValueError("Бонус за опрос — от 0 до 5000")
    if max_rewards is not None and max_rewards < 1:
        raise ValueError("Лимит участников — положительное число")
    intro = str(body.get("intro") or "").strip()[:1000]
    return {"title": title, "intro": intro, "questions": clean_questions(body.get("questions")),
            "reward": reward, "max_rewards": max_rewards}


def clean_answers(questions: list[dict], raw: Any) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    out: dict[str, Any] = {}
    for q in questions:
        a = raw.get(q["id"]) if isinstance(raw.get(q["id"]), dict) else {}
        kind = q["type"]
        if kind in ("single", "multi", "check"):
            picks = sorted({c for c in (a.get("choices") or []) if isinstance(c, int) and 0 <= c < len(q["options"])})
            other = _line(a.get("other"), 300) if q.get("other") else ""
            if kind != "multi" and len(picks) + bool(other) > 1:
                raise HTTPException(422, f"«{q['text']}»: выберите один вариант")
            value: dict[str, Any] = {"choices": picks, **({"other": other} if other else {})}
            filled = bool(picks or other)
        elif kind == "scale":
            v = a.get("value")
            value = {"value": v} if isinstance(v, int) and 1 <= v <= 5 else {}
            filled = bool(value)
        else:
            t = str(a.get("text") or "").strip()[:2000]
            value = {"text": t} if t else {}
            filled = bool(t)
        if q["required"] and not filled:
            raise HTTPException(422, f"Ответьте на вопрос: «{q['text']}»")
        if filled:
            out[q["id"]] = value
    return out


def public_questions(questions: list[dict]) -> list[dict]:
    return [{k: v for k, v in q.items() if k != "answer"} for q in questions]


def min_seconds(questions: list[dict]) -> int:
    return max(MIN_SECONDS, SECONDS_PER_QUESTION * len(questions))


# ---------------- reading ----------------
def _survey(row: Any) -> dict[str, Any]:
    return {"id": row.id, "title": row.title, "intro": row.intro or "", "questions": json.loads(row.questions),
            "reward": int(row.reward or 0), "max_rewards": row.max_rewards, "status": row.status,
            "created_at": row.created_at, "started_at": row.started_at, "closed_at": row.closed_at}


async def _get(db, survey_id: int, lock: bool = False) -> dict[str, Any]:
    await ensure_tables(db)
    dialect = getattr(getattr(db, "bind", None), "dialect", None)
    suffix = " FOR UPDATE" if lock and getattr(dialect, "name", "") == "postgresql" else ""
    row = (await db.execute(text(f"SELECT * FROM surveys WHERE id = :id{suffix}"), {"id": survey_id})).first()
    if not row:
        raise HTTPException(404, "Опрос не найден")
    return _survey(row)


async def _counts(db, survey_id: int) -> dict[str, int]:
    row = (await db.execute(text(
        "SELECT COUNT(*) AS total, COALESCE(SUM(valid), 0) AS valid, COALESCE(SUM(rewarded), 0) AS rewarded "
        "FROM survey_responses WHERE survey_id = :id"), {"id": survey_id})).first()
    return {"total": int(row.total or 0), "valid": int(row.valid or 0), "rewarded": int(row.rewarded or 0)}


def _places_left(survey: dict, counts: dict) -> Optional[int]:
    return None if not survey["max_rewards"] else max(0, survey["max_rewards"] - counts["rewarded"])


async def list_public(db, user_id: Optional[str]) -> list[dict[str, Any]]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT * FROM surveys WHERE status = 'active' ORDER BY id DESC"))).all()
    done: set[int] = set()
    if user_id:
        done = {r.survey_id for r in (await db.execute(
            text("SELECT survey_id FROM survey_responses WHERE user_id = :u"), {"u": user_id})).all()}
    out = []
    for row in rows:
        s = _survey(row)
        counts = await _counts(db, s["id"])
        left = _places_left(s, counts)
        out.append({"id": s["id"], "title": s["title"], "intro": s["intro"], "questions": len(s["questions"]),
                    "minutes": max(1, round(len(s["questions"]) * 15 / 60)), "reward": s["reward"] if left != 0 else 0,
                    "places_left": left, "done": s["id"] in done})
    await db.commit()
    return out


async def open_survey(db, survey_id: int, user) -> dict[str, Any]:
    s = await _get(db, survey_id)
    if s["status"] != "active":
        raise HTTPException(404, "Этот опрос уже закончился")
    answered = await db.scalar(text("SELECT 1 FROM survey_responses WHERE survey_id = :s AND user_id = :u"),
                               {"s": survey_id, "u": str(user.id)})
    if not answered:
        # The clock starts at the first opening and never restarts.
        exists = await db.scalar(text("SELECT 1 FROM survey_starts WHERE survey_id = :s AND user_id = :u"),
                                 {"s": survey_id, "u": str(user.id)})
        if not exists:
            await db.execute(text("INSERT INTO survey_starts (survey_id, user_id, started_at) VALUES (:s, :u, :t)"),
                             {"s": survey_id, "u": str(user.id), "t": now_iso()})
    counts = await _counts(db, survey_id)
    await db.commit()
    left = _places_left(s, counts)
    return {"id": s["id"], "title": s["title"], "intro": s["intro"], "questions": public_questions(s["questions"]),
            "reward": s["reward"] if left != 0 else 0, "done": bool(answered),
            "phone_verified": bool(getattr(user, "phone_verified_at", None)), "bonus_days": BONUS_DAYS}


# ---------------- answering ----------------
async def submit(db, survey_id: int, user, raw_answers: Any) -> dict[str, Any]:
    if not getattr(user, "phone_verified_at", None):
        raise HTTPException(403, "Подтвердите номер телефона в кабинете — так один человек получает бонус один раз")
    s = await _get(db, survey_id, lock=True)
    if s["status"] != "active":
        raise HTTPException(409, "Этот опрос уже закончился")
    answers = clean_answers(s["questions"], raw_answers)
    uid = str(user.id)
    if await db.scalar(text("SELECT 1 FROM survey_responses WHERE survey_id = :s AND user_id = :u"), {"s": survey_id, "u": uid}):
        raise HTTPException(409, "Вы уже прошли этот опрос")
    started = await db.scalar(text("SELECT started_at FROM survey_starts WHERE survey_id = :s AND user_id = :u"),
                              {"s": survey_id, "u": uid})
    seconds = int((now() - datetime.fromisoformat(started)).total_seconds()) if started else 0
    reason = None
    if seconds < min_seconds(s["questions"]):
        reason = "too_fast"
    for q in s["questions"]:
        if q["type"] == "check" and answers.get(q["id"], {}).get("choices") != [q["answer"]]:
            reason = "check_failed"
    counts = await _counts(db, survey_id)
    left = _places_left(s, counts)
    earn = s["reward"] if reason is None and s["reward"] > 0 and left != 0 else 0
    await db.execute(text("INSERT INTO survey_responses (survey_id, user_id, answers, seconds, valid, reason, rewarded, created_at) "
                          "VALUES (:s, :u, :a, :sec, :v, :r, 0, :t)"),
                     {"s": survey_id, "u": uid, "a": json.dumps(answers, ensure_ascii=False), "sec": seconds,
                      "v": 0 if reason else 1, "r": reason, "t": now_iso()})
    rewarded = 0
    if earn:
        try:
            await _grant(db, user, survey_id, s["title"], earn)
            rewarded = earn
            await db.execute(text("UPDATE survey_responses SET rewarded = 1 WHERE survey_id = :s AND user_id = :u"),
                             {"s": survey_id, "u": uid})
        except HTTPException as exc:
            logger.warning("[Surveys] bonus for survey %s not granted: %s", survey_id, exc.detail)
    if left is not None and rewarded and left - 1 <= 0:
        await db.execute(text("UPDATE surveys SET status = 'closed', closed_at = :t WHERE id = :id"), {"t": now_iso(), "id": survey_id})
    await db.commit()
    if reason:
        message = "Ответы пришли слишком быстро или не прошли проверочный вопрос, поэтому бонус за них не начислен."
    elif rewarded:
        message = f"{rewarded} бонусов уже на вашем счёте — их можно потратить в DÄM ALEM в течение {BONUS_DAYS} дней."
    elif earn:
        message = "Бонус начислить не получилось — напишите нам, мы проверим вручную."
    else:
        message = "Ваши ответы сохранены."
    return {"ok": True, "rewarded": rewarded, "valid": reason is None, "message": message}


async def _grant(db, user, survey_id: int, title: str, points: int) -> None:
    """An ordinary DAM ALEM loyalty lot: shows in the cabinet, burns after BONUS_DAYS with the usual warning."""
    from services import loyalty
    await loyalty.policy(db, lock=True)
    member = await loyalty.account(db, user.id)
    await loyalty.expire(db, member)
    key = f"survey:{survey_id}:{user.id}"
    await loyalty.post(db, member, "SURVEY", points, key, f"За опрос «{title[:80]}»",
                       expires_at=now() + timedelta(days=BONUS_DAYS), details={"survey_id": survey_id})
    await loyalty.notify(db, member.id, f"loyalty:{key}",
                         f"+{points} бонусов за опрос. Потратьте в DÄM ALEM до {(now() + timedelta(days=BONUS_DAYS)):%d.%m.%Y}.")


# ---------------- admin ----------------
async def admin_list(db) -> list[dict[str, Any]]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT * FROM surveys ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, id DESC"))).all()
    out = []
    for row in rows:
        s = _survey(row)
        counts = await _counts(db, s["id"])
        out.append({**s, "counts": counts, "bonus_spent": counts["rewarded"] * s["reward"]})
    await db.commit()
    return out


async def save(db, body: dict[str, Any], survey_id: Optional[int] = None) -> dict[str, Any]:
    await ensure_tables(db)
    try:
        data = clean_survey(body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    params = {"t": data["title"], "i": data["intro"], "q": json.dumps(data["questions"], ensure_ascii=False),
              "r": data["reward"], "m": data["max_rewards"], "n": now_iso()}
    if survey_id:
        current = await _get(db, survey_id)
        if (await _counts(db, survey_id))["total"] and data["questions"] != current["questions"]:
            raise HTTPException(409, "На опрос уже ответили — вопросы менять нельзя, иначе ответы перепутаются. "
                                     "Сделайте копию опроса и измените её.")
        await db.execute(text("UPDATE surveys SET title = :t, intro = :i, questions = :q, reward = :r, max_rewards = :m, "
                              "updated_at = :n WHERE id = :id"), {**params, "id": survey_id})
    else:
        await db.execute(text("INSERT INTO surveys (title, intro, questions, reward, max_rewards, status, created_at, updated_at) "
                              "VALUES (:t, :i, :q, :r, :m, 'draft', :n, :n)"), params)
    await db.commit()
    return {"items": await admin_list(db)}


async def set_status(db, survey_id: int, status: str) -> dict[str, Any]:
    if status not in STATUSES:
        raise HTTPException(400, "Неизвестный статус")
    await _get(db, survey_id)
    column = {"active": ", started_at = COALESCE(started_at, :n)", "closed": ", closed_at = :n"}.get(status, "")
    await db.execute(text(f"UPDATE surveys SET status = :st, updated_at = :n{column} WHERE id = :id"),
                     {"st": status, "n": now_iso(), "id": survey_id})
    await db.commit()
    return {"items": await admin_list(db)}


async def delete(db, survey_id: int) -> dict[str, Any]:
    await _get(db, survey_id)
    if (await _counts(db, survey_id))["total"]:
        raise HTTPException(409, "На опрос уже ответили — его можно только завершить, ответы сохранятся")
    await db.execute(text("DELETE FROM survey_starts WHERE survey_id = :id"), {"id": survey_id})
    await db.execute(text("DELETE FROM surveys WHERE id = :id"), {"id": survey_id})
    await db.commit()
    return {"items": await admin_list(db)}


async def _answers(db, survey_id: int) -> list[Any]:
    return (await db.execute(text("SELECT answers, seconds, valid, reason, created_at FROM survey_responses "
                                  "WHERE survey_id = :id ORDER BY id"), {"id": survey_id})).all()


async def results(db, survey_id: int) -> dict[str, Any]:
    """Counts per question over valid answers only. No names, phones or user ids."""
    s = await _get(db, survey_id)
    rows = await _answers(db, survey_id)
    valid = [json.loads(r.answers) for r in rows if r.valid]
    out = []
    for q in s["questions"]:
        given = [a[q["id"]] for a in valid if q["id"] in a]
        item: dict[str, Any] = {"id": q["id"], "type": q["type"], "text": q["text"], "answered": len(given)}
        if q["type"] in ("single", "multi", "check"):
            counts = [0] * len(q["options"])
            others = []
            for a in given:
                for c in a.get("choices", []):
                    counts[c] += 1
                if a.get("other"):
                    others.append(a["other"])
            item["options"] = [{"label": label, "count": counts[i]} for i, label in enumerate(q["options"])]
            if q.get("other"):
                item["options"].append({"label": "Свой вариант", "count": len(others)})
                item["texts"] = others[-200:][::-1]
        elif q["type"] == "scale":
            values = [a["value"] for a in given]
            item["options"] = [{"label": str(v), "count": values.count(v)} for v in range(1, 6)]
            item["average"] = round(sum(values) / len(values), 1) if values else None
            item["low"], item["high"] = q.get("low"), q.get("high")
        else:
            item["texts"] = [a["text"] for a in given][-200:][::-1]
        out.append(item)
    counts = await _counts(db, survey_id)
    await db.commit()
    rejected = {"too_fast": 0, "check_failed": 0}
    for r in rows:
        if not r.valid and r.reason in rejected:
            rejected[r.reason] += 1
    return {"survey": {k: s[k] for k in ("id", "title", "status", "reward", "max_rewards")}, "counts": counts,
            "rejected": rejected, "questions": out}


async def results_csv(db, survey_id: int) -> str:
    s = await _get(db, survey_id)
    rows = await _answers(db, survey_id)
    await db.commit()
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["№", "Дата", "Секунд", "Засчитан"] + [q["text"] for q in s["questions"]])
    for n, r in enumerate(rows, 1):
        a = json.loads(r.answers)
        cells = []
        for q in s["questions"]:
            v = a.get(q["id"], {})
            if q["type"] in ("single", "multi", "check"):
                cells.append(", ".join([q["options"][c] for c in v.get("choices", [])] + ([v["other"]] if v.get("other") else [])))
            elif q["type"] == "scale":
                cells.append(v.get("value", ""))
            else:
                cells.append(v.get("text", ""))
        writer.writerow([n, (r.created_at or "")[:16].replace("T", " "), r.seconds, "да" if r.valid else "нет"] + cells)
    return "﻿" + buf.getvalue()  # BOM: Excel opens Cyrillic correctly


# ---------------- first drafts ----------------
SEED = [
    ("Чего не хватает в Сортировке?",
     "Помогите решить, что открыть и улучшить в районе. 2 минуты, ответы анонимные.",
     [
         {"type": "multi", "text": "Чего вам больше всего не хватает в районе?", "other": True,
          "options": ["Кафе или кофейня", "Хороший продуктовый магазин", "Аптека 24/7", "Спортзал / фитнес",
                      "Детские кружки и секции", "Баня / сауна", "Бар или место отдохнуть вечером", "Доставка из магазинов района"]},
         {"type": "single", "text": "Где вы чаще всего покупаете продукты?",
          "options": ["Магазин у дома", "Magnum / Small / сетевые", "Рынок", "Заказываю доставку"]},
         {"type": "single", "text": "Как часто вы заказываете готовую еду с доставкой?",
          "options": ["Несколько раз в неделю", "Раз в неделю", "Пару раз в месяц", "Почти никогда"]},
         {"type": "scale", "text": "Насколько вам нравится жить в Сортировке?", "low": "Совсем нет", "high": "Очень нравится"},
         {"type": "check", "text": "Проверочный вопрос: отметьте вариант «Сортировка»",
          "options": ["Майкудук", "Сортировка", "Пришахтинск"], "answer": 1},
         {"type": "multi", "text": "Что мешает больше всего?", "other": True,
          "options": ["Дороги и ямы", "Освещение улиц", "Мусор", "Транспорт", "Безопасность", "Отключения воды и света"]},
         {"type": "single", "text": "Где вы узнаёте новости района?",
          "options": ["Instagram «Сортировка Официал»", "WhatsApp-группы", "Telegram", "От соседей", "Нигде"]},
         {"type": "text", "text": "Что бы вы сделали в районе в первую очередь, если бы могли?", "required": False},
     ]),
    ("Еда с доставкой в Сортировке",
     "Расскажите, как вы заказываете еду — по ответам улучшим DÄM ALEM. 2 минуты.",
     [
         {"type": "multi", "text": "Что вы заказываете чаще всего?", "other": True,
          "options": ["Шашлык", "Бургеры", "Пицца", "Суши / роллы", "Национальная кухня", "Комплексные обеды"]},
         {"type": "single", "text": "Через что вы заказываете?",
          "options": ["Glovo / Wolt / Яндекс Еда", "WhatsApp или звонок в кафе", "Сайт кафе", "Почти не заказываю"]},
         {"type": "single", "text": "Сколько обычно стоит ваш заказ?",
          "options": ["До 3 000 ₸", "3 000 – 6 000 ₸", "6 000 – 10 000 ₸", "Больше 10 000 ₸"]},
         {"type": "single", "text": "Сколько готовы ждать доставку?",
          "options": ["До 30 минут", "До 45 минут", "До часа", "Неважно, если вкусно"]},
         {"type": "check", "text": "Проверочный вопрос: отметьте вариант «Шашлык»",
          "options": ["Пицца", "Шашлык", "Салат"], "answer": 1},
         {"type": "multi", "text": "Что для вас важнее всего?",
          "options": ["Цена", "Вкус", "Скорость", "Большие порции", "Бонусы и акции", "Бесплатная доставка"]},
         {"type": "scale", "text": "Пробовали DÄM ALEM? Насколько понравилось?", "low": "Не понравилось", "high": "Очень вкусно", "required": False},
         {"type": "text", "text": "Какое блюдо вы хотели бы видеть в меню?", "required": False},
     ]),
]
