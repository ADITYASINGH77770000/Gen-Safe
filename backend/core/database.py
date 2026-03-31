import os

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from core.config import settings
import structlog

logger = structlog.get_logger()
def _public_base_url() -> str:
    host = (os.getenv("PUBLIC_APP_URL") or os.getenv("VERCEL_URL") or "").strip()
    if host and not host.startswith("http"):
        host = f"https://{host}"
    return host.rstrip("/")

_is_sqlite = settings.DATABASE_URL.lower().startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT,
                role TEXT DEFAULT 'analyst',
                password_hash TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS suppliers (
                supplier_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                address TEXT,
                country TEXT,
                vat_number TEXT,
                bank_account_iban TEXT,
                bank_name TEXT,
                currency TEXT DEFAULT 'USD',
                risk_level TEXT DEFAULT 'unknown',
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS invoices (
                invoice_id TEXT PRIMARY KEY,
                supplier_id TEXT,
                invoice_number TEXT,
                amount REAL,
                currency TEXT DEFAULT 'USD',
                invoice_date TEXT,
                due_date TEXT,
                local_file_path TEXT,
                document_url TEXT,
                extracted_text TEXT,
                status TEXT DEFAULT 'pending',
                risk_score REAL,
                risk_level TEXT,
                processing_job_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS processing_jobs (
                job_id TEXT PRIMARY KEY,
                invoice_id TEXT,
                status TEXT DEFAULT 'queued',
                progress INTEGER DEFAULT 0,
                current_step TEXT,
                result TEXT,
                error_message TEXT,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS fraud_alerts (
                alert_id TEXT PRIMARY KEY,
                invoice_id TEXT,
                supplier_id TEXT,
                risk_score REAL,
                risk_level TEXT,
                layer_triggered TEXT,
                flags TEXT DEFAULT '[]',
                explanation_text TEXT,
                recommended_action TEXT,
                status TEXT DEFAULT 'open',
                analyst_id TEXT,
                analyst_note TEXT,
                resolved_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS model_feedback (
                feedback_id TEXT PRIMARY KEY,
                alert_id TEXT,
                invoice_id TEXT,
                was_correct INTEGER,
                analyst_note TEXT,
                feedback_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_decisions (
                id TEXT PRIMARY KEY,
                trace_id TEXT NOT NULL,
                invoice_id TEXT,
                agent_id TEXT NOT NULL,
                action TEXT NOT NULL,
                input_hash TEXT,
                output_hash TEXT,
                input_data TEXT,
                output_data TEXT,
                reason_text TEXT,
                status TEXT DEFAULT 'completed',
                duration_ms INTEGER,
                was_overridden INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_messages (
                message_id TEXT PRIMARY KEY,
                trace_id TEXT NOT NULL,
                from_agent TEXT NOT NULL,
                to_agent TEXT NOT NULL,
                message_type TEXT NOT NULL,
                payload TEXT,
                retry_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'published',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS workflow_tasks (
                task_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                owner_email TEXT,
                owner_name TEXT,
                due_date TEXT,
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'open',
                source TEXT,
                source_ref TEXT,
                escalated INTEGER DEFAULT 0,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS supplier_baselines (
                baseline_id TEXT PRIMARY KEY,
                supplier_id TEXT,
                avg_invoice_amount REAL,
                stddev_amount REAL,
                avg_monthly_invoices REAL,
                typical_iban TEXT,
                invoice_count INTEGER DEFAULT 0,
                computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        # Safe schema upgrades for existing databases.
        await _ensure_column(conn, "invoices", "document_url TEXT")
        await _ensure_column(conn, "agent_decisions", "previous_hash TEXT")
        await _ensure_column(conn, "agent_decisions", "record_hash TEXT")
        await _ensure_column(conn, "agent_messages", "previous_hash TEXT")
        await _ensure_column(conn, "agent_messages", "record_hash TEXT")

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS erp_integrations (
                provider TEXT PRIMARY KEY,
                client_id TEXT,
                client_secret TEXT,
                auth_url TEXT,
                token_url TEXT,
                scopes TEXT,
                redirect_uri TEXT,
                enabled INTEGER DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS erp_oauth_states (
                state TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                consumed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS erp_tokens (
                provider TEXT PRIMARY KEY,
                access_token TEXT,
                refresh_token TEXT,
                token_type TEXT,
                scope TEXT,
                expires_at TIMESTAMP,
                raw_json TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        await _seed_defaults(conn)

    logger.info("Database initialized successfully")


async def _ensure_column(conn, table: str, column_ddl: str):
    try:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column_ddl}"))
    except Exception:
        # Column probably already exists; ignore to keep init idempotent.
        pass


async def _insert_if_missing(conn, sql: str, params: dict):
    try:
        await conn.execute(text(sql), params)
    except Exception:
        # Unique constraint hit or seed already present.
        pass


async def _seed_defaults(conn):
    import bcrypt

    _hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
    await _insert_if_missing(
        conn,
        """
        INSERT INTO users (user_id, email, full_name, role, password_hash)
        VALUES (:id, :email, :name, :role, :hash)
        """,
        {
            "id": "admin-001",
            "email": "admin@gensafe.com",
            "name": "GenSafe Admin",
            "role": "admin",
            "hash": _hash,
        },
    )

    suppliers = [
        {
            "id": "sup-001",
            "name": "TechSupplies Ltd",
            "email": "billing@techsupplies.com",
            "country": "Germany",
            "iban": "DE89370400440532013000",
            "currency": "EUR",
            "risk": "low",
        },
        {
            "id": "sup-002",
            "name": "GlobalTrade Corp",
            "email": "invoices@globaltrade.io",
            "country": "United Kingdom",
            "iban": "GB29NWBK60161331926819",
            "currency": "GBP",
            "risk": "low",
        },
        {
            "id": "sup-003",
            "name": "FastLogistics Inc",
            "email": "ap@fastlogistics.com",
            "country": "United States",
            "iban": "US00000000000000000001",
            "currency": "USD",
            "risk": "medium",
        },
        {
            "id": "sup-004",
            "name": "SuspectVendor Co",
            "email": "pay@suspectvendor.net",
            "country": "Unknown",
            "iban": "XX00000000000000000099",
            "currency": "USD",
            "risk": "high",
        },
    ]
    for row in suppliers:
        await _insert_if_missing(
            conn,
            """
            INSERT INTO suppliers
                (supplier_id, name, email, country, bank_account_iban, currency, risk_level)
            VALUES
                (:id, :name, :email, :country, :iban, :currency, :risk)
            """,
            row,
        )

    public_base_url = _public_base_url()
    integrations = [
        {
            "provider": "quickbooks",
            "auth_url": "https://appcenter.intuit.com/connect/oauth2",
            "token_url": "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
            "scopes": "com.intuit.quickbooks.accounting",
            "redirect_uri": f"{public_base_url}/api/v1/integration/quickbooks/callback"
            if public_base_url
            else "http://localhost:8000/api/v1/integration/quickbooks/callback",
        },
        {
            "provider": "xero",
            "auth_url": "https://login.xero.com/identity/connect/authorize",
            "token_url": "https://identity.xero.com/connect/token",
            "scopes": "openid profile email accounting.transactions offline_access",
            "redirect_uri": f"{public_base_url}/api/v1/integration/xero/callback"
            if public_base_url
            else "http://localhost:8000/api/v1/integration/xero/callback",
        },
    ]
    for row in integrations:
        await _insert_if_missing(
            conn,
            """
            INSERT INTO erp_integrations
                (provider, auth_url, token_url, scopes, redirect_uri, enabled)
            VALUES
                (:provider, :auth_url, :token_url, :scopes, :redirect_uri, 1)
            """,
            row,
        )
