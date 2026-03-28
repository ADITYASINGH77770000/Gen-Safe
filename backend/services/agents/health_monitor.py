"""Workflow Health Monitor Agent.

Runs in-process checks for stuck jobs, overdue work, and SLA breaches.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from sqlalchemy import text

from core.config import settings

logger = structlog.get_logger()


class WorkflowHealthMonitor:
    THRESHOLDS = {
        "job_sla_minutes": 10,
        "task_overdue_hours": 24,
        "high_risk_alert_minutes": 5,
        "stuck_job_minutes": int(settings.PROCESSING_SLA_MINUTES),
    }

    def __init__(self, db):
        self.db = db

    async def run_health_check(self) -> dict:
        results = {
            "checked_at": datetime.utcnow().isoformat(),
            "issues": [],
            "escalations": [],
            "stats": {},
        }
        await self._check_stuck_jobs(results)
        await self._check_sla_timers(results)
        await self._check_overdue_tasks(results)
        await self._check_unattended_critical_alerts(results)
        await self._gather_pipeline_stats(results)
        return results

    async def _check_stuck_jobs(self, results: dict):
        threshold = datetime.utcnow() - timedelta(minutes=self.THRESHOLDS["stuck_job_minutes"])
        result = await self.db.execute(
            text(
                """
                SELECT job_id, invoice_id, status, current_step, started_at, created_at
                FROM processing_jobs
                WHERE status = 'processing'
                  AND COALESCE(started_at, created_at) < :threshold
                """
            ),
            {"threshold": threshold.isoformat()},
        )
        rows = result.mappings().all()
        for row in rows:
            issue = {
                "type": "stuck_job",
                "severity": "high",
                "message": (
                    f"Job {row['job_id']} stuck at step '{row['current_step']}' for "
                    f">{self.THRESHOLDS['stuck_job_minutes']} min"
                ),
                "job_id": str(row["job_id"]),
                "invoice_id": str(row["invoice_id"]),
                "started_at": str(row.get("started_at") or row.get("created_at")),
            }
            results["issues"].append(issue)
            logger.warning("Stuck job detected", **issue)
            await self.db.execute(
                text(
                    """
                    UPDATE processing_jobs
                    SET status = 'failed',
                        error_message = 'Auto-failed by health monitor: exceeded processing SLA'
                    WHERE job_id = :jid AND status = 'processing'
                    """
                ),
                {"jid": str(row["job_id"])},
            )
            await self.db.execute(
                text("UPDATE invoices SET status='failed' WHERE processing_job_id = :jid"),
                {"jid": str(row["job_id"])},
            )
        await self.db.commit()

    async def _check_sla_timers(self, results: dict):
        threshold = datetime.utcnow() - timedelta(minutes=self.THRESHOLDS["job_sla_minutes"])
        result = await self.db.execute(
            text(
                """
                SELECT invoice_id, status, created_at
                FROM invoices
                WHERE status = 'pending'
                  AND created_at < :threshold
                """
            ),
            {"threshold": threshold.isoformat()},
        )
        rows = result.mappings().all()
        for row in rows:
            issue = {
                "type": "sla_breach",
                "severity": "critical",
                "message": (
                    f"Invoice {row['invoice_id']} has been pending for more than "
                    f"{self.THRESHOLDS['job_sla_minutes']} minutes."
                ),
                "invoice_id": str(row["invoice_id"]),
            }
            results["issues"].append(issue)
            results["escalations"].append(issue)
            logger.error("SLA breach", **issue)

    async def _check_overdue_tasks(self, results: dict):
        now = datetime.utcnow().date().isoformat()
        result = await self.db.execute(
            text(
                """
                SELECT task_id, title, owner_name, due_date, escalated
                FROM workflow_tasks
                WHERE status = 'open'
                  AND due_date IS NOT NULL
                  AND due_date < :now
                """
            ),
            {"now": now},
        )
        rows = result.mappings().all()
        for row in rows:
            if not row["escalated"]:
                await self.db.execute(
                    text(
                        """
                        UPDATE workflow_tasks
                        SET escalated = 1, updated_at = CURRENT_TIMESTAMP
                        WHERE task_id = :tid
                        """
                    ),
                    {"tid": str(row["task_id"])},
                )
                issue = {
                    "type": "overdue_task",
                    "severity": "medium",
                    "message": (
                        f"Task '{row['title']}' owned by '{row['owner_name']}' is overdue "
                        f"(due: {row['due_date']})"
                    ),
                    "task_id": str(row["task_id"]),
                }
                results["issues"].append(issue)
                results["escalations"].append(issue)
                logger.warning("Overdue task escalated", **issue)
        await self.db.commit()

    async def _check_unattended_critical_alerts(self, results: dict):
        threshold = datetime.utcnow() - timedelta(minutes=self.THRESHOLDS["high_risk_alert_minutes"])
        result = await self.db.execute(
            text(
                """
                SELECT alert_id, risk_level, supplier_id, created_at
                FROM fraud_alerts
                WHERE status = 'open'
                  AND risk_level IN ('critical', 'high')
                  AND created_at < :threshold
                """
            ),
            {"threshold": threshold.isoformat()},
        )
        rows = result.mappings().all()
        for row in rows:
            issue = {
                "type": "unattended_critical_alert",
                "severity": "high",
                "message": (
                    f"Critical/high-risk alert {row['alert_id']} has been open for more than "
                    f"{self.THRESHOLDS['high_risk_alert_minutes']} minutes."
                ),
                "alert_id": str(row["alert_id"]),
            }
            results["issues"].append(issue)
            logger.warning("Unattended critical alert", **issue)

    async def _gather_pipeline_stats(self, results: dict):
        try:
            cutoff_1h = (datetime.utcnow() - timedelta(hours=1)).isoformat()
            total = (await self.db.execute(text("SELECT COUNT(*) FROM invoices"))).scalar() or 0
            pending = (await self.db.execute(text("SELECT COUNT(*) FROM invoices WHERE status='pending'"))).scalar() or 0
            active = (await self.db.execute(text("SELECT COUNT(*) FROM processing_jobs WHERE status='processing'"))).scalar() or 0
            open_alerts = (await self.db.execute(text("SELECT COUNT(*) FROM fraud_alerts WHERE status='open'"))).scalar() or 0
            avg_ms = (
                await self.db.execute(
                    text(
                        """
                        SELECT AVG(duration_ms)
                        FROM agent_decisions
                        WHERE created_at >= :cutoff AND duration_ms IS NOT NULL
                        """
                    ),
                    {"cutoff": cutoff_1h},
                )
            ).scalar() or 0

            results["stats"] = {
                "total_invoices": int(total),
                "pending_invoices": int(pending),
                "active_jobs": int(active),
                "open_alerts": int(open_alerts),
                "avg_agent_latency_ms": round(float(avg_ms), 1),
                "health_status": "degraded" if results["issues"] else "healthy",
            }
        except Exception as exc:
            logger.error("Stats gather failed", error=str(exc))
            results["stats"] = {"health_status": "unknown"}
