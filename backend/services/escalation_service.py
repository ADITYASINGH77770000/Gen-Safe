"""SLA escalation automation for workflow tasks and processing jobs."""
from datetime import datetime, timedelta

from sqlalchemy import text

from core.config import settings
from services.notifications import notification_service


class EscalationService:
    def __init__(self, db):
        self.db = db

    async def run(self) -> dict:
        escalated_tasks = await self._escalate_overdue_tasks()
        stale_jobs = await self._escalate_stale_processing_jobs()
        return {
            "escalated_tasks": escalated_tasks,
            "stale_processing_jobs": stale_jobs,
        }

    async def _escalate_overdue_tasks(self) -> int:
        cutoff = (
            datetime.utcnow() - timedelta(hours=int(settings.TASK_ESCALATION_HOURS))
        ).isoformat()
        result = await self.db.execute(
            text(
                """
                SELECT task_id, title, owner_email, due_date
                FROM workflow_tasks
                WHERE status='open'
                  AND escalated=0
                  AND due_date IS NOT NULL
                  AND due_date < :cutoff
                """
            ),
            {"cutoff": cutoff},
        )
        rows = result.mappings().all()
        for row in rows:
            await self.db.execute(
                text(
                    """
                    UPDATE workflow_tasks
                    SET escalated=1, status='escalated', updated_at=CURRENT_TIMESTAMP
                    WHERE task_id=:task_id
                    """
                ),
                {"task_id": row["task_id"]},
            )
            await notification_service.send_ops_notification(
                "Task escalated",
                f"Task '{row['title']}' is overdue and escalated.",
                {
                    "task_id": row["task_id"],
                    "owner_email": row.get("owner_email"),
                    "due_date": str(row.get("due_date")),
                },
            )
        await self.db.commit()
        return len(rows)

    async def _escalate_stale_processing_jobs(self) -> int:
        cutoff = (
            datetime.utcnow() - timedelta(minutes=int(settings.PROCESSING_SLA_MINUTES))
        ).isoformat()
        result = await self.db.execute(
            text(
                """
                SELECT job_id, invoice_id, current_step, created_at
                FROM processing_jobs
                WHERE status='processing'
                  AND created_at < :cutoff
                """
            ),
            {"cutoff": cutoff},
        )
        rows = result.mappings().all()
        for row in rows:
            await notification_service.send_ops_notification(
                "Processing SLA breach",
                f"Processing job '{row['job_id']}' exceeded SLA window.",
                {
                    "job_id": row["job_id"],
                    "invoice_id": row.get("invoice_id"),
                    "current_step": row.get("current_step"),
                    "created_at": str(row.get("created_at")),
                },
            )
        return len(rows)
