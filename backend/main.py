"""GenSafe B2B — FastAPI Application (No Docker version)"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import structlog, os

from core.config import settings
from core.database import init_db
from api.routes.all_routes import (
    auth_router, invoice_router, alert_router, supplier_router,
    dashboard_router, task_router, audit_router, webhook_router, ops_router, integration_router
)

logger = structlog.get_logger()


def _split_csv(value: str, fallback: list[str]) -> list[str]:
    items = [part.strip() for part in (value or "").split(",") if part.strip()]
    return items or fallback

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting GenSafe B2B", env=settings.ENVIRONMENT)
    await init_db()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    logger.info("Shutting down")

app = FastAPI(
    title="GenSafe B2B",
    description="Agentic AI Fraud Detection Platform",
    version="1.0.0",
    lifespan=lifespan
)

trusted_hosts = _split_csv(settings.TRUSTED_HOSTS, ["localhost", "127.0.0.1", "testserver"])
cors_origins = _split_csv(settings.CORS_ALLOW_ORIGINS, ["http://localhost:3000", "http://localhost:3001"])

app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)
app.add_middleware(CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS, allow_methods=["*"], allow_headers=["*"])


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

app.include_router(auth_router,      prefix="/api/v1/auth",      tags=["Auth"])
app.include_router(invoice_router,   prefix="/api/v1/invoice",   tags=["Invoices"])
app.include_router(alert_router,     prefix="/api/v1/alert",     tags=["Alerts"])
app.include_router(supplier_router,  prefix="/api/v1/supplier",  tags=["Suppliers"])
app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(task_router,      prefix="/api/v1/task",      tags=["Tasks"])
app.include_router(audit_router,     prefix="/api/v1/audit",     tags=["Audit"])
app.include_router(webhook_router,   prefix="/api/v1/webhook",   tags=["Webhooks"])
app.include_router(ops_router,       prefix="/api/v1/ops",       tags=["Ops"])
app.include_router(integration_router, prefix="/api/v1/integration", tags=["Integrations"])

@app.get("/")
async def root():
    return {"system": "GenSafe B2B", "status": "running", "docs": "/docs"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
