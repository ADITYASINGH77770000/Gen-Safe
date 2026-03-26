"""Workflow health monitor service for queue/SLA/ops visibility."""
from datetime import datetime, timedelta

from sqlalchemy import text

from core.config import settings


class WorkflowHealthService:
    def __init__(self, db):
        self.db = db

    async def get_snapshot(self) -> dict:
        cutoff_24h = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        cutoff_processing = (
            datetime.utcnow() - timedelta(minutes=int(settings.PROCESSING_SLA_MINUTES))
        ).isoformat()
        queued = await self._scalar(
            "SELECT COUNT(*) FROM processing_jobs WHERE status='queued'"
        )
        processing = await self._scalar(
            "SELECT COUNT(*) FROM processing_jobs WHERE status='processing'"
        )
        failed_24h = await self._scalar(
            "SELECT COUNT(*) FROM processing_jobs "
            "WHERE status='failed' AND created_at >= :cutoff_24h",
            {"cutoff_24h": cutoff_24h},
        )
        open_alerts = await self._scalar(
            "SELECT COUNT(*) FROM fraud_alerts WHERE status='open'"
        )
        overdue_processing = await self._scalar(
            "SELECT COUNT(*) FROM processing_jobs "
            "WHERE status='processing' AND created_at < :cutoff_processing",
            {"cutoff_processing": cutoff_processing},
        )
        overdue_tasks = await self._scalar(
            "SELECT COUNT(*) FROM workflow_tasks "
            "WHERE status='open' AND due_date IS NOT NULL AND due_date < :now",
            {"now": datetime.utcnow().isoformat()},
        )
        agent_messages_24h = await self._scalar(
            "SELECT COUNT(*) FROM agent_messages "
            "WHERE created_at >= :cutoff_24h",
            {"cutoff_24h": cutoff_24h},
        )

        queue_depth = queued + processing
        status = "healthy"
        reasons = []

        if queue_depth >= int(settings.HEALTH_QUEUE_CRITICAL):
            status = "critical"
            reasons.append("Queue depth exceeded critical threshold.")
        elif queue_depth >= int(settings.HEALTH_QUEUE_WARNING):
            status = "warning"
            reasons.append("Queue depth exceeded warning threshold.")

        if failed_24h >= int(settings.HEALTH_FAILED_JOBS_CRITICAL):
            status = "critical"
            reasons.append("Failed jobs in last 24h exceeded critical threshold.")
        elif failed_24h >= int(settings.HEALTH_FAILED_JOBS_WARNING) and status != "critical":
            status = "warning"
            reasons.append("Failed jobs in last 24h exceeded warning threshold.")

        if overdue_processing > 0:
            status = "critical"
            reasons.append("At least one processing job breached SLA window.")

        if overdue_tasks > 0 and status == "healthy":
            status = "warning"
            reasons.append("There are overdue workflow tasks requiring follow-up.")

        if not reasons:
            reasons.append("All health metrics are within configured thresholds.")

        return {
            "status": status,
            "metrics": {
                "queue_depth": queue_depth,
                "queued_jobs": queued,
                "processing_jobs": processing,
                "failed_jobs_last_24h": failed_24h,
                "open_alerts": open_alerts,
                "overdue_processing_jobs": overdue_processing,
                "overdue_tasks": overdue_tasks,
                "agent_messages_last_24h": agent_messages_24h,
            },
            "thresholds": {
                "processing_sla_minutes": int(settings.PROCESSING_SLA_MINUTES),
                "queue_warning": int(settings.HEALTH_QUEUE_WARNING),
                "queue_critical": int(settings.HEALTH_QUEUE_CRITICAL),
                "failed_jobs_warning": int(settings.HEALTH_FAILED_JOBS_WARNING),
                "failed_jobs_critical": int(settings.HEALTH_FAILED_JOBS_CRITICAL),
            },
            "reasons": reasons,
        }

    async def _scalar(self, sql: str, params: dict | None = None) -> int:
        result = await self.db.execute(text(sql), params or {})
        return int(result.scalar() or 0)
