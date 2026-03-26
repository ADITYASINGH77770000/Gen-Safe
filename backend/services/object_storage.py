"""Object storage abstraction with local-first behavior."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import structlog

from core.config import settings

logger = structlog.get_logger()


class ObjectStorageService:
    def __init__(self):
        self.mode = (settings.OBJECT_STORAGE_MODE or "local").lower()

    def archive_file(self, local_path: str, object_name: str) -> Optional[str]:
        """Archive local file to object storage and return public/object URL if available."""
        if self.mode != "s3":
            return None

        bucket = settings.OBJECT_STORAGE_S3_BUCKET
        if not bucket:
            logger.warning("Object storage skipped: S3 bucket is not configured")
            return None

        try:
            import boto3  # Optional dependency
        except Exception:
            logger.warning("Object storage skipped: boto3 is not installed")
            return None

        source = Path(local_path)
        if not source.exists():
            logger.warning("Object storage skipped: source file missing", path=local_path)
            return None

        prefix = (settings.OBJECT_STORAGE_S3_PREFIX or "invoices/").strip("/")
        key = f"{prefix}/{object_name}"

        try:
            client = boto3.client("s3", region_name=settings.OBJECT_STORAGE_S3_REGION or None)
            client.upload_file(str(source), bucket, key)
            if settings.OBJECT_STORAGE_PUBLIC_BASE_URL:
                base = settings.OBJECT_STORAGE_PUBLIC_BASE_URL.rstrip("/")
                return f"{base}/{key}"
            region = settings.OBJECT_STORAGE_S3_REGION or "us-east-1"
            return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        except Exception as exc:
            logger.error(
                "Object storage upload failed",
                error=str(exc),
                bucket=bucket,
                key=key,
            )
            return None


object_storage = ObjectStorageService()
