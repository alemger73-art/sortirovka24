"""Reads a news article page: the main paragraphs, og:image and the real URL.

Used only to write our own short retelling (or quote the lead with attribution);
we never republish the whole article or other sites' photos.
"""

from __future__ import annotations

import base64
import html
import re
from typing import Any, Optional
from urllib.parse import urljoin, urlsplit

import httpx

MAX_BYTES = 1_500_000
_SKIP = re.compile(r"cookie|подпис|реклам|читайте также|фото:|источник:|telegram|whatsapp|instagram|©|все права", re.I)


def _strip(fragment: str) -> str:
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


def _meta(page: str, prop: str) -> Optional[str]:
    for pattern in (
        rf'<meta[^>]+(?:property|name)=["\']{prop}["\'][^>]*content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']{prop}["\']',
    ):
        m = re.search(pattern, page, re.I)
        if m:
            return html.unescape(m.group(1)).strip()
    return None


def extract(page: str, base_url: str) -> dict[str, Any]:
    page = re.sub(r"<(script|style|noscript|svg|nav|footer|header|aside|form)\b.*?</\1>", " ", page, flags=re.S | re.I)
    scope = page
    article = re.search(r"<article\b.*?</article>", page, re.S | re.I)
    if article and len(_strip(article.group(0))) > 300:
        scope = article.group(0)
    paragraphs: list[str] = []
    total = 0
    for raw in re.findall(r"<p\b[^>]*>(.*?)</p>", scope, re.S | re.I):
        text = _strip(raw)
        if len(text) < 60 or _SKIP.search(text[:80]) or text in paragraphs:
            continue
        paragraphs.append(text)
        total += len(text)
        if total > 3000:
            break
    image = _meta(page, "og:image") or _meta(page, "twitter:image")
    return {
        "paragraphs": paragraphs,
        "description": _meta(page, "og:description") or _meta(page, "description"),
        "image": urljoin(base_url, image) if image else None,
        "site": _meta(page, "og:site_name"),
    }


def google_target(url: str) -> Optional[str]:
    """Old-style Google News links carry the article URL inside the base64 id."""
    m = re.search(r"/articles/([A-Za-z0-9_-]+)", url)
    if not m:
        return None
    token = m.group(1)
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    except Exception:
        return None
    found = re.search(rb"https?://[\x21-\x7e]+", raw)
    if not found:
        return None
    target = found.group(0).decode("ascii", "ignore")
    target = re.split(r"[\x00-\x20\"'<>]", target)[0]
    return target if "google." not in urlsplit(target).netloc else None


async def fetch(client: httpx.AsyncClient, url: str) -> Optional[dict[str, Any]]:
    """Article info, or None when the page cannot be read."""
    if "news.google.com" in url:
        target = google_target(url)
        if not target:
            try:
                resp = await client.get(url, timeout=12, follow_redirects=True)
                m = re.search(r'data-n-au="(https?://[^"]+)"', resp.text) or \
                    re.search(r'<a[^>]+href="(https?://(?!news\.google|www\.google|accounts\.google)[^"]+)"', resp.text)
                target = html.unescape(m.group(1)) if m else (str(resp.url) if "google." not in resp.url.host else None)
            except Exception:
                target = None
        if not target:
            return None
        url = target
    try:
        resp = await client.get(url, timeout=12, follow_redirects=True)
    except Exception:
        return None
    if resp.status_code != 200 or "html" not in resp.headers.get("content-type", "html"):
        return None
    info = extract(resp.text[:MAX_BYTES], str(resp.url))
    info["url"] = str(resp.url)
    return info


def is_government(url: str) -> bool:
    host = urlsplit(url).netloc.lower()
    return host.endswith(".gov.kz") or host == "gov.kz"
