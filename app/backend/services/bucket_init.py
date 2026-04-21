"""
Bucket initialization service.
Ensures required storage buckets exist on application startup.
"""
import logging

from services.storage import StorageService
from schemas.storage import BucketRequest

logger = logging.getLogger(__name__)

REQUIRED_BUCKETS = [
    {"bucket_name": "portal-images", "visibility": "public"},
]


async def initialize_buckets():
    """Ensure all required storage buckets exist."""
    try:
        service = StorageService()
    except ValueError as e:
        logger.warning(f"Storage service not configured, skipping bucket init: {e}")
        return

    try:
        existing = await service.list_buckets()
        existing_names = {b.bucket_name for b in existing.buckets}
    except Exception as e:
        logger.warning(f"Failed to list buckets, will attempt creation anyway: {e}")
        existing_names = set()

    for bucket_config in REQUIRED_BUCKETS:
        name = bucket_config["bucket_name"]
        if name in existing_names:
            logger.info(f"Bucket '{name}' already exists")
            continue

        try:
            request = BucketRequest(
                bucket_name=name,
                visibility=bucket_config["visibility"],
            )
            await service.create_bucket(request)
            logger.info(f"Created bucket '{name}' with visibility '{bucket_config['visibility']}'")
        except Exception as e:
            # Bucket might already exist (race condition) or other error
            error_msg = str(e).lower()
            if "already" in error_msg or "exists" in error_msg or "duplicate" in error_msg:
                logger.info(f"Bucket '{name}' already exists (confirmed via error)")
            else:
                logger.error(f"Failed to create bucket '{name}': {e}")