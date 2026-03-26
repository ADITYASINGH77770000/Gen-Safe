"""Notification abstraction for escalation events."""
import json

import httpx
import structlog

from core.config import settings

logger = structlog.get_logger()


class NotificationService:
    async def send_ops_notification(self, title: str, body: str, metadata: dict | None = None):
        payload = {
            "title": title,
            "body": body,
            "metadata": metadata or {},
        }
        url = (settings.NOTIFICATION_WEBHOOK_URL or "").strip()
        if not url:
            logger.info("Notification (log-only)", payload=payload)
            return {"status": "logged"}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
            return {"status": "sent"}
        except Exception as exc:
            logger.error("Notification send failed", error=str(exc), webhook=url)
            return {"status": "failed", "error": str(exc)}


notification_service = NotificationService()
