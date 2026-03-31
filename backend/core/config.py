from pathlib import Path
from typing import Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import os

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    JWT_SECRET: str = "gensafe-secret-key-2024-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    JWT_HARDENED_EXPIRE_MINUTES: int = 120
    ENABLE_SECURITY_HARDENING: bool = False
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000,http://localhost:3001"
    CORS_ALLOW_CREDENTIALS: bool = True
    TRUSTED_HOSTS: str = "localhost,127.0.0.1,testserver"
    SECURITY_HEADERS_ENABLED: bool = True

    # SQLite - no installation needed, file based
    DATABASE_URL: str = "sqlite+aiosqlite:///./gensafe.db"

    # Gemini AI
    GEMINI_API_KEY: str = ""
    GOOGLE_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # Risk thresholds
    RISK_AUTO_APPROVE: float = 25.0
    RISK_HUMAN_REVIEW: float = 60.0
    RISK_AUTO_BLOCK: float = 80.0

    # Upload directory
    UPLOAD_DIR: str = "./static/uploads"
    TESSERACT_CMD: Optional[str] = None

    # Verification / policy controls (default keeps legacy behavior)
    ENABLE_VERIFICATION_RULES: bool = False
    VERIFICATION_HIGH_VALUE_THRESHOLD: float = 10000.0

    # Workflow health monitor thresholds
    PROCESSING_SLA_MINUTES: int = 30
    HEALTH_QUEUE_WARNING: int = 50
    HEALTH_QUEUE_CRITICAL: int = 200
    HEALTH_FAILED_JOBS_WARNING: int = 5
    HEALTH_FAILED_JOBS_CRITICAL: int = 15

    # Job dispatch strategy
    JOB_DISPATCH_MODE: str = "background"  # background|inline

    # Object storage strategy
    OBJECT_STORAGE_MODE: str = "local"  # local|s3
    OBJECT_STORAGE_S3_BUCKET: Optional[str] = None
    OBJECT_STORAGE_S3_PREFIX: str = "invoices/"
    OBJECT_STORAGE_S3_REGION: Optional[str] = None
    OBJECT_STORAGE_PUBLIC_BASE_URL: Optional[str] = None

    # Escalation / workflow automation
    TASK_ESCALATION_HOURS: int = 24
    NOTIFICATION_WEBHOOK_URL: Optional[str] = None
    ENABLE_BACKGROUND_MAINTENANCE: bool = True
    HEALTH_MONITOR_INTERVAL_SECONDS: int = 300
    ESCALATION_SWEEP_INTERVAL_SECONDS: int = 900
    AUDIT_RETENTION_SWEEP_SECONDS: int = 86400
    BASELINE_REFRESH_INTERVAL_SECONDS: int = 86400

    # Audit retention / integrity
    AUDIT_RETENTION_DAYS: int = 365
    ENABLE_AUDIT_RETENTION: bool = False
    ALLOW_AUDIT_PURGE: bool = False
    AUDIT_ARCHIVE_DIR: str = "./static/audit-archive"

    # Cache strategy
    CACHE_MODE: str = "memory"  # memory|redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CONTEXT_CACHE_TTL_SECONDS: int = 300

    model_config = SettingsConfigDict(
        env_file=(
            str(BACKEND_DIR / ".env"),
            str(PROJECT_ROOT / ".env"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def apply_gemini_key_fallback(self):
        # Google AI Studio users often set GOOGLE_API_KEY.
        key = (self.GEMINI_API_KEY or "").strip()
        if not key and self.GOOGLE_API_KEY:
            key = self.GOOGLE_API_KEY.strip()

        # Ignore common placeholder values from .env templates.
        if key.lower() in {"your_gemini_api_key_here", "your_api_key_here", "changeme"}:
            key = ""

        self.GEMINI_API_KEY = key

        if os.getenv("VERCEL"):
            if self.DATABASE_URL == "sqlite+aiosqlite:///./gensafe.db":
                self.DATABASE_URL = "sqlite+aiosqlite:////tmp/gensafe.db"
            if self.UPLOAD_DIR == "./static/uploads":
                self.UPLOAD_DIR = "/tmp/gensafe-uploads"
            if self.AUDIT_ARCHIVE_DIR == "./static/audit-archive":
                self.AUDIT_ARCHIVE_DIR = "/tmp/gensafe-audit-archive"
            self.ENABLE_BACKGROUND_MAINTENANCE = False
        return self

settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
