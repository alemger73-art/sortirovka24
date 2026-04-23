"""Re-optimize legacy images in DB to WebP and update records.

Usage:
    python reoptimize_existing_images.py
"""
import asyncio
import io
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import unquote, urlparse

import httpx
from core.database import db_manager
from models.announcements import Announcements
from models.banners import Banners
from models.complaints import Complaints
from models.food_items import Food_items
from models.history_events import History_events
from models.inspectors import Inspectors
from models.jobs import Jobs
from models.masters import Masters
from models.news import News
from models.real_estate import Real_estate
from PIL import Image, ImageOps
from sqlalchemy import select
from services.storage import StorageService, _build_image_keys

MAX_IMAGE_SIZE = 1200
THUMB_SIZE = 300
QUALITY_MAIN = 78
QUALITY_THUMB = 72


def _is_direct_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def _extract_cloudinary_key_from_url(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
        if parsed.netloc != "res.cloudinary.com":
            return None
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) < 5:
            return None
        # <cloud_name>/<resource_type>/upload/[v123]/<public_id_with_ext>
        upload_idx = parts.index("upload")
        key_parts = parts[upload_idx + 1 :]
        if not key_parts:
            return None
        if key_parts[0].startswith("v") and key_parts[0][1:].isdigit():
            key_parts = key_parts[1:]
        key = "/".join(key_parts)
        return unquote(key)
    except Exception:
        return None


def _webp_bytes(file_bytes: bytes, max_side: int, quality: int) -> bytes:
    with Image.open(io.BytesIO(file_bytes)) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, optimize=True, method=6)
        return out.getvalue()


async def _download_source_bytes(service: StorageService, source_value: str) -> Tuple[bytes, str]:
    if _is_direct_url(source_value):
        source_url = source_value
        source_key = _extract_cloudinary_key_from_url(source_value) or f"migrated/{source_value.split('/')[-1] or 'legacy.jpg'}"
    else:
        source_key = source_value
        source_url = service._cloudinary_url(source_key)

    async with httpx.AsyncClient(timeout=40.0, follow_redirects=True) as client:
        resp = await client.get(source_url)
        resp.raise_for_status()
        return resp.content, source_key


async def _migrate_single_value(
    service: StorageService, value: str, cache: Dict[str, Tuple[str, str]]
) -> Optional[Tuple[str, str]]:
    cleaned = (value or "").strip()
    if not cleaned:
        return None

    if cleaned in cache:
        return cache[cleaned]

    src_bytes, src_key = await _download_source_bytes(service, cleaned)
    new_key, thumb_key = _build_image_keys(src_key)

    main_bytes = _webp_bytes(src_bytes, MAX_IMAGE_SIZE, QUALITY_MAIN)
    thumb_bytes = _webp_bytes(src_bytes, THUMB_SIZE, QUALITY_THUMB)

    service._upload_cloudinary_bytes(
        object_key=new_key,
        payload_bytes=main_bytes,
        content_type="image/webp",
        force_resource_type="image",
        force_format="webp",
    )
    service._upload_cloudinary_bytes(
        object_key=thumb_key,
        payload_bytes=thumb_bytes,
        content_type="image/webp",
        force_resource_type="image",
        force_format="webp",
    )

    cache[cleaned] = (new_key, thumb_key)
    return new_key, thumb_key


def _parse_gallery(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _join_gallery(values: Iterable[str]) -> str:
    return ",".join(v for v in values if v)


async def reoptimize_existing_images():
    await db_manager.ensure_initialized()
    if not db_manager.async_session_maker:
        print("ERROR: Database session maker unavailable.")
        return

    service = StorageService()
    cache: Dict[str, Tuple[str, str]] = {}
    updated = 0
    failed = 0

    model_fields = [
        (News, ["image_url"], ["gallery_images"]),
        (Announcements, ["image_url"], ["gallery_images"]),
        (Real_estate, ["image_url"], ["gallery_images"]),
        (Complaints, ["photo_url"], ["gallery_images"]),
        (Masters, ["photo_url"], ["gallery_images"]),
        (Banners, ["image_url"], []),
        (Jobs, ["image_url"], []),
        (Food_items, ["image_url"], []),
        (History_events, ["image_url", "image_url_after"], []),
        (Inspectors, ["photo_url"], []),
    ]

    async with db_manager.async_session_maker() as db:
        for model, single_fields, gallery_fields in model_fields:
            rows = (await db.execute(select(model))).scalars().all()
            for row in rows:
                row_changed = False

                for field in single_fields:
                    current = (getattr(row, field, "") or "").strip()
                    if not current:
                        continue
                    try:
                        migrated = await _migrate_single_value(service, current, cache)
                        if not migrated:
                            continue
                        new_key, _thumb_key = migrated
                        if new_key and new_key != current:
                            setattr(row, field, new_key)
                            row_changed = True
                    except Exception as exc:
                        failed += 1
                        print(f"FAIL {model.__name__}.{field} id={getattr(row, 'id', '?')}: {exc}")

                for field in gallery_fields:
                    current = (getattr(row, field, "") or "").strip()
                    if not current:
                        continue
                    keys = _parse_gallery(current)
                    if not keys:
                        continue
                    new_keys: List[str] = []
                    changed_gallery = False
                    for key in keys:
                        try:
                            migrated = await _migrate_single_value(service, key, cache)
                            if not migrated:
                                new_keys.append(key)
                                continue
                            new_key, _thumb_key = migrated
                            new_keys.append(new_key)
                            if new_key != key:
                                changed_gallery = True
                        except Exception as exc:
                            failed += 1
                            new_keys.append(key)
                            print(f"FAIL {model.__name__}.{field} id={getattr(row, 'id', '?')}: {exc}")
                    if changed_gallery:
                        setattr(row, field, _join_gallery(new_keys))
                        row_changed = True

                if row_changed:
                    updated += 1

        await db.commit()

    print(f"DONE. Updated rows: {updated}, failures: {failed}, migrated unique images: {len(cache)}")


if __name__ == "__main__":
    asyncio.run(reoptimize_existing_images())
