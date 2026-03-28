"""Master Orchestrator Agent — autonomous 20-step pipeline"""
import uuid, json, asyncio
from datetime import datetime
from sqlalchemy import text
import structlog

from core.config import settings
from services.gemini_service import analyze_invoice, generate_explanation
from services.agents.anomaly_agent import AnomalyDetectionAgent
from services.agents.audit_agent import AuditAgent
from services.agents.context_agent import ContextRetrievalAgent
from services.agents.verification_agent import VerificationAgent
from services.agent_bus import AgentBus
from services.agents.cv_agent import ComputerVisionAgent
from services.agents.multilingual_agent import MultilingualAgent
from services.agents.fraud_simulation_agent import FraudSimulationAgent

logger = structlog.get_logger()

class OrchestratorAgent:
    def __init__(self, db):
        self.db = db
        self.anomaly = AnomalyDetectionAgent()
        self.audit = AuditAgent(db)
        self.context = ContextRetrievalAgent(db)
        self.verifier = VerificationAgent()
        self.bus = AgentBus(db)
        self.cv = ComputerVisionAgent()
        self.multi = MultilingualAgent()
        self.fraud_sim = FraudSimulationAgent()

    async def process_invoice(self, invoice_id: str, job_id: str) -> dict:
        trace_id = str(uuid.uuid4())
        log = logger.bind(invoice_id=invoice_id, trace_id=trace_id)
        log.info("Orchestrator starting")

        try:
            # Step 1-3: Load data
            await self._update_job(job_id, "loading_invoice", 5)
            context_packet = await self.context.get_context(invoice_id)
            if not context_packet:
                raise ValueError(f"Invoice {invoice_id} not found")
            invoice = context_packet["invoice"]

            await self._update_job(job_id, "loading_supplier", 10)
            supplier_info = context_packet.get("supplier", {})
            baseline = context_packet.get("baseline")

            await self.audit.log(trace_id, invoice_id, "orchestrator", "invoice_loaded",
                {"invoice_id": invoice_id}, {"status": "found", "amount": invoice.get("amount")})

            # Step 4-7: Build context
            await self._update_job(job_id, "building_context", 20)
            behavioral = context_packet.get("behavioral", {})
            invoice_text = context_packet.get("invoice_text", "")

            # Step 8-13: Run agents in parallel
            await self._update_job(job_id, "running_ai_agents", 35)
            log.info("Dispatching parallel agents")

            llm_task = asyncio.create_task(self._run_llm(invoice_text, supplier_info, behavioral, trace_id, invoice_id))
            anomaly_task = asyncio.create_task(self._run_anomaly(dict(invoice), baseline, trace_id, invoice_id))
            cv_task = asyncio.create_task(self._run_cv(dict(invoice), invoice_text, trace_id, invoice_id))
            multi_task = asyncio.create_task(self._run_multilingual(invoice_text, trace_id, invoice_id))
            fraud_task = asyncio.create_task(self._run_fraud_simulation(dict(invoice), baseline, trace_id, invoice_id))
            llm_result, anomaly_result, cv_result, multi_result, fraud_result = await asyncio.gather(
                llm_task, anomaly_task, cv_task, multi_task, fraud_task, return_exceptions=True
            )

            if isinstance(llm_result, Exception):
                log.error("LLM agent failed", error=str(llm_result))
                llm_result = {"risk_score": 50, "flags": [], "explanation": f"LLM error: {llm_result}", "confidence": 0.3}
            if isinstance(anomaly_result, Exception):
                log.error("Anomaly agent failed", error=str(anomaly_result))
                anomaly_result = {"risk_score": 30, "flags": [], "anomaly_score": 0.3}
            if isinstance(cv_result, Exception):
                log.error("CV agent failed", error=str(cv_result))
                cv_result = {"risk_score": 20, "flags": []}
            if isinstance(multi_result, Exception):
                log.error("Multilingual agent failed", error=str(multi_result))
                multi_result = {"risk_score": 10, "flags": []}
            if isinstance(fraud_result, Exception):
                log.error("Fraud simulation agent failed", error=str(fraud_result))
                fraud_result = {"risk_score": 15, "flags": []}

            await self.bus.publish(
                trace_id=trace_id,
                from_agent="llm_analysis_agent",
                to_agent="risk_aggregator",
                message_type="FINDING_SHARE",
                payload={
                    "risk_score": llm_result.get("risk_score"),
                    "flag_count": len(llm_result.get("flags", [])),
                },
            )
            await self.bus.publish(
                trace_id=trace_id,
                from_agent="anomaly_detection_agent",
                to_agent="risk_aggregator",
                message_type="FINDING_SHARE",
                payload={
                    "risk_score": anomaly_result.get("risk_score"),
                    "anomaly_score": anomaly_result.get("anomaly_score"),
                    "flag_count": len(anomaly_result.get("flags", [])),
                },
            )
            await self.bus.publish(
                trace_id=trace_id,
                from_agent="computer_vision_agent",
                to_agent="risk_aggregator",
                message_type="FINDING_SHARE",
                payload={
                    "risk_score": cv_result.get("risk_score"),
                    "flag_count": len(cv_result.get("flags", [])),
                },
            )
            await self.bus.publish(
                trace_id=trace_id,
                from_agent="multilingual_agent",
                to_agent="risk_aggregator",
                message_type="FINDING_SHARE",
                payload={
                    "risk_score": multi_result.get("risk_score"),
                    "flag_count": len(multi_result.get("flags", [])),
                },
            )
            await self.bus.publish(
                trace_id=trace_id,
                from_agent="fraud_simulation_agent",
                to_agent="risk_aggregator",
                message_type="FINDING_SHARE",
                payload={
                    "risk_score": fraud_result.get("risk_score"),
                    "flag_count": len(fraud_result.get("flags", [])),
                },
            )

            # Step 14: Aggregate
            await self._update_job(job_id, "aggregating_risk", 70)
            final_score = self._aggregate(
                llm=llm_result,
                anomaly=anomaly_result,
                cv=cv_result,
                multilingual=multi_result,
                fraud=fraud_result,
            )
            risk_level = self._to_level(final_score)
            all_flags = (
                llm_result.get("flags", [])
                + anomaly_result.get("flags", [])
                + cv_result.get("flags", [])
                + multi_result.get("flags", [])
                + fraud_result.get("flags", [])
            )

            await self.audit.log(trace_id, invoice_id, "risk_aggregator", "scores_aggregated",
                {
                    "llm": llm_result.get("risk_score"),
                    "anomaly": anomaly_result.get("risk_score"),
                    "cv": cv_result.get("risk_score"),
                    "multilingual": multi_result.get("risk_score"),
                    "fraud_simulation": fraud_result.get("risk_score"),
                },
                {"final_score": final_score, "risk_level": risk_level})

            # Step 15: Generate explanation
            await self._update_job(job_id, "generating_explanation", 80)
            explanation = await generate_explanation(
                {"llm": llm_result, "anomaly": anomaly_result, "flags": all_flags},
                invoice.get("invoice_number", "N/A"),
                supplier_info.get("name", "Unknown"),
                float(invoice.get("amount") or 0),
                invoice.get("currency", "USD"),
                final_score
            )

            # Step 16: Autonomous decision
            await self._update_job(job_id, "making_decision", 85)
            decision = self._decide(final_score)
            verification = self.verifier.verify(invoice, final_score, all_flags, decision)
            if settings.ENABLE_VERIFICATION_RULES and verification["final_decision"] != decision:
                log.warning(
                    "Verification overrode decision",
                    proposed=decision,
                    final=verification["final_decision"],
                )
            decision = verification["final_decision"]
            await self.bus.publish(
                trace_id=trace_id,
                from_agent="verification_agent",
                to_agent="orchestrator",
                message_type="DECISION_REVIEW",
                payload={
                    "proposed_decision": verification["proposed_decision"],
                    "final_decision": verification["final_decision"],
                    "rules_enabled": verification["rules_enabled"],
                },
            )
            await self.audit.log(
                trace_id,
                invoice_id,
                "verification_agent",
                "decision_verified",
                {"proposed_decision": verification["proposed_decision"]},
                {
                    "final_decision": verification["final_decision"],
                    "rules_enabled": verification["rules_enabled"],
                },
            )
            await self.audit.log(trace_id, invoice_id, "orchestrator", f"decision_{decision}",
                {"risk_score": final_score}, {"decision": decision})

            # Step 17: Create alert if needed
            alert_id = None
            if final_score >= settings.RISK_HUMAN_REVIEW or decision == "block":
                await self._update_job(job_id, "creating_alert", 88)
                alert_id = await self._create_alert(
                    invoice_id, invoice.get("supplier_id"),
                    final_score, risk_level, all_flags, explanation,
                    llm_result.get("recommended_action", "Review manually")
                )

            # Step 18: Update invoice status
            await self._update_invoice(invoice_id, decision, final_score, risk_level)

            # Step 20: Complete
            result = {
                "invoice_id": invoice_id, "trace_id": trace_id,
                "risk_score": final_score, "risk_level": risk_level,
                "decision": decision, "alert_id": alert_id,
                "flags": all_flags, "explanation": explanation,
                "extracted_text_preview": (invoice_text or "")[:2000],
                "extracted_text_length": len(invoice_text or ""),
                "llm_analysis": llm_result,
                "anomaly_analysis": anomaly_result,
                "cv_analysis": cv_result,
                "multilingual_analysis": multi_result,
                "fraud_simulation_analysis": fraud_result,
                "verification": verification,
                "processed_at": datetime.utcnow().isoformat()
            }
            await self._complete_job(job_id, result)
            log.info("Processing complete", risk_score=final_score, decision=decision)
            return result

        except Exception as e:
            log.error("Pipeline failed", error=str(e))
            await self._fail_job(job_id, str(e))
            await self.audit.log(trace_id, invoice_id, "orchestrator", "pipeline_failed", {}, {"error": str(e)}, status="failed")
            raise

    async def _run_llm(self, text_content, supplier, behavioral, trace_id, invoice_id):
        start = datetime.utcnow()
        result = await analyze_invoice(text_content, supplier, behavioral)
        dur = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(trace_id, invoice_id, "llm_analysis_agent", "invoice_analyzed",
            {"text_length": len(text_content)},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur)
        return result

    async def _run_anomaly(self, invoice, baseline, trace_id, invoice_id):
        start = datetime.utcnow()
        result = self.anomaly.analyze(invoice, baseline)
        dur = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(trace_id, invoice_id, "anomaly_detection_agent", "behavioral_analyzed",
            {"amount": invoice.get("amount")},
            {"risk_score": result.get("risk_score"), "anomaly_score": result.get("anomaly_score")},
            duration_ms=dur)
        return result

    async def _run_cv(self, invoice, invoice_text, trace_id, invoice_id):
        start = datetime.utcnow()
        result = self.cv.analyze(invoice, invoice_text)
        dur = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(
            trace_id,
            invoice_id,
            "computer_vision_agent",
            "document_visual_analyzed",
            {"file_path": invoice.get("local_file_path")},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur,
        )
        return result

    async def _run_multilingual(self, invoice_text, trace_id, invoice_id):
        start = datetime.utcnow()
        result = self.multi.analyze(invoice_text)
        dur = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(
            trace_id,
            invoice_id,
            "multilingual_agent",
            "language_risk_analyzed",
            {"text_length": len(invoice_text or "")},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur,
        )
        return result

    async def _run_fraud_simulation(self, invoice, baseline, trace_id, invoice_id):
        start = datetime.utcnow()
        result = self.fraud_sim.analyze(invoice, baseline)
        dur = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(
            trace_id,
            invoice_id,
            "fraud_simulation_agent",
            "synthetic_pattern_scored",
            {"amount": invoice.get("amount")},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur,
        )
        return result

    def _aggregate(self, llm, anomaly, cv, multilingual, fraud):
        ls = float(llm.get("risk_score") or 50)
        as_ = float(anomaly.get("risk_score") or 30)
        cs = float(cv.get("risk_score") or 0)
        ms = float(multilingual.get("risk_score") or 0)
        fs = float(fraud.get("risk_score") or 0)
        w = (ls * 0.42) + (as_ * 0.30) + (cs * 0.12) + (ms * 0.08) + (fs * 0.08)
        if ls > 70 and as_ > 70:
            w = min(w * 1.1, 100)
        return round(w, 2)

    def _to_level(self, s):
        if s >= 80: return "critical"
        if s >= 60: return "high"
        if s >= 40: return "medium"
        return "low"

    def _decide(self, s):
        if s >= settings.RISK_AUTO_BLOCK: return "block"
        if s >= settings.RISK_HUMAN_REVIEW: return "review"
        return "approve"

    async def _load_invoice(self, iid):
        r = await self.db.execute(text("SELECT * FROM invoices WHERE invoice_id=:id"), {"id": iid})
        row = r.mappings().first()
        return dict(row) if row else None

    async def _load_supplier(self, sid):
        if not sid: return None
        r = await self.db.execute(text("SELECT * FROM suppliers WHERE supplier_id=:id"), {"id": sid})
        row = r.mappings().first()
        return dict(row) if row else None

    async def _load_baseline(self, sid):
        if not sid: return None
        r = await self.db.execute(text("SELECT * FROM supplier_baselines WHERE supplier_id=:id ORDER BY computed_at DESC LIMIT 1"), {"id": sid})
        row = r.mappings().first()
        return dict(row) if row else None

    async def _update_job(self, jid, step, progress):
        await self.db.execute(text(
            """
            UPDATE processing_jobs
            SET status='processing',
                current_step=:s,
                progress=:p,
                started_at=COALESCE(started_at, CURRENT_TIMESTAMP)
            WHERE job_id=:id
            """
        ), {"s": step, "p": progress, "id": jid})
        await self.db.commit()

    async def _complete_job(self, jid, result):
        await self.db.execute(text(
            "UPDATE processing_jobs SET status='completed', progress=100, result=:r, completed_at=CURRENT_TIMESTAMP WHERE job_id=:id"
        ), {"r": json.dumps(result, default=str), "id": jid})
        await self.db.commit()

    async def _fail_job(self, jid, error):
        await self.db.execute(text(
            "UPDATE processing_jobs SET status='failed', error_message=:e WHERE job_id=:id"
        ), {"e": error, "id": jid})
        await self.db.commit()

    async def _create_alert(self, invoice_id, supplier_id, risk_score, risk_level, flags, explanation, action):
        aid = str(uuid.uuid4())
        await self.db.execute(text("""
            INSERT INTO fraud_alerts
                (alert_id, invoice_id, supplier_id, risk_score, risk_level, flags, explanation_text, recommended_action, layer_triggered, created_at)
            VALUES
                (:aid, :iid, :sid, :score, :level, :flags, :exp, :action, 'multi_agent', CURRENT_TIMESTAMP)
        """), {
            "aid": aid, "iid": invoice_id, "sid": str(supplier_id) if supplier_id else None,
            "score": risk_score, "level": risk_level,
            "flags": json.dumps(flags, default=str), "exp": explanation,
            "action": action
        })
        await self.db.commit()
        return aid

    async def _update_invoice(self, invoice_id, decision, risk_score, risk_level):
        status_map = {"approve": "approved", "review": "under_review", "block": "blocked"}
        await self.db.execute(text(
            "UPDATE invoices SET status=:s, risk_score=:score, risk_level=:level WHERE invoice_id=:id"
        ), {"s": status_map.get(decision, "processed"), "score": risk_score, "level": risk_level, "id": invoice_id})
        await self.db.commit()
