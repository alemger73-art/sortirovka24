import base64
import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import unquote, urlparse

import cloudinary
import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
from core.config import settings
from schemas.storage import (
    BucketInfo,
    BucketListResponse,
    BucketRequest,
    BucketResponse,
    DeleteResponse,
    FileUpDownRequest,
    FileUpDownResponse,
    ObjectInfo,
    ObjectListResponse,
    ObjectRequest,
    OSSBaseModel,
    RenameRequest,
    RenameResponse,
)

logger = logging.getLogger(__name__)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _parse_cloudinary_url(raw_url: str) -> tuple[str, str, str]:
    """Parse CLOUDINARY_URL format: cloudinary://api_key:api_secret@cloud_name"""
    try:
        cleaned = (raw_url or "").strip()
        parsed = urlparse(cleaned)
        if parsed.scheme.lower() != "cloudinary":
            return "", "", ""
        cloud_name = (parsed.hostname or "").strip()
        api_key = unquote((parsed.username or "").strip())
        api_secret = unquote((parsed.password or "").strip())
        return cloud_name, api_key, api_secret
    except Exception:
        return "", "", ""


def _clean_env_value(value: str) -> str:
    v = (value or "").strip()
    # Handle values pasted with quotes in deployment dashboards.
    if len(v) >= 2 and ((v[0] == '"' and v[-1] == '"') or (v[0] == "'" and v[-1] == "'")):
        v = v[1:-1].strip()
    return v


def _env_ci(name: str) -> str:
    """Case-insensitive env lookup."""
    direct = os.getenv(name)
    if direct:
        return _clean_env_value(direct)
    lowered = name.lower()
    for key, value in os.environ.items():
        if key.lower() == lowered:
            return _clean_env_value(value)
    return ""


def _split_public_id_and_format(object_key: str) -> tuple[str, Optional[str]]:
    """
    Cloudinary upload signatures are more stable when extension is passed as `format`
    and `public_id` does not include it.
    """
    key = (object_key or "").strip().lstrip("/")
    if not key:
        return "", None
    if "." not in key:
        return key, None
    base, ext = key.rsplit(".", 1)
    safe_ext = ext.lower()
    if not base or not safe_ext.isalnum() or len(safe_ext) > 10:
        return key, None
    return base, safe_ext


def _resolve_cloudinary_config() -> tuple[str, str, str]:
    """Resolve Cloudinary config from settings + env aliases."""
    # Prefer standard single-variable config when present to avoid key/secret mismatch.
    url_cloud, url_key, url_secret = _parse_cloudinary_url(_env_ci("CLOUDINARY_URL"))
    if url_cloud and url_key and url_secret:
        return url_cloud, url_key, url_secret

    cloud_name = _env_ci("CLOUDINARY_CLOUD_NAME") or _clean_env_value(getattr(settings, "cloudinary_cloud_name", "") or "")
    api_key = _env_ci("CLOUDINARY_API_KEY") or _clean_env_value(getattr(settings, "cloudinary_api_key", "") or "")
    api_secret = _env_ci("CLOUDINARY_API_SECRET") or _clean_env_value(getattr(settings, "cloudinary_api_secret", "") or "")

    # Common aliases used in different deployment setups.
    cloud_name = cloud_name or _env_ci("CLOUD_NAME") or _env_ci("VITE_CLOUDINARY_CLOUD_NAME")
    api_key = api_key or _env_ci("CLOUD_API_KEY") or _env_ci("VITE_CLOUDINARY_API_KEY")
    api_secret = api_secret or _env_ci("CLOUD_API_SECRET") or _env_ci("VITE_CLOUDINARY_API_SECRET")

    return cloud_name, api_key, api_secret


