"""Job dispatch abstraction for pipeline execution."""
import asyncio

import structlog
from fastapi import BackgroundTasks

from core.config import settings
from core.database import AsyncSessionLocal
from services.agents.orchestrator import OrchestratorAgent

logger = structlog.get_logger()


async def process_invoice_job(invoice_id: str, job_id: str):
    async with AsyncSessionLocal() as db:
        try:
            orchestrator = OrchestratorAgent(db)
            await orchestrator.process_invoice(invoice_id, job_id)
        except Exception as exc:
            logger.error("Pipeline failed", error=str(exc), invoice_id=invoice_id, job_id=job_id)


def dispatch_invoice_job(background_tasks: BackgroundTasks, invoice_id: str, job_id: str):
    mode = (settings.JOB_DISPATCH_MODE or "background").lower()
    if mode == "inline":
        asyncio.create_task(process_invoice_job(invoice_id, job_id))
        return
    background_tasks.add_task(process_invoice_job, invoice_id, job_id)
