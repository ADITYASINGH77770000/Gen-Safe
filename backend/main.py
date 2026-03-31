"""GenSafe B2B - FastAPI Application (No Docker version)"""
import asyncio
import os
import sys
from contextlib import asynccontextmanager, suppress
from datetime import datetime
from pathlib import Path


def _prepend_project_venv() -> None:
    """Make sure the app can import dependencies from backend/.venv.

    This keeps the backend runnable even when the IDE launches the system
    interpreter instead of the project virtual environment.
    """
    venv_site_packages = Path(__file__).resolve().parent / ".venv" / "Lib" / "site-packages"
    if venv_site_packages.is_dir():
        path = str(venv_site_packages)
        if path not in sys.path:
            sys.path.insert(0, path)


_prepend_project_venv()

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes.all_routes import (
    alert_router,
    audit_router,
    auth_router,
    dashboard_router,
    health_router,
    integration_router,
    invoice_router,
    ops_router,
    selfcorrect_router,
    supplier_router,
    task_router,
    webhook_router,
)
from core.config import settings
from core.database import AsyncSessionLocal, init_db
from services.agents.health_monitor import WorkflowHealthMonitor
from services.agents.self_correction_agent import SelfCorrectionAgent
from services.audit_maintenance import AuditMaintenanceService
from services.escalation_service import EscalationService

logger = structlog.get_logger()


def _split_csv(value: str, fallback: list[str]) -> list[str]:
    items = [part.strip() for part in (value or "").split(",") if part.strip()]
    return items or fallback


async def _maintenance_loop():
    logger.info("Background maintenance loop started")
    last_health = 0.0
    last_escalation = 0.0
    last_retention = 0.0
    last_baselines = 0.0
    while True:
        try:
            now = datetime.utcnow().timestamp()
            async with AsyncSessionLocal() as db:
                if now - last_health >= float(settings.HEALTH_MONITOR_INTERVAL_SECONDS):
                    await WorkflowHealthMonitor(db).run_health_check()
                    last_health = now
                if now - last_escalation >= float(settings.ESCALATION_SWEEP_INTERVAL_SECONDS):
                    await EscalationService(db).run()
                    last_escalation = now
                if now - last_retention >= float(settings.AUDIT_RETENTION_SWEEP_SECONDS):
                    audit = AuditMaintenanceService(db)
                    if settings.ENABLE_AUDIT_RETENTION and settings.ALLOW_AUDIT_PURGE:
                        await audit.export_and_purge()
                    else:
                        await audit.retention_preview()
                    last_retention = now
                if now - last_baselines >= float(settings.BASELINE_REFRESH_INTERVAL_SECONDS):
                    await SelfCorrectionAgent(db).compute_supplier_baselines()
                    last_baselines = now
        except asyncio.CancelledError:
            logger.info("Background maintenance loop stopping")
            raise
        except Exception as exc:
            logger.error("Background maintenance loop error", error=str(exc))
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting GenSafe B2B", env=settings.ENVIRONMENT)
    await init_db()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    maintenance_task = None
    if settings.ENABLE_BACKGROUND_MAINTENANCE:
        maintenance_task = asyncio.create_task(_maintenance_loop())
    yield
    if maintenance_task:
        maintenance_task.cancel()
        with suppress(asyncio.CancelledError):
            await maintenance_task
    logger.info("Shutting down")


app = FastAPI(
    title="GenSafe B2B",
    description="Agentic AI Fraud Detection Platform",
    version="1.0.0",
    lifespan=lifespan,
)

trusted_hosts = _split_csv(settings.TRUSTED_HOSTS, ["localhost", "127.0.0.1", "testserver"])
cors_origins = _split_csv(settings.CORS_ALLOW_ORIGINS, ["http://localhost:3000", "http://localhost:3001"])

app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    if settings.SECURITY_HEADERS_ENABLED:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cache-Control", "no-store")
    return response


os.makedirs("static/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="static/uploads"), name="uploads")

app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(invoice_router, prefix="/api/v1/invoice", tags=["Invoices"])
app.include_router(alert_router, prefix="/api/v1/alert", tags=["Alerts"])
app.include_router(supplier_router, prefix="/api/v1/supplier", tags=["Suppliers"])
app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(task_router, prefix="/api/v1/task", tags=["Tasks"])
app.include_router(audit_router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(webhook_router, prefix="/api/v1/webhook", tags=["Webhooks"])
app.include_router(ops_router, prefix="/api/v1/ops", tags=["Ops"])
app.include_router(integration_router, prefix="/api/v1/integration", tags=["Integrations"])
app.include_router(health_router, prefix="/api/v1/health", tags=["Health Monitor"])
app.include_router(selfcorrect_router, prefix="/api/v1/selfcorrect", tags=["Self Correction"])


@app.get("/")
async def root():
    return {"system": "GenSafe B2B", "status": "running", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