class StorageService:
    """Storage service backed by Cloudinary."""

    def __init__(self):
        self.cloud_name = ""
        self.api_key = ""
        self.api_secret = ""

        cloudinary_url = _env_ci("CLOUDINARY_URL")
        if cloudinary_url:
            # Let Cloudinary SDK parse CLOUDINARY_URL directly (more reliable for special chars).
            cloudinary.config(cloudinary_url=cloudinary_url, secure=True)
            cfg = cloudinary.config()
            self.cloud_name = _clean_env_value(str(getattr(cfg, "cloud_name", "") or ""))
            self.api_key = _clean_env_value(str(getattr(cfg, "api_key", "") or ""))
            self.api_secret = _clean_env_value(str(getattr(cfg, "api_secret", "") or ""))
        else:
            self.cloud_name, self.api_key, self.api_secret = _resolve_cloudinary_config()

        if not self.cloud_name or not self.api_key or not self.api_secret:
            logger.error(
                "Cloudinary config missing: cloud_name=%s api_key=%s api_secret=%s",
                bool(self.cloud_name),
                bool(self.api_key),
                bool(self.api_secret),
            )
            raise ValueError(
                "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, "
                "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET "
                "(or CLOUDINARY_URL)."
            )

        # Re-apply explicit config to ensure SDK uses normalized values.
        cloudinary.config(cloud_name=self.cloud_name, api_key=self.api_key, api_secret=self.api_secret, secure=True)

    def _make_upload_token(self, bucket_name: str, object_key: str, expires_in_seconds: int = 15 * 60) -> str:
        payload = {
            "bucket_name": bucket_name,
            "object_key": object_key,
            "exp": int(time.time()) + expires_in_seconds,
        }
        payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        payload_b64 = _b64url_encode(payload_json)
        signature = hmac.new(self.api_secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
        return f"{payload_b64}.{_b64url_encode(signature)}"

    def _parse_upload_token(self, token: str) -> dict:
        try:
            payload_b64, sig_b64 = token.split(".", 1)
        except ValueError as exc:
            raise ValueError("Invalid upload token format") from exc

        expected = hmac.new(self.api_secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
        provided = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected, provided):
            raise ValueError("Invalid upload token signature")

        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("Upload token has expired")
        return payload

    def _build_proxy_upload_url(self, token: str) -> str:
        return f"/api/v1/storage/upload-proxy/{token}"

    def _cloudinary_url(self, object_key: str) -> str:
        public_id, fmt = _split_public_id_and_format(object_key)
        if not public_id:
            public_id = object_key
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            resource_type="auto",
            type="upload",
            secure=True,
            format=fmt,
        )
        return url

    async def create_bucket(self, request: BucketRequest) -> BucketResponse:
        # Cloudinary doesn't require explicit bucket creation. Keep API compatibility.
        return BucketResponse(
            bucket_name=request.bucket_name,
            visibility=request.visibility,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    async def list_buckets(self) -> BucketListResponse:
        return BucketListResponse(
            buckets=[BucketInfo(bucket_name="portal-images", visibility="public")]
        )

    async def list_objects(self, request: OSSBaseModel) -> ObjectListResponse:
        # Lightweight compatibility implementation (Cloudinary has no bucket primitive).
        return ObjectListResponse(objects=[])

    async def get_object_info(self, request: ObjectRequest) -> ObjectInfo:
        try:
            result = cloudinary.api.resource(request.object_key, resource_type="image")
            return ObjectInfo(
                bucket_name=request.bucket_name,
                object_key=request.object_key,
                size=int(result.get("bytes", 0)),
                last_modified=str(result.get("created_at", "")),
                etag=str(result.get("etag", "")),
            )
        except Exception as e:
            logger.error(f"Failed to get object metadata: {e}")
            raise

    async def rename_object(self, request: RenameRequest) -> dict:
        try:
            cloudinary.uploader.rename(
                request.source_key,
                request.target_key,
                overwrite=request.overwrite_key,
                resource_type="image",
                invalidate=True,
            )
            return RenameResponse(success=True)
        except Exception as e:
            logger.error(f"Failed to rename object: {e}")
            raise

    async def delete_object(self, request: ObjectRequest) -> DeleteResponse:
        # Try all resource types for compatibility with mixed uploads.
        for resource_type in ("image", "video", "raw"):
            try:
                cloudinary.uploader.destroy(request.object_key, resource_type=resource_type, invalidate=True)
            except Exception:
                continue
        return DeleteResponse(success=True)

    async def create_upload_url(self, request: FileUpDownRequest) -> FileUpDownResponse:
        token = self._make_upload_token(request.bucket_name, request.object_key)
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        return FileUpDownResponse(
            upload_url=self._build_proxy_upload_url(token),
            expires_at=expires_at,
        )

    async def create_download_url(self, request: FileUpDownRequest) -> FileUpDownResponse:
        url = self._cloudinary_url(request.object_key)
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        return FileUpDownResponse(download_url=url, expires_at=expires_at)

    async def upload_via_token(self, token: str, file_bytes: bytes, content_type: Optional[str] = None) -> str:
        payload = self._parse_upload_token(token)
        object_key = payload["object_key"]
        public_id, fmt = _split_public_id_and_format(object_key)
        if not public_id:
            raise ValueError("Invalid object key for upload")
        resource_type = "auto"
        if content_type and content_type.startswith("video/"):
            resource_type = "video"
        try:
            result = cloudinary.uploader.upload(
                file_bytes,
                public_id=public_id,
                format=fmt,
                resource_type=resource_type,
                overwrite=True,
                invalidate=True,
                unique_filename=False,
            )
        except Exception:
            # Fallback for uncommon mime/resource combinations
            result = cloudinary.uploader.upload(
                file_bytes,
                public_id=public_id,
                format=fmt,
                resource_type="auto",
                overwrite=True,
                invalidate=True,
                unique_filename=False,
            )
        return str(result.get("secure_url") or self._cloudinary_url(object_key))
