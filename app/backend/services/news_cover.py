"""Picture for every news item, made on our server.

1. If an image service is configured (NEWS_IMAGE_PROVIDER=openai + OPENAI_API_KEY), an
   illustration is drawn from a short prompt written by the news editor (AI). It is
   marked «Иллюстрация ИИ» so nobody takes it for a photo of the real event.
2. Otherwise — or if the service fails — a branded cover with the headline, category
   colour and the «Сортировка 24» logo (free, unique for every article).

The JPEG is uploaded to the site storage (Cloudinary). Any failure returns None and the
caller keeps the old stock cover, so news never stops because of a picture.
"""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import httpx
from PIL import Image, ImageDraw, ImageFilter, ImageFont

logger = logging.getLogger(__name__)

W, H = 1200, 675
FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo-s24.png"
TZ = ZoneInfo("Asia/Almaty")
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]

# (dark, accent) per category; unknown → blue.
PALETTE = {
    "Происшествия": ((40, 10, 16), (239, 68, 68)),
    "ЖКХ": ((8, 28, 44), (14, 165, 233)),
    "Дороги": ((30, 22, 6), (245, 158, 11)),
    "Инфраструктура": ((6, 30, 26), (16, 185, 129)),
    "Караганда": ((10, 20, 48), (59, 130, 246)),
    "Сортировка": ((36, 14, 6), (249, 115, 22)),
    "События района": ((36, 14, 6), (249, 115, 22)),
    "Казахстан": ((4, 30, 40), (6, 182, 212)),
    "Экономика": ((10, 32, 20), (34, 197, 94)),
    "Спорт": ((30, 10, 40), (168, 85, 247)),
    "Общество": ((24, 16, 44), (129, 140, 248)),
    "Мир": ((14, 22, 40), (96, 165, 250)),
    "Важная информация": ((44, 8, 20), (244, 63, 94)),
}


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(FONTS / name), size)
    except OSError:
        return ImageFont.load_default(size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int, max_lines: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        test = f"{line} {word}".strip()
        if draw.textlength(test, font=font) <= width:
            line = test
            continue
        if line:
            lines.append(line)
        line = word
        if len(lines) == max_lines:
            break
    if line and len(lines) < max_lines:
        lines.append(line)
    if len(lines) == max_lines and " ".join(lines) != " ".join(words):
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > width:
            last = last[:-1]
        lines[-1] = last.rstrip(" ,.:;—-") + "…"
    return lines


def _date_label(now: Optional[datetime] = None) -> str:
    now = (now or datetime.now(TZ)).astimezone(TZ)
    return f"{now.day} {MONTHS[now.month - 1]} {now.year}"


def _background(dark: tuple, accent: tuple, seed: str) -> Image.Image:
    img = Image.new("RGB", (W, H), dark)
    glow = Image.new("RGB", (W, H), dark)
    g = ImageDraw.Draw(glow)
    h = int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16)
    cx, cy = 760 + h % 360, 40 + (h >> 8) % 200
    g.ellipse((cx - 420, cy - 420, cx + 420, cy + 420), fill=accent)
    g.ellipse((-260, H - 160, 260, H + 360), fill=tuple(int(c * 0.6) for c in accent))
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    img = Image.blend(img, glow, 0.55)
    grid = ImageDraw.Draw(img)
    line = tuple(min(255, c + 6) for c in img.getpixel((W // 2, H // 2)))
    for x in range(0, W, 60):
        grid.line([(x, 0), (x, H)], fill=line, width=1)
    for y in range(0, H, 60):
        grid.line([(0, y), (W, y)], fill=line, width=1)
    return Image.blend(Image.new("RGB", (W, H), dark), img, 0.92)


def _chip(draw, xy, text, font, fill, color=(255, 255, 255)):
    x, y = xy
    w = int(draw.textlength(text, font=font)) + 36
    draw.rounded_rectangle((x, y, x + w, y + 46), radius=23, fill=fill)
    draw.text((x + 18, y + 9), text, font=font, fill=color)
    return w


def _footer(img: Image.Image, draw: ImageDraw.ImageDraw, when: str) -> None:
    small = _font("Inter-SemiBold.otf", 26)
    x = 64
    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA").resize((56, 56))
        img.paste(logo, (x, H - 100), logo)
        x += 72
    draw.text((x, H - 88), "Сортировка 24 · новости", font=small, fill=(226, 232, 240))
    tw = draw.textlength(when, font=small)
    draw.text((W - 64 - tw, H - 88), when, font=small, fill=(148, 163, 184))


def branded_cover(title: str, category: str, seed: str = "", now: Optional[datetime] = None) -> bytes:
    dark, accent = PALETTE.get(category, PALETTE["Караганда"])
    img = _background(dark, accent, seed or title)
    draw = ImageDraw.Draw(img)
    _chip(draw, (64, 60), category.upper(), _font("Inter-SemiBold.otf", 24), accent)
    size, lines = 76, []
    for size in (76, 68, 60, 54):
        font = _font("InterDisplay-ExtraBold.otf", size)
        lines = _wrap(draw, title, font, W - 128, 4)
        if len(lines) <= 3 or size == 54:
            break
    font = _font("InterDisplay-ExtraBold.otf", size)
    y = 150 + (4 - len(lines)) * size // 2
    for line in lines:
        draw.text((64, y), line, font=font, fill=(255, 255, 255))
        y += int(size * 1.12)
    _footer(img, draw, _date_label(now))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    return out.getvalue()


def ai_cover(picture: bytes, category: str) -> bytes:
    """AI illustration cropped to 16:9, marked so it is never mistaken for a photo."""
    dark, accent = PALETTE.get(category, PALETTE["Караганда"])
    src = Image.open(io.BytesIO(picture)).convert("RGB")
    scale = max(W / src.width, H / src.height)
    src = src.resize((int(src.width * scale) + 1, int(src.height * scale) + 1))
    left, top = (src.width - W) // 2, (src.height - H) // 2
    img = src.crop((left, top, left + W, top + H))
    shade = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shade).rectangle((0, H - 150, W, H), fill=170)
    img.paste(Image.new("RGB", (W, H), dark), (0, 0), shade.filter(ImageFilter.GaussianBlur(40)))
    draw = ImageDraw.Draw(img)
    _chip(draw, (64, 60), category.upper(), _font("Inter-SemiBold.otf", 24), accent)
    label = "Иллюстрация ИИ"
    lf = _font("Inter-SemiBold.otf", 22)
    lw = int(draw.textlength(label, font=lf)) + 32
    draw.rounded_rectangle((W - 64 - lw, 64, W - 64, 104), radius=20, fill=(15, 23, 42))
    draw.text((W - 64 - lw + 16, 72), label, font=lf, fill=(226, 232, 240))
    _footer(img, draw, _date_label())
    out = io.BytesIO()
    img.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    return out.getvalue()


def image_provider() -> str:
    provider = os.getenv("NEWS_IMAGE_PROVIDER", "").strip().lower()
    return provider if provider == "openai" and os.getenv("OPENAI_API_KEY", "").strip() else ""


IMAGE_STYLE = ("Editorial illustration for a city news website, modern flat-3D style, soft light, rich colours. "
               "No text, no letters, no logos, no flags with writing, no recognizable real people, no faces in close-up, "
               "no blood or injuries. Scene: ")


async def generate_picture(client: httpx.AsyncClient, prompt: str) -> Optional[bytes]:
    if image_provider() != "openai" or not prompt.strip():
        return None
    try:
        resp = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY'].strip()}"},
            json={"model": os.getenv("NEWS_IMAGE_MODEL", "gpt-image-1-mini"), "prompt": IMAGE_STYLE + prompt[:600],
                  "size": "1536x1024", "quality": os.getenv("NEWS_IMAGE_QUALITY", "low"), "n": 1},
            timeout=120,
        )
        resp.raise_for_status()
        item = (resp.json().get("data") or [{}])[0]
        if item.get("b64_json"):
            return base64.b64decode(item["b64_json"])
        if item.get("url"):
            pic = await client.get(item["url"], timeout=60)
            pic.raise_for_status()
            return pic.content
    except Exception as exc:
        logger.warning("[NewsCover] AI picture failed, using branded cover: %s", str(exc)[:200])
    return None


def _upload(key: str, payload: bytes) -> Optional[str]:
    try:
        from services.storage import StorageService
        return StorageService()._upload_cloudinary_bytes(key, payload, content_type="image/jpeg")
    except Exception as exc:
        logger.warning("[NewsCover] upload failed: %s", str(exc)[:200])
        return None


async def make_cover(client: httpx.AsyncClient, *, title: str, category: str, link: str,
                     image_prompt: str = "") -> Optional[str]:
    """Returns the public URL of a fresh cover, or None (caller keeps its fallback)."""
    digest = hashlib.sha256(f"{link}|{title}".encode()).hexdigest()[:16]
    picture = await generate_picture(client, image_prompt) if image_prompt else None
    try:
        payload = ai_cover(picture, category) if picture else branded_cover(title, category, seed=link)
    except Exception as exc:
        logger.warning("[NewsCover] drawing failed: %s", exc)
        return None
    import asyncio
    return await asyncio.to_thread(_upload, f"news-covers/{digest}.jpg", payload)
