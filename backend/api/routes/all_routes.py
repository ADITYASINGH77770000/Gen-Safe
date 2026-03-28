"""All API routes — auth, invoices, alerts, suppliers, dashboard, tasks, audit, webhooks"""
import asyncio
import uuid, json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, Any
import structlog

from core.config import settings
from core.database import get_db, AsyncSessionLocal
from core.auth import verify_password, create_token, get_current_user
from services.document_processor import process_document, save_file_with_metadata, parse_invoice_fields
from services.gemini_service import extract_meeting_items
from services.workflow_health import WorkflowHealthService
from services.job_dispatcher import dispatch_invoice_job
from services.escalation_service import EscalationService
from services.agent_bus import AgentBus
from services.erp_oauth_service import ERPOAuthService
from services.audit_maintenance import AuditMaintenanceService
from services.agents.health_monitor import WorkflowHealthMonitor
from services.agents.self_correction_agent import SelfCorrectionAgent

logger = structlog.get_logger()

# â”€â”€ OPS / HEALTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ops_router = APIRouter()
integration_router = APIRouter()
health_router = APIRouter()
selfcorrect_router = APIRouter()


class IntegrationConfigIn(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None
    scopes: Optional[str] = None
    enabled: Optional[bool] = None

@ops_router.get("/health")
async def workflow_health(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = WorkflowHealthService(db)
    return await service.get_snapshot()

@ops_router.get("/security")
async def security_posture(current_user: dict = Depends(get_current_user)):
    return {
        "security_hardening_enabled": bool(settings.ENABLE_SECURITY_HARDENING),
        "jwt_expires_minutes": int(min(settings.JWT_EXPIRE_MINUTES, settings.JWT_HARDENED_EXPIRE_MINUTES))
        if settings.ENABLE_SECURITY_HARDENING
        else int(settings.JWT_EXPIRE_MINUTES),
        "cors_allow_origins": [part.strip() for part in (settings.CORS_ALLOW_ORIGINS or "").split(",") if part.strip()],
        "trusted_hosts": [part.strip() for part in (settings.TRUSTED_HOSTS or "").split(",") if part.strip()],
        "security_headers_enabled": bool(settings.SECURITY_HEADERS_ENABLED),
        "audit_retention_days": int(settings.AUDIT_RETENTION_DAYS),
        "audit_retention_enabled": bool(settings.ENABLE_AUDIT_RETENTION),
    }


@ops_router.get("/ocr-status")
async def ocr_status(current_user: dict = Depends(get_current_user)):
    from services import document_processor as dp

    configured_cmd = getattr(dp.pytesseract.pytesseract, "tesseract_cmd", None) or ""
    resolved = bool(configured_cmd)
    version = None
    error = None
    try:
        version = str(dp.pytesseract.get_tesseract_version())
    except Exception as exc:
        error = str(exc)

    return {
        "configured": resolved,
        "command": configured_cmd,
        "version": version,
        "available": version is not None,
        "error": error,
        "notes": "Upload a PDF/PNG/JPG/TXT invoice to exercise OCR through the invoice pipeline.",
    }


@ops_router.get("/ocr-test")
async def ocr_test(current_user: dict = Depends(get_current_user)):
    from services import document_processor as dp

    configured_cmd = getattr(dp.pytesseract.pytesseract, "tesseract_cmd", None) or ""
    version = None
    try:
        version = str(dp.pytesseract.get_tesseract_version())
    except Exception as exc:
        return {
            "available": False,
            "configured": bool(configured_cmd),
            "command": configured_cmd,
            "version": None,
            "sample_text": "GENSAFE OCR TEST SAMPLE INVOICE\nInvoice No: OCR-TEST-1001\nSupplier: Sample Supplies Ltd\nAmount: 1285.40 USD\nReference: OCR smoke test",
            "extracted_text": "",
            "image_data_url": None,
            "passed": False,
            "error": str(exc),
        }

    try:
        import base64
        import io
        import re
        from PIL import Image, ImageDraw, ImageFont

        sample_text = (
            "GENSAFE OCR TEST SAMPLE INVOICE\n"
            "Invoice No: OCR-TEST-1001\n"
            "Supplier: Sample Supplies Ltd\n"
            "Amount: 1285.40 USD\n"
            "Reference: OCR smoke test"
        )

        image = Image.new("RGB", (1200, 520), color="white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default()
        draw.rectangle((18, 18, 1180, 500), outline="black", width=3)
        draw.text((48, 48), "GENSAFE OCR TEST SAMPLE INVOICE", fill="black", font=font)
        draw.text((48, 110), "Invoice No: OCR-TEST-1001", fill="black", font=font)
        draw.text((48, 170), "Supplier: Sample Supplies Ltd", fill="black", font=font)
        draw.text((48, 230), "Amount: 1285.40 USD", fill="black", font=font)
        draw.text((48, 290), "Reference: OCR smoke test", fill="black", font=font)
        draw.text((48, 390), "If this text is readable, OCR is working.", fill="black", font=font)

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        image_data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

        extracted_text = dp.pytesseract.image_to_string(image)
        normalize = lambda value: re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
        extracted_norm = normalize(extracted_text)
        sample_norm = normalize(sample_text)
        keywords = ["ocr test sample invoice", "invoice no ocr test 1001", "sample supplies ltd"]
        passed = any(keyword in extracted_norm for keyword in keywords) or len(extracted_norm) > 20

        return {
            "available": True,
            "configured": bool(configured_cmd),
            "command": configured_cmd,
            "version": version,
            "sample_text": sample_text,
            "extracted_text": extracted_text,
            "image_data_url": image_data_url,
            "passed": passed,
            "match_score": sum(1 for keyword in keywords if keyword in extracted_norm),
            "notes": "This is a generated screenshot-style OCR smoke test.",
        }
    except Exception as exc:
        return {
            "available": False,
            "configured": bool(configured_cmd),
            "command": configured_cmd,
            "version": version,
            "sample_text": "GENSAFE OCR TEST SAMPLE INVOICE\nInvoice No: OCR-TEST-1001\nSupplier: Sample Supplies Ltd\nAmount: 1285.40 USD\nReference: OCR smoke test",
            "extracted_text": "",
            "image_data_url": None,
            "passed": False,
            "error": str(exc),
        }

@ops_router.post("/run-escalations")
async def run_escalations(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = EscalationService(db)
    result = await service.run()
    return {"message": "Escalation run completed", **result}


@ops_router.post("/run-maintenance")
async def run_maintenance(
    refresh_baselines: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await _run_maintenance_sweep(db, refresh_baselines=refresh_baselines)
    return {"message": "Maintenance sweep completed", **result}


@health_router.get("/check")
async def health_check(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    monitor = WorkflowHealthMonitor(db)
    return await monitor.run_health_check()


@health_router.get("/pipeline-stats")
async def pipeline_stats(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    monitor = WorkflowHealthMonitor(db)
    return (await monitor.run_health_check()).get("stats", {})


@selfcorrect_router.post("/compute-baselines")
async def compute_baselines(
    supplier_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    agent = SelfCorrectionAgent(db)
    return await agent.compute_supplier_baselines(supplier_id)


async def _run_self_correction(alert_id: str, was_correct: bool, analyst_note: Optional[str] = None):
    async with AsyncSessionLocal() as db:
        agent = SelfCorrectionAgent(db)
        await agent.process_feedback(alert_id, was_correct, analyst_note)


async def _run_maintenance_sweep(db: AsyncSession, refresh_baselines: bool = False) -> dict:
    health = await WorkflowHealthMonitor(db).run_health_check()
    escalations = await EscalationService(db).run()
    retention = await AuditMaintenanceService(db).retention_preview()
    baselines = None
    if refresh_baselines:
        baselines = await SelfCorrectionAgent(db).compute_supplier_baselines()
    return {
        "health": health,
        "escalations": escalations,
        "retention": retention,
        "baselines": baselines,
    }

@ops_router.get("/trace/{trace_id}/messages")
async def get_trace_messages(
    trace_id: str,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    bus = AgentBus(db)
    rows = await bus.list_messages(trace_id=trace_id, limit=limit)
    return {"trace_id": trace_id, "messages": rows, "total": len(rows)}


@integration_router.get("/providers")
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = ERPOAuthService(db)
    return {"providers": await service.list_providers()}


@integration_router.post("/{provider}/configure")
async def configure_integration(
    provider: str,
    data: IntegrationConfigIn,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = ERPOAuthService(db)
    try:
        status = await service.configure_provider(
            provider=provider,
            client_id=data.client_id,
            client_secret=data.client_secret,
            redirect_uri=data.redirect_uri,
            scopes=data.scopes,
            enabled=data.enabled,
        )
        return {"message": "Integration configured", "status": status}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@integration_router.get("/{provider}/auth-url")
async def integration_auth_url(
    provider: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = ERPOAuthService(db)
    try:
        return await service.create_auth_url(provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@integration_router.get("/{provider}/callback")
async def integration_callback(
    provider: str,
    code: str,
    state: str,
    realmId: Optional[str] = None,
    tenantId: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    service = ERPOAuthService(db)
    try:
        return await service.handle_callback(
            provider=provider,
            code=code,
            state=state,
            extra={"realm_id": realmId, "tenant_id": tenantId},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OAuth callback failed: {exc}")


@integration_router.get("/{provider}/status")
async def integration_status(
    provider: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = ERPOAuthService(db)
    try:
        return await service.get_provider_status(provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@integration_router.post("/{provider}/refresh")
async def integration_refresh_token(
    provider: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = ERPOAuthService(db)
    try:
        return await service.refresh_token(provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

# ── AUTH ──────────────────────────────────────────────────────
auth_router = APIRouter()

@auth_router.post("/login")
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    r = await db.execute(text("SELECT * FROM users WHERE email=:e AND is_active=1"), {"e": form.username})
    user = r.mappings().first()
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"sub": str(user["user_id"]), "email": user["email"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer",
            "user": {"email": user["email"], "role": user["role"], "name": user["full_name"]}}

@auth_router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user

# ── INVOICES ──────────────────────────────────────────────────
invoice_router = APIRouter()


async def _resolve_supplier_id(db: AsyncSession, supplier_name: Optional[str], currency: str = "USD") -> Optional[str]:
    if not supplier_name:
        return None
    normalized = supplier_name.strip()
    if not normalized:
        return None

    existing = await db.execute(
        text("SELECT supplier_id FROM suppliers WHERE LOWER(name) = LOWER(:name) LIMIT 1"),
        {"name": normalized},
    )
    row = existing.mappings().first()
    if row:
        return str(row["supplier_id"])

    supplier_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO suppliers (supplier_id, name, currency, risk_level, created_at)
            VALUES (:id, :name, :currency, 'unknown', CURRENT_TIMESTAMP)
            """
        ),
        {"id": supplier_id, "name": normalized, "currency": currency or "USD"},
    )
    return supplier_id

@invoice_router.post("/analyze")
async def submit_invoice(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    supplier_id: Optional[str] = Form(None),
    invoice_number: Optional[str] = Form(None),
    amount: Optional[float] = Form(None),
    currency: str = Form("USD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    invoice_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    content = await file.read()
    file_meta = save_file_with_metadata(content, file.filename)
    file_path = file_meta["local_path"]
    doc = await process_document(file_path, file.filename)
    parsed = doc.get("fields", {}) or {}

    parsed_supplier_name = parsed.get("supplier_name")
    parsed_invoice_number = parsed.get("invoice_number")
    parsed_currency = parsed.get("currency") or currency or "USD"
    parsed_amount = parsed.get("total_amount")
    chosen_amount = amount if amount not in (None, "", 0) else parsed_amount or 0
    chosen_invoice_number = invoice_number or parsed_invoice_number or f"INV-{invoice_id[:8].upper()}"
    chosen_supplier_id = supplier_id or await _resolve_supplier_id(db, parsed_supplier_name, parsed_currency)

    if chosen_amount in ("", None):
        chosen_amount = 0
    try:
        chosen_amount = float(chosen_amount or 0)
    except Exception:
        chosen_amount = 0.0

    if not supplier_id and chosen_supplier_id:
        supplier_id = chosen_supplier_id

    await db.execute(text("""
        INSERT INTO invoices (invoice_id, supplier_id, invoice_number, amount, currency,
            local_file_path, document_url, extracted_text, status, processing_job_id, created_at)
        VALUES (:id, :sid, :num, :amt, :cur, :path, :doc_url, :text, 'pending', :job, CURRENT_TIMESTAMP)
    """), {"id": invoice_id, "sid": chosen_supplier_id or supplier_id,
           "num": chosen_invoice_number,
           "amt": chosen_amount, "cur": parsed_currency,
           "path": file_path, "doc_url": file_meta.get("document_url"), "text": doc["text"], "job": job_id})

    await db.execute(text("""
        INSERT INTO processing_jobs (job_id, invoice_id, status, progress, started_at, created_at)
        VALUES (:jid, :iid, 'queued', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """), {"jid": job_id, "iid": invoice_id})
    await db.commit()

    dispatch_invoice_job(background_tasks, invoice_id, job_id)
    return {
        "message": "Invoice submitted",
        "invoice_id": invoice_id,
        "job_id": job_id,
        "status": "queued",
        "ocr_fields": parsed,
        "invoice_number": chosen_invoice_number,
        "amount": chosen_amount,
        "currency": parsed_currency,
        "supplier_id": supplier_id,
    }

@invoice_router.get("/list")
async def list_invoices(skip: int = 0, limit: int = 50, status: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    q = "SELECT i.*, s.name as supplier_name FROM invoices i LEFT JOIN suppliers s ON i.supplier_id=s.supplier_id"
    params = {"limit": limit, "skip": skip}
    if status:
        q += " WHERE i.status=:status"
        params["status"] = status
    q += " ORDER BY i.created_at DESC LIMIT :limit OFFSET :skip"
    r = await db.execute(text(q), params)
    return {"invoices": [dict(row) for row in r.mappings().all()]}

@invoice_router.get("/{job_id}/result")
async def get_result(job_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(text("SELECT * FROM processing_jobs WHERE job_id=:id"), {"id": job_id})
    job = r.mappings().first()
    if not job: raise HTTPException(404, "Job not found")
    resp = {"job_id": job_id, "status": job["status"], "progress": job["progress"], "current_step": job["current_step"]}
    if job["status"] == "completed" and job["result"]:
        result = json.loads(job["result"]) if isinstance(job["result"], str) else dict(job["result"])
        if not result.get("extracted_text_preview") and job.get("invoice_id"):
            inv = await db.execute(text("SELECT extracted_text FROM invoices WHERE invoice_id=:id"), {"id": job["invoice_id"]})
            invoice_row = inv.mappings().first()
            extracted_text = (invoice_row or {}).get("extracted_text") if invoice_row else None
            if extracted_text:
                result["extracted_text_preview"] = extracted_text[:2000]
                result["extracted_text_length"] = len(extracted_text)
                result["ocr_fields"] = parse_invoice_fields(extracted_text)
        elif result.get("extracted_text_preview"):
            result["ocr_fields"] = parse_invoice_fields(result.get("extracted_text_preview", ""))
        resp["result"] = result
    if job["status"] == "failed":
        resp["error"] = job["error_message"]
    return resp


@invoice_router.get("/{invoice_id}/agents")
async def get_invoice_agent_breakdown(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        text(
            """
            SELECT result
            FROM processing_jobs
            WHERE invoice_id = :id AND status = 'completed'
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {"id": invoice_id},
    )
    row = result.mappings().first()
    if not row or not row["result"]:
        raise HTTPException(404, "No completed analysis found")

    analysis = json.loads(row["result"]) if isinstance(row["result"], str) else row["result"]
    return {
        "invoice_id": invoice_id,
        "risk_score": analysis.get("risk_score"),
        "decision": analysis.get("decision"),
        "agents": {
            "llm": analysis.get("llm_analysis"),
            "anomaly": analysis.get("anomaly_analysis"),
            "cv": analysis.get("cv_analysis"),
            "multilingual": analysis.get("multilingual_analysis"),
            "fraud_simulation": analysis.get("fraud_simulation_analysis"),
            "verification": analysis.get("verification"),
        },
        "acp_messages": analysis.get("acp_messages", 0),
        "pipeline_steps": analysis.get("pipeline_steps", []),
        "errors": analysis.get("errors", []),
        "trace_id": analysis.get("trace_id"),
    }

@invoice_router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(text("""
        SELECT i.*, s.name as supplier_name FROM invoices i
        LEFT JOIN suppliers s ON i.supplier_id=s.supplier_id
        WHERE i.invoice_id=:id
    """), {"id": invoice_id})
    row = r.mappings().first()
    if not row: raise HTTPException(404, "Not found")
    inv = dict(row)
    ar = await db.execute(text("SELECT * FROM fraud_alerts WHERE invoice_id=:id ORDER BY created_at DESC LIMIT 1"), {"id": invoice_id})
    alert = ar.mappings().first()
    if alert:
        a = dict(alert)
        if isinstance(a.get("flags"), str):
            try: a["flags"] = json.loads(a["flags"])
            except: pass
        inv["alert"] = a
    extracted_text = inv.get("extracted_text") or ""
    if extracted_text:
        ocr_fields = parse_invoice_fields(extracted_text)
        inv["ocr_fields"] = ocr_fields
        inv["extracted_text_preview"] = extracted_text[:2000]
        inv["extracted_text_length"] = len(extracted_text)
        if ocr_fields.get("invoice_number") and (not inv.get("invoice_number") or str(inv.get("invoice_number")).startswith("INV-")):
            inv["invoice_number"] = ocr_fields["invoice_number"]
        if ocr_fields.get("supplier_name") and (not inv.get("supplier_name") or str(inv.get("supplier_name")).lower() == "unknown"):
            inv["supplier_name"] = ocr_fields["supplier_name"]
        if ocr_fields.get("total_amount") not in (None, "") and float(inv.get("amount") or 0) == 0:
            inv["amount"] = ocr_fields["total_amount"]
        if ocr_fields.get("currency") and not inv.get("currency"):
            inv["currency"] = ocr_fields["currency"]
    return inv

# ── ALERTS ────────────────────────────────────────────────────
alert_router = APIRouter()

class FeedbackIn(BaseModel):
    was_correct: bool
    analyst_note: Optional[str] = None
    feedback_type: Optional[str] = "manual_review"

@alert_router.get("/list")
async def list_alerts(status: Optional[str] = None, limit: int = 50, skip: int = 0,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    q = """SELECT fa.*, s.name as supplier_name, i.invoice_number, i.amount, i.currency
           FROM fraud_alerts fa
           LEFT JOIN suppliers s ON fa.supplier_id=s.supplier_id
           LEFT JOIN invoices i ON fa.invoice_id=i.invoice_id"""
    params = {"limit": limit, "skip": skip}
    if status:
        q += " WHERE fa.status=:status"
        params["status"] = status
    q += " ORDER BY fa.created_at DESC LIMIT :limit OFFSET :skip"
    r = await db.execute(text(q), params)
    rows = [dict(row) for row in r.mappings().all()]
    for row in rows:
        if isinstance(row.get("flags"), str):
            try: row["flags"] = json.loads(row["flags"])
            except: pass
    return {"alerts": rows, "total": len(rows)}

@alert_router.get("/{alert_id}")
async def get_alert(alert_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(text("""
        SELECT fa.*, s.name as supplier_name, i.invoice_number, i.amount, i.currency, i.extracted_text
        FROM fraud_alerts fa
        LEFT JOIN suppliers s ON fa.supplier_id=s.supplier_id
        LEFT JOIN invoices i ON fa.invoice_id=i.invoice_id
        WHERE fa.alert_id=:id
    """), {"id": alert_id})
    row = r.mappings().first()
    if not row: raise HTTPException(404, "Not found")
    a = dict(row)
    if isinstance(a.get("flags"), str):
        try: a["flags"] = json.loads(a["flags"])
        except: pass
    extracted_text = a.get("extracted_text") or ""
    if extracted_text:
        ocr_fields = parse_invoice_fields(extracted_text)
        a["ocr_fields"] = ocr_fields
        a["extracted_text_preview"] = extracted_text[:2000]
        a["extracted_text_length"] = len(extracted_text)
        if ocr_fields.get("invoice_number") and (not a.get("invoice_number") or str(a.get("invoice_number")).startswith("INV-")):
            a["invoice_number"] = ocr_fields["invoice_number"]
        if ocr_fields.get("supplier_name") and (not a.get("supplier_name") or str(a.get("supplier_name")).lower() == "unknown"):
            a["supplier_name"] = ocr_fields["supplier_name"]
        if ocr_fields.get("total_amount") not in (None, "") and float(a.get("amount") or 0) == 0:
            a["amount"] = ocr_fields["total_amount"]
        if ocr_fields.get("currency") and not a.get("currency"):
            a["currency"] = ocr_fields["currency"]
    return a

@alert_router.post("/{alert_id}/feedback")
async def feedback(alert_id: str, data: FeedbackIn,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    ar = await db.execute(text("SELECT * FROM fraud_alerts WHERE alert_id=:id"), {"id": alert_id})
    alert = ar.mappings().first()
    if not alert: raise HTTPException(404, "Alert not found")
    await db.execute(text("""
        INSERT INTO model_feedback (feedback_id, alert_id, invoice_id, was_correct, analyst_note, feedback_type, created_at)
        VALUES (:fid, :aid, :iid, :correct, :note, :type, CURRENT_TIMESTAMP)
    """), {"fid": str(uuid.uuid4()), "aid": alert_id, "iid": str(alert["invoice_id"]),
           "correct": 1 if data.was_correct else 0, "note": data.analyst_note, "type": data.feedback_type})
    new_status = "resolved" if data.was_correct else "false_positive"
    await db.execute(text("UPDATE fraud_alerts SET status=:s, resolved_at=CURRENT_TIMESTAMP WHERE alert_id=:id"),
                     {"s": new_status, "id": alert_id})
    await db.commit()
    try:
        asyncio.create_task(_run_self_correction(alert_id, data.was_correct, data.analyst_note))
    except Exception as e:
        logger.warning("Self-correction agent error", error=str(e))
    return {"message": "Feedback recorded", "new_status": new_status}

@alert_router.patch("/{alert_id}/resolve")
async def resolve_alert(alert_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    await db.execute(text("UPDATE fraud_alerts SET status='resolved', resolved_at=CURRENT_TIMESTAMP WHERE alert_id=:id"), {"id": alert_id})
    await db.commit()
    return {"message": "Resolved"}

# ── SUPPLIERS ─────────────────────────────────────────────────
supplier_router = APIRouter()

class SupplierIn(BaseModel):
    name: str
    email: Optional[str] = None
    country: Optional[str] = None
    bank_account_iban: Optional[str] = None
    bank_name: Optional[str] = None
    currency: str = "USD"

@supplier_router.post("/register")
async def register_supplier(data: SupplierIn, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    sid = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO suppliers (supplier_id, name, email, country, bank_account_iban, bank_name, currency, created_at)
        VALUES (:id, :name, :email, :country, :iban, :bank, :currency, CURRENT_TIMESTAMP)
    """), {"id": sid, "name": data.name, "email": data.email, "country": data.country,
           "iban": data.bank_account_iban, "bank": data.bank_name, "currency": data.currency})
    await db.commit()
    return {"supplier_id": sid, "name": data.name}

@supplier_router.get("/list")
async def list_suppliers(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(text("SELECT * FROM suppliers WHERE is_active=1 ORDER BY name"))
    return {"suppliers": [dict(row) for row in r.mappings().all()]}

@supplier_router.get("/{supplier_id}/profile")
async def supplier_profile(supplier_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    sr = await db.execute(text("SELECT * FROM suppliers WHERE supplier_id=:id"), {"id": supplier_id})
    supplier = sr.mappings().first()
    if not supplier: raise HTTPException(404, "Not found")
    invr = await db.execute(text("SELECT * FROM invoices WHERE supplier_id=:id ORDER BY created_at DESC LIMIT 20"), {"id": supplier_id})
    altr = await db.execute(text("SELECT * FROM fraud_alerts WHERE supplier_id=:id ORDER BY created_at DESC LIMIT 10"), {"id": supplier_id})
    blr = await db.execute(text("SELECT * FROM supplier_baselines WHERE supplier_id=:id ORDER BY computed_at DESC LIMIT 1"), {"id": supplier_id})
    bl = blr.mappings().first()
    return {"supplier": dict(supplier), "invoices": [dict(r) for r in invr.mappings().all()],
            "alerts": [dict(r) for r in altr.mappings().all()], "baseline": dict(bl) if bl else None}

# ── DASHBOARD ─────────────────────────────────────────────────
dashboard_router = APIRouter()

@dashboard_router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    cutoff_30 = (datetime.utcnow() - timedelta(days=30)).isoformat()
    cutoff_7 = (datetime.utcnow() - timedelta(days=7)).isoformat()
    total = (await db.execute(text("SELECT COUNT(*) FROM invoices"))).scalar()
    open_alerts = (await db.execute(text("SELECT COUNT(*) FROM fraud_alerts WHERE status='open'"))).scalar()
    protected = (await db.execute(text("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='blocked'"))).scalar()
    statuses = await db.execute(text("SELECT status, COUNT(*) as c FROM invoices GROUP BY status"))
    risk_br = await db.execute(
        text(
            "SELECT risk_level, COUNT(*) as c "
            "FROM fraud_alerts WHERE created_at > :cutoff GROUP BY risk_level"
        ),
        {"cutoff": cutoff_30},
    )
    recent = await db.execute(text("""
        SELECT fa.alert_id, fa.risk_score, fa.risk_level, fa.status, fa.created_at,
               s.name as supplier_name, i.invoice_number, i.amount, i.currency
        FROM fraud_alerts fa
        LEFT JOIN suppliers s ON fa.supplier_id=s.supplier_id
        LEFT JOIN invoices i ON fa.invoice_id=i.invoice_id
        ORDER BY fa.created_at DESC LIMIT 5
    """))
    trend = await db.execute(text("""
        SELECT DATE(created_at) as day, COUNT(*) as invoices,
               SUM(CASE WHEN risk_score >= 60 THEN 1 ELSE 0 END) as flagged
        FROM invoices WHERE created_at > :cutoff_7
        GROUP BY DATE(created_at) ORDER BY day
    """), {"cutoff_7": cutoff_7})
    fp = (await db.execute(text("""
        SELECT COUNT(CASE WHEN was_correct=0 THEN 1 END)*1.0/MAX(COUNT(*),1)*100
        FROM model_feedback WHERE created_at > :cutoff_30
    """), {"cutoff_30": cutoff_30})).scalar()
    return {
        "total_invoices": total or 0,
        "open_alerts": open_alerts or 0,
        "value_protected": float(protected or 0),
        "false_positive_rate": round(float(fp or 0), 1),
        "autonomous_rate": 85.0,
        "status_breakdown": {r["status"]: r["c"] for r in statuses.mappings().all()},
        "risk_breakdown": {r["risk_level"]: r["c"] for r in risk_br.mappings().all()},
        "recent_alerts": [dict(r) for r in recent.mappings().all()],
        "weekly_trend": [dict(r) for r in trend.mappings().all()],
    }

@dashboard_router.get("/analytics")
async def get_analytics(days: int = 30, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    cutoff = (datetime.utcnow() - timedelta(days=max(1, int(days)))).isoformat()
    daily = await db.execute(text("""
        SELECT DATE(created_at) as day, COUNT(*) as total,
               SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) as blocked,
               SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
               COALESCE(AVG(risk_score),0) as avg_risk
        FROM invoices WHERE created_at > :cutoff
        GROUP BY DATE(created_at) ORDER BY day
    """), {"cutoff": cutoff})
    risky = await db.execute(text("""
        SELECT s.name, s.supplier_id, COUNT(fa.alert_id) as alert_count, AVG(fa.risk_score) as avg_risk
        FROM fraud_alerts fa JOIN suppliers s ON fa.supplier_id=s.supplier_id
        GROUP BY s.supplier_id, s.name ORDER BY alert_count DESC LIMIT 10
    """))
    return {"daily_volume": [dict(r) for r in daily.mappings().all()],
            "top_risky_suppliers": [dict(r) for r in risky.mappings().all()]}

# ── TASKS (Meeting Intelligence) ──────────────────────────────
task_router = APIRouter()

class MeetingIn(BaseModel):
    transcript: str
    meeting_title: Optional[str] = "Finance Meeting"
    source: str = "manual_upload"

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    owner_email: Optional[str] = None
    priority: Optional[str] = None

@task_router.post("/extract-from-meeting")
async def extract_from_meeting(data: MeetingIn, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    extracted = await extract_meeting_items(data.transcript)
    created = []
    for item in extracted.get("action_items", []):
        tid = str(uuid.uuid4())
        await db.execute(text("""
            INSERT INTO workflow_tasks (task_id, title, description, owner_name, due_date, priority, source, source_ref, created_at)
            VALUES (:id, :title, :desc, :owner, :due, :priority, :source, :ref, CURRENT_TIMESTAMP)
        """), {"id": tid, "title": item.get("task", "Untitled"),
               "desc": item.get("context"), "owner": item.get("owner"),
               "due": item.get("deadline"), "priority": item.get("priority", "medium"),
               "source": data.source, "ref": data.meeting_title})
        created.append({"task_id": tid, "task": item.get("task"), "owner": item.get("owner")})
    await db.commit()
    return {"summary": extracted.get("summary"), "decisions": extracted.get("decisions", []),
            "tasks_created": len(created), "tasks": created,
            "open_questions": extracted.get("open_questions", [])}

@task_router.get("/list")
async def list_tasks(status: Optional[str] = None, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    q = "SELECT * FROM workflow_tasks"
    params = {}
    if status:
        q += " WHERE status=:status"
        params["status"] = status
    q += " ORDER BY created_at DESC"
    r = await db.execute(text(q), params)
    return {"tasks": [dict(row) for row in r.mappings().all()]}

@task_router.patch("/{task_id}")
async def update_task(task_id: str, data: TaskUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    updates, params = [], {"id": task_id}
    if data.status:
        updates.append("status=:status")
        params["status"] = data.status
        if data.status == "completed":
            updates.append("completed_at=CURRENT_TIMESTAMP")
    if data.owner_email:
        updates.append("owner_email=:email")
        params["email"] = data.owner_email
    if data.priority:
        updates.append("priority=:priority")
        params["priority"] = data.priority
    if not updates: raise HTTPException(400, "Nothing to update")
    await db.execute(text(f"UPDATE workflow_tasks SET {', '.join(updates)}, updated_at=CURRENT_TIMESTAMP WHERE task_id=:id"), params)
    await db.commit()
    return {"message": "Updated"}

# ── AUDIT ─────────────────────────────────────────────────────
audit_router = APIRouter()

@audit_router.get("/trail")
async def audit_trail(invoice_id: Optional[str] = None, trace_id: Optional[str] = None,
    agent_id: Optional[str] = None, limit: int = 100,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    q = "SELECT * FROM agent_decisions WHERE 1=1"
    params = {"limit": limit}
    if invoice_id:
        q += " AND invoice_id=:invoice_id"
        params["invoice_id"] = invoice_id
    if trace_id:
        q += " AND trace_id=:trace_id"
        params["trace_id"] = trace_id
    if agent_id:
        q += " AND agent_id=:agent_id"
        params["agent_id"] = agent_id
    q += " ORDER BY created_at DESC LIMIT :limit"
    r = await db.execute(text(q), params)
    rows = [dict(row) for row in r.mappings().all()]
    for row in rows:
        for f in ["input_data", "output_data"]:
            if isinstance(row.get(f), str):
                try: row[f] = json.loads(row[f])
                except: pass
    return {"audit_records": rows, "total": len(rows)}

@audit_router.get("/stats")
async def audit_stats(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(text("SELECT agent_id, COUNT(*) as actions, AVG(duration_ms) as avg_ms FROM agent_decisions GROUP BY agent_id ORDER BY actions DESC"))
    return {"agent_stats": [dict(row) for row in r.mappings().all()]}

@audit_router.get("/integrity")
async def audit_integrity(
    trace_id: Optional[str] = None,
    limit: int = 1000,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = AuditMaintenanceService(db)
    return await service.verify_integrity(trace_id=trace_id, limit=limit)

@audit_router.get("/retention")
async def audit_retention(
    retention_days: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = AuditMaintenanceService(db)
    return await service.retention_preview(retention_days=retention_days)


@audit_router.post("/export-and-purge")
async def audit_export_and_purge(
    retention_days: Optional[int] = None,
    archive_dir: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = AuditMaintenanceService(db)
    return await service.export_and_purge(retention_days=retention_days, archive_dir=archive_dir)

# ── WEBHOOKS ──────────────────────────────────────────────────
webhook_router = APIRouter()

class ERPPayload(BaseModel):
    erp_system: str
    invoice_number: str
    supplier_name: str
    supplier_email: Optional[str] = None
    supplier_iban: Optional[str] = None
    amount: float
    currency: str = "USD"
    invoice_text: Optional[str] = None


async def _submit_erp_invoice(
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    erp_system: str,
    invoice_number: str,
    supplier_name: str,
    amount: float,
    currency: str,
    invoice_text: Optional[str] = None,
    supplier_email: Optional[str] = None,
    supplier_iban: Optional[str] = None,
) -> dict:
    sr = await db.execute(text("SELECT supplier_id FROM suppliers WHERE name=:n LIMIT 1"), {"n": supplier_name})
    row = sr.mappings().first()
    if row:
        supplier_id = str(row["supplier_id"])
    else:
        supplier_id = str(uuid.uuid4())
        await db.execute(text("""
            INSERT INTO suppliers (supplier_id, name, email, bank_account_iban, currency, created_at)
            VALUES (:id, :name, :email, :iban, :cur, CURRENT_TIMESTAMP)
        """), {"id": supplier_id, "name": supplier_name,
               "email": supplier_email, "iban": supplier_iban, "cur": currency})

    invoice_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    text_content = invoice_text or f"Invoice {invoice_number} from {supplier_name}\nAmount: {amount} {currency}"

    await db.execute(text("""
        INSERT INTO invoices (invoice_id, supplier_id, invoice_number, amount, currency, document_url, extracted_text, status, processing_job_id, created_at)
        VALUES (:id, :sid, :num, :amt, :cur, NULL, :text, 'pending', :job, CURRENT_TIMESTAMP)
    """), {"id": invoice_id, "sid": supplier_id, "num": invoice_number,
           "amt": amount, "cur": currency, "text": text_content, "job": job_id})
    await db.execute(text("INSERT INTO processing_jobs (job_id, invoice_id, status, created_at) VALUES (:j, :i, 'queued', CURRENT_TIMESTAMP)"),
                     {"j": job_id, "i": invoice_id})
    await db.commit()

    dispatch_invoice_job(background_tasks, invoice_id, job_id)
    logger.info("ERP webhook received", erp=erp_system, invoice=invoice_number)
    return {"message": "Received", "invoice_id": invoice_id, "job_id": job_id}


@webhook_router.post("/erp")
async def erp_webhook(payload: ERPPayload, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    return await _submit_erp_invoice(
        db=db,
        background_tasks=background_tasks,
        erp_system=payload.erp_system,
        invoice_number=payload.invoice_number,
        supplier_name=payload.supplier_name,
        amount=payload.amount,
        currency=payload.currency,
        invoice_text=payload.invoice_text,
        supplier_email=payload.supplier_email,
        supplier_iban=payload.supplier_iban,
    )


@webhook_router.post("/quickbooks")
async def quickbooks_webhook(payload: dict[str, Any], background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    invoice_number = str(payload.get("invoice_number") or payload.get("DocNumber") or f"QBO-{uuid.uuid4().hex[:8].upper()}")
    supplier_name = str(payload.get("supplier_name") or payload.get("VendorName") or "QuickBooks Supplier")
    amount = float(payload.get("amount") or payload.get("TotalAmt") or 0)
    currency = str(payload.get("currency") or payload.get("Currency") or "USD")
    return await _submit_erp_invoice(
        db=db,
        background_tasks=background_tasks,
        erp_system="quickbooks",
        invoice_number=invoice_number,
        supplier_name=supplier_name,
        amount=amount,
        currency=currency,
        invoice_text=payload.get("invoice_text"),
        supplier_email=payload.get("supplier_email"),
        supplier_iban=payload.get("supplier_iban"),
    )


@webhook_router.post("/xero")
async def xero_webhook(payload: dict[str, Any], background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    invoice_number = str(payload.get("invoice_number") or payload.get("InvoiceNumber") or f"XERO-{uuid.uuid4().hex[:8].upper()}")
    supplier_name = str(payload.get("supplier_name") or payload.get("ContactName") or "Xero Supplier")
    amount = float(payload.get("amount") or payload.get("Total") or 0)
    currency = str(payload.get("currency") or payload.get("CurrencyCode") or "USD")
    return await _submit_erp_invoice(
        db=db,
        background_tasks=background_tasks,
        erp_system="xero",
        invoice_number=invoice_number,
        supplier_name=supplier_name,
        amount=amount,
        currency=currency,
        invoice_text=payload.get("invoice_text"),
        supplier_email=payload.get("supplier_email"),
        supplier_iban=payload.get("supplier_iban"),
    )
