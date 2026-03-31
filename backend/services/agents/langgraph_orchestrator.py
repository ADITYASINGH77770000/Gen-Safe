"""
LangGraph Master Orchestrator — Stateful 20-Step Invoice Processing Pipeline

Implements the full Plan of Action architecture:
  - TypedDict state flows through every node
  - Exponential-backoff retry on every fallible node (up to 3 attempts)
  - Parallel agent fan-out via asyncio.gather inside a single LangGraph node
  - Conditional routing: retry → fallback → human escalation
  - Immutable audit trail written at each state transition
  - Agent Communication Protocol (ACP) JSON envelopes persisted to DB

Graph topology:
  START
    └─► load_context ──[ok]──► run_parallel_agents ──[ok]──► aggregate_risk
                    ↘[err]↗                       ↘[err]↗
                   handle_error ──[retry<3]──► (back to failed node)
                                └─[fatal]──► fail_pipeline ──► END

  aggregate_risk ──► generate_explanation ──► make_decision ──► verify_decision
    ──[score≥threshold OR block]──► create_alert ──► update_invoice ──► complete ──► END
    ──[low-risk]──────────────────────────────────► update_invoice ──► complete ──► END
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, Optional

import structlog
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from core.config import settings
from services.agent_bus import AgentBus
from services.agents.anomaly_agent import AnomalyDetectionAgent
from services.agents.audit_agent import AuditAgent
from services.agents.context_agent import ContextRetrievalAgent
from services.agents.cv_agent import ComputerVisionAgent
from services.agents.fraud_simulation_agent import FraudSimulationAgent
from services.agents.multilingual_agent import MultilingualAgent
from services.agents.verification_agent import VerificationAgent
from services.gemini_service import analyze_invoice, generate_explanation

logger = structlog.get_logger()

# ─────────────────────────────────────────────
# State schema — the single source of truth
# that flows through every node in the graph.
# ─────────────────────────────────────────────

class InvoiceState(TypedDict, total=False):
    # ── Inputs ──────────────────────────────
    invoice_id: str
    job_id: str
    trace_id: str

    # ── Data assembled by context node ──────
    context_packet: Optional[dict]
    invoice: Optional[dict]
    supplier_info: dict
    baseline: Optional[dict]
    behavioral: dict
    invoice_text: str

    # ── Per-agent results ────────────────────
    llm_result: dict
    anomaly_result: dict
    cv_result: dict
    multilingual_result: dict
    fraud_result: dict

    # ── Aggregation ──────────────────────────
    final_score: float
    risk_level: str
    all_flags: list

    # ── Decision ─────────────────────────────
    explanation: str
    decision: str
    verification: dict
    alert_id: Optional[str]

    # ── Control flow ─────────────────────────
    retry_count: int          # resets per-segment
    node_errors: list         # accumulated error strings
    retry_target: str         # which node to retry
    current_step: str
    progress: int
    step_index: int
    total_steps: int
    step_history: list
    needs_human_review: bool
    escalation_reason: str
    failed: bool
    failure_reason: str

    # ── Final output ─────────────────────────
    result: Optional[dict]


# ─────────────────────────────────────────────
# LangGraphOrchestrator
# ─────────────────────────────────────────────

class LangGraphOrchestrator:
    """
    Builds and compiles the LangGraph pipeline.
    All nodes are async methods that close over self.db and agent instances.
    """

    TOTAL_STEPS = 20
    RETRYABLE_TARGETS = {
        "load_context",
        "run_parallel_agents",
        "aggregate_risk",
        "generate_explanation",
        "make_decision",
        "verify_decision",
        "escalate_human_review",
        "create_alert",
        "update_invoice",
        "complete_pipeline",
    }

    def __init__(self, db: Any):
        self.db = db
        self.anomaly = AnomalyDetectionAgent()
        self.audit = AuditAgent(db)
        self.context_agent = ContextRetrievalAgent(db)
        self.verifier = VerificationAgent()
        self.bus = AgentBus(db)
        self.cv = ComputerVisionAgent()
        self.multi = MultilingualAgent()
        self.fraud_sim = FraudSimulationAgent()
        self._graph = self._build_graph()

    # ─────────────────────────────────────────
    # Graph construction
    # ─────────────────────────────────────────

    def _build_graph(self):
        g = StateGraph(InvoiceState)

        # Register nodes
        g.add_node("load_context",        self._node_load_context)
        g.add_node("run_parallel_agents", self._node_run_parallel_agents)
        g.add_node("aggregate_risk",      self._node_aggregate_risk)
        g.add_node("generate_explanation",self._node_generate_explanation)
        g.add_node("make_decision",       self._node_make_decision)
        g.add_node("verify_decision",     self._node_verify_decision)
        g.add_node("escalate_human_review", self._node_escalate_human_review)
        g.add_node("create_alert",        self._node_create_alert)
        g.add_node("update_invoice",      self._node_update_invoice)
        g.add_node("complete_pipeline",   self._node_complete_pipeline)
        g.add_node("handle_error",        self._node_handle_error)
        g.add_node("fail_pipeline",       self._node_fail_pipeline)

        # ── Entry ────────────────────────────
        g.add_edge(START, "load_context")

        # ── load_context → next or error ─────
        g.add_conditional_edges(
            "load_context",
            self._route_after_context,
            {
                "run_parallel_agents": "run_parallel_agents",
                "handle_error": "handle_error",
            },
        )

        # ── parallel agents → next or error ──
        g.add_conditional_edges(
            "run_parallel_agents",
            self._route_after_parallel,
            {
                "aggregate_risk": "aggregate_risk",
                "handle_error": "handle_error",
            },
        )

        # ── error handler → retry or fatal ───
        g.add_conditional_edges(
            "handle_error",
            self._route_error_handler,
            {
                "load_context":        "load_context",
                "run_parallel_agents": "run_parallel_agents",
                "fail_pipeline":       "fail_pipeline",
            },
        )

        # ── happy path ───────────────────────
        g.add_edge("aggregate_risk",       "generate_explanation")
        g.add_edge("generate_explanation", "make_decision")
        g.add_edge("make_decision",        "verify_decision")

        # ── conditional alert creation ────────
        g.add_conditional_edges(
            "verify_decision",
            self._route_after_verify,
            {
                "escalate_human_review": "escalate_human_review",
                "create_alert":  "create_alert",
                "update_invoice":"update_invoice",
            },
        )

        g.add_edge("escalate_human_review", "create_alert")
        g.add_edge("create_alert",     "update_invoice")
        g.add_edge("update_invoice",   "complete_pipeline")
        g.add_edge("complete_pipeline", END)
        g.add_edge("fail_pipeline",    END)

        return g.compile()

    # ─────────────────────────────────────────
    # Public entry point
    # ─────────────────────────────────────────

    async def process_invoice(self, invoice_id: str, job_id: str) -> dict:
        trace_id = str(uuid.uuid4())
        initial: InvoiceState = {
            "invoice_id": invoice_id,
            "job_id":     job_id,
            "trace_id":   trace_id,
            # defaults
            "context_packet":   None,
            "invoice":          None,
            "supplier_info":    {},
            "baseline":         None,
            "behavioral":       {},
            "invoice_text":     "",
            "llm_result":       {},
            "anomaly_result":   {},
            "cv_result":        {},
            "multilingual_result": {},
            "fraud_result":     {},
            "final_score":      0.0,
            "risk_level":       "low",
            "all_flags":        [],
            "explanation":      "",
            "decision":         "review",
            "verification":     {},
            "alert_id":         None,
            "retry_count":      0,
            "node_errors":      [],
            "retry_target":     "",
            "current_step":     "starting",
            "progress":         0,
            "step_index":       0,
            "total_steps":      self.TOTAL_STEPS,
            "step_history":     [],
            "needs_human_review": False,
            "escalation_reason": "",
            "failed":           False,
            "failure_reason":   "",
            "result":           None,
        }

        logger.info("LangGraph pipeline starting", invoice_id=invoice_id, trace_id=trace_id)
        final_state = await self._graph.ainvoke(initial)

        if final_state.get("failed"):
            raise RuntimeError(final_state.get("failure_reason", "Pipeline failed"))

        return final_state.get("result", {})

    # ─────────────────────────────────────────
    # Nodes
    # ─────────────────────────────────────────

    def _step_token(self, step_index: int, label: str) -> str:
        return f"Step {step_index:02d}/{self.TOTAL_STEPS} - {label}"

    def _append_steps(self, state: InvoiceState, milestones: list[tuple[int, str, int]]) -> dict:
        history = list(state.get("step_history", []))
        for step_index, label, progress in milestones:
            history.append({
                "step_index": step_index,
                "label": label,
                "progress": progress,
            })
        last_index, last_label, last_progress = milestones[-1]
        return {
            "step_index": last_index,
            "total_steps": self.TOTAL_STEPS,
            "current_step": self._step_token(last_index, last_label),
            "progress": last_progress,
            "step_history": history,
        }

    async def _update_job_step(self, job_id: str, step_index: int, label: str, progress: int) -> None:
        await self._update_job(job_id, self._step_token(step_index, label), progress)

    async def _node_load_context(self, state: InvoiceState) -> dict:
        invoice_id = state["invoice_id"]
        job_id     = state["job_id"]
        trace_id   = state["trace_id"]
        log        = logger.bind(invoice_id=invoice_id, node="load_context")
        log.info("Node: load_context")

        try:
            await self._update_job_step(job_id, 1, "load_context:start", 2)
            packet = await self.context_agent.get_context(invoice_id)
            if not packet:
                raise ValueError(f"Invoice {invoice_id} not found in database")

            invoice      = packet["invoice"]
            supplier_info = packet.get("supplier", {})
            behavioral   = packet.get("behavioral", {})
            invoice_text = packet.get("invoice_text", "")

            await self._update_job_step(job_id, 2, "load_context:invoice_loaded", 5)
            await self._update_job_step(job_id, 3, "load_context:supplier_loaded", 7)

            await self.audit.log(
                trace_id, invoice_id, "context_agent", "context_loaded",
                {"invoice_id": invoice_id},
                {"status": "found", "amount": invoice.get("amount"), "supplier": supplier_info.get("name")},
            )
            await self.bus.publish(
                trace_id=trace_id,
                from_agent="context_agent",
                to_agent="orchestrator",
                message_type="CONTEXT_READY",
                payload={"invoice_id": invoice_id, "has_baseline": packet.get("baseline") is not None},
            )
            await self._update_job_step(job_id, 4, "load_context:context_published", 10)

            log.info("Context loaded", supplier=supplier_info.get("name"))
            return {
                **self._append_steps(state, [
                    (1, "load_context:start", 2),
                    (2, "load_context:invoice_loaded", 5),
                    (3, "load_context:supplier_loaded", 7),
                    (4, "load_context:context_published", 10),
                ]),
                "context_packet": packet,
                "invoice":        dict(invoice),
                "supplier_info":  supplier_info,
                "baseline":       packet.get("baseline"),
                "behavioral":     behavioral,
                "invoice_text":   invoice_text,
                "current_step":   self._step_token(4, "load_context:context_published"),
                "progress":       10,
                "retry_count":    0,   # reset for next segment
            }
        except Exception as exc:
            log.error("load_context failed", error=str(exc))
            return {
                "node_errors":  state.get("node_errors", []) + [f"load_context: {exc}"],
                "retry_target": "load_context",
                "current_step": "context_error",
                "step_history": list(state.get("step_history", [])) + [{
                    "step_index": state.get("step_index", 0),
                    "label": "load_context:error",
                    "progress": state.get("progress", 0),
                }],
            }

    async def _node_run_parallel_agents(self, state: InvoiceState) -> dict:
        invoice_id   = state["invoice_id"]
        job_id       = state["job_id"]
        trace_id     = state["trace_id"]
        invoice      = state["invoice"]
        supplier_info = state["supplier_info"]
        behavioral   = state["behavioral"]
        invoice_text = state["invoice_text"]
        baseline     = state["baseline"]
        log          = logger.bind(invoice_id=invoice_id, node="run_parallel_agents")
        log.info("Node: run_parallel_agents — fanning out 5 agents")

        try:
            await self._update_job_step(job_id, 5, "run_parallel_agents:start", 35)

            # Fan-out: all 5 agents run concurrently
            results = await asyncio.gather(
                self._run_llm(invoice_text, supplier_info, behavioral, trace_id, invoice_id),
                self._run_anomaly(invoice, baseline, trace_id, invoice_id),
                self._run_cv(invoice, invoice_text, trace_id, invoice_id),
                self._run_multilingual(invoice_text, trace_id, invoice_id),
                self._run_fraud_simulation(invoice, baseline, trace_id, invoice_id),
                return_exceptions=True,
            )

            llm_r, anomaly_r, cv_r, multi_r, fraud_r = results

            # Graceful degradation — never let one agent kill the pipeline
            def _safe(result, default):
                return result if not isinstance(result, Exception) else default

            llm_result       = _safe(llm_r,    {"risk_score": 50, "flags": [], "explanation": f"LLM error: {llm_r}", "confidence": 0.3})
            anomaly_result   = _safe(anomaly_r, {"risk_score": 30, "flags": [], "anomaly_score": 0.3})
            cv_result        = _safe(cv_r,      {"risk_score": 20, "flags": []})
            multilingual_result = _safe(multi_r, {"risk_score": 10, "flags": []})
            fraud_result     = _safe(fraud_r,   {"risk_score": 15, "flags": []})

            # Publish ACP findings to the bus
            for agent_name, res in [
                ("llm_analysis_agent",       llm_result),
                ("anomaly_detection_agent",  anomaly_result),
                ("computer_vision_agent",    cv_result),
                ("multilingual_agent",       multilingual_result),
                ("fraud_simulation_agent",   fraud_result),
            ]:
                await self.bus.publish(
                    trace_id=trace_id,
                    from_agent=agent_name,
                    to_agent="risk_aggregator",
                    message_type="FINDING_SHARE",
                    payload={
                        "risk_score": res.get("risk_score"),
                        "flag_count": len(res.get("flags", [])),
                    },
                )

            log.info("All agents completed",
                llm=llm_result.get("risk_score"),
                anomaly=anomaly_result.get("risk_score"),
                cv=cv_result.get("risk_score"),
            )
            return {
                **self._append_steps(state, [
                    (5, "run_parallel_agents:start", 35),
                    (6, "llm:analyzed", 45),
                    (7, "anomaly:analyzed", 50),
                    (8, "cv:analyzed", 55),
                    (9, "multilingual:analyzed", 60),
                    (10, "fraud_simulation:analyzed", 65),
                ]),
                "llm_result":          llm_result,
                "anomaly_result":      anomaly_result,
                "cv_result":           cv_result,
                "multilingual_result": multilingual_result,
                "fraud_result":        fraud_result,
                "current_step":        self._step_token(10, "fraud_simulation:analyzed"),
                "progress":            65,
                "retry_count":         0,
            }

        except Exception as exc:
            log.error("run_parallel_agents failed", error=str(exc))
            return {
                "node_errors":  state.get("node_errors", []) + [f"parallel_agents: {exc}"],
                "retry_target": "run_parallel_agents",
            }

    async def _node_aggregate_risk(self, state: InvoiceState) -> dict:
        invoice_id = state["invoice_id"]
        job_id     = state["job_id"]
        trace_id   = state["trace_id"]
        log        = logger.bind(invoice_id=invoice_id, node="aggregate_risk")
        log.info("Node: aggregate_risk")

        await self._update_job_step(job_id, 11, "aggregate_risk", 70)

        llm   = state["llm_result"]
        anom  = state["anomaly_result"]
        cv    = state["cv_result"]
        multi = state["multilingual_result"]
        fraud = state["fraud_result"]

        ls  = float(llm.get("risk_score")   or 50)
        as_ = float(anom.get("risk_score")  or 30)
        cs  = float(cv.get("risk_score")    or 0)
        ms  = float(multi.get("risk_score") or 0)
        fs  = float(fraud.get("risk_score") or 0)

        # Weighted aggregation (from plan: LLM 42%, Anomaly 30%, CV 12%, NLP 8%, GAN 8%)
        weighted = (ls * 0.42) + (as_ * 0.30) + (cs * 0.12) + (ms * 0.08) + (fs * 0.08)

        # Boost if LLM + anomaly both high (high confidence fraud)
        if ls > 70 and as_ > 70:
            weighted = min(weighted * 1.1, 100)

        final_score = round(weighted, 2)
        risk_level  = (
            "critical" if final_score >= 80 else
            "high"     if final_score >= 60 else
            "medium"   if final_score >= 40 else
            "low"
        )

        all_flags = (
            llm.get("flags", [])   +
            anom.get("flags", [])  +
            cv.get("flags", [])    +
            multi.get("flags", []) +
            fraud.get("flags", [])
        )

        await self.audit.log(
            trace_id, invoice_id, "risk_aggregator", "scores_aggregated",
            {"llm": ls, "anomaly": as_, "cv": cs, "multilingual": ms, "fraud_sim": fs},
            {"final_score": final_score, "risk_level": risk_level, "flag_count": len(all_flags)},
        )
        log.info("Risk aggregated", score=final_score, level=risk_level)

        return {
            **self._append_steps(state, [(11, "aggregate_risk", 70)]),
            "final_score": final_score,
            "risk_level":  risk_level,
            "all_flags":   all_flags,
            "current_step": self._step_token(11, "aggregate_risk"),
            "progress":    75,
        }

    async def _node_generate_explanation(self, state: InvoiceState) -> dict:
        invoice_id   = state["invoice_id"]
        job_id       = state["job_id"]
        trace_id     = state["trace_id"]
        invoice      = state["invoice"]
        supplier_info = state["supplier_info"]
        log          = logger.bind(invoice_id=invoice_id, node="generate_explanation")
        log.info("Node: generate_explanation")

        await self._update_job_step(job_id, 12, "generate_explanation", 80)

        try:
            explanation = await generate_explanation(
                {"llm": state["llm_result"], "anomaly": state["anomaly_result"], "flags": state["all_flags"]},
                invoice.get("invoice_number", "N/A"),
                supplier_info.get("name", "Unknown"),
                float(invoice.get("amount") or 0),
                invoice.get("currency", "USD"),
                state["final_score"],
            )
        except Exception as exc:
            log.warning("Explanation generation failed, using fallback", error=str(exc))
            explanation = (
                f"Risk score {state['final_score']}/100 ({state['risk_level'].upper()}) "
                f"for invoice {invoice.get('invoice_number','N/A')} from "
                f"{supplier_info.get('name','Unknown')}. "
                f"{len(state['all_flags'])} flag(s) detected."
            )

        await self.audit.log(
            trace_id, invoice_id, "orchestrator", "explanation_generated",
            {"score": state["final_score"]},
            {"explanation_length": len(explanation)},
        )
        log.info("Explanation generated", length=len(explanation))

        return {
            **self._append_steps(state, [(12, "generate_explanation", 80)]),
            "explanation":  explanation,
            "current_step": self._step_token(12, "generate_explanation"),
            "progress":     83,
        }

    async def _node_make_decision(self, state: InvoiceState) -> dict:
        invoice_id = state["invoice_id"]
        log = logger.bind(invoice_id=invoice_id, node="make_decision")
        log.info("Node: make_decision")

        score = state["final_score"]
        if score >= settings.RISK_AUTO_BLOCK:
            decision = "block"
        elif score >= settings.RISK_HUMAN_REVIEW:
            decision = "review"
        else:
            decision = "approve"

        log.info("Decision made", decision=decision, score=score)
        return {
            **self._append_steps(state, [(13, "make_decision", 86)]),
            "decision":     decision,
            "current_step": self._step_token(13, "make_decision"),
            "progress":     86,
        }

    async def _node_verify_decision(self, state: InvoiceState) -> dict:
        invoice_id = state["invoice_id"]
        job_id     = state["job_id"]
        trace_id   = state["trace_id"]
        log = logger.bind(invoice_id=invoice_id, node="verify_decision")
        log.info("Node: verify_decision")

        await self._update_job_step(job_id, 14, "verify_decision", 88)

        verification = self.verifier.verify(
            state["invoice"],
            state["final_score"],
            state["all_flags"],
            state["decision"],
        )

        final_decision = verification["final_decision"]

        if settings.ENABLE_VERIFICATION_RULES and final_decision != state["decision"]:
            log.warning("Verification overrode decision",
                proposed=state["decision"], final=final_decision)

        await self.bus.publish(
            trace_id=trace_id,
            from_agent="verification_agent",
            to_agent="orchestrator",
            message_type="DECISION_REVIEW",
            payload={
                "proposed_decision": verification["proposed_decision"],
                "final_decision":    verification["final_decision"],
                "rules_enabled":     verification["rules_enabled"],
            },
        )
        await self.audit.log(
            trace_id, invoice_id, "verification_agent", "decision_verified",
            {"proposed_decision": verification["proposed_decision"]},
            {"final_decision": verification["final_decision"], "checks": verification["checks"]},
        )
        await self.audit.log(
            trace_id, invoice_id, "orchestrator", f"decision_{final_decision}",
            {"risk_score": state["final_score"]},
            {"decision": final_decision},
        )

        log.info("Decision verified", decision=final_decision)
        return {
            **self._append_steps(state, [(14, "verify_decision", 90)]),
            "decision":     final_decision,
            "verification": verification,
            "current_step": self._step_token(14, "verify_decision"),
            "progress":     90,
        }

    async def _node_escalate_human_review(self, state: InvoiceState) -> dict:
        invoice_id = state["invoice_id"]
        job_id     = state["job_id"]
        trace_id   = state["trace_id"]
        log        = logger.bind(invoice_id=invoice_id, node="escalate_human_review")
        log.info("Node: escalate_human_review")

        await self._update_job_step(job_id, 15, "escalate_human_review", 91)
        reason = (
            "high_risk_score"
            if state.get("final_score", 0) >= settings.RISK_HUMAN_REVIEW
            else "blocked_or_verified_override"
        )
        await self.bus.publish(
            trace_id=trace_id,
            from_agent="orchestrator",
            to_agent="human_reviewer",
            message_type="HUMAN_ESCALATION",
            payload={
                "invoice_id": invoice_id,
                "risk_score": state.get("final_score", 0),
                "risk_level": state.get("risk_level", "low"),
                "decision": state.get("decision", "review"),
                "reason": reason,
                "flags": state.get("all_flags", []),
            },
        )
        await self.audit.log(
            trace_id, invoice_id, "orchestrator", "human_escalation_requested",
            {"risk_score": state.get("final_score", 0)},
            {"reason": reason, "decision": state.get("decision", "review")},
        )
        return {
            **self._append_steps(state, [(15, "escalate_human_review", 91)]),
            "needs_human_review": True,
            "escalation_reason": reason,
            "current_step": self._step_token(15, "escalate_human_review"),
            "progress": 91,
        }

    async def _node_create_alert(self, state: InvoiceState) -> dict:
        invoice_id  = state["invoice_id"]
        job_id      = state["job_id"]
        trace_id    = state["trace_id"]
        invoice     = state["invoice"]
        supplier_info = state["supplier_info"]
        log = logger.bind(invoice_id=invoice_id, node="create_alert")
        log.info("Node: create_alert")

        await self._update_job_step(job_id, 16, "create_alert", 92)

        try:
            llm_result  = state["llm_result"]
            recommended = llm_result.get("recommended_action", "Review manually")
            alert_id    = await self._persist_alert(
                invoice_id,
                invoice.get("supplier_id"),
                state["final_score"],
                state["risk_level"],
                state["all_flags"],
                state["explanation"],
                recommended,
            )
            await self.audit.log(
                trace_id, invoice_id, "orchestrator", "alert_created",
                {"risk_score": state["final_score"]},
                {"alert_id": alert_id, "risk_level": state["risk_level"]},
            )
            log.info("Alert created", alert_id=alert_id)
            return {
                **self._append_steps(state, [(16, "create_alert", 94)]),
                "alert_id":     alert_id,
                "current_step": self._step_token(16, "create_alert"),
                "progress":     94,
            }
        except Exception as exc:
            log.error("Alert creation failed", error=str(exc))
            return {
                "node_errors": state.get("node_errors", []) + [f"create_alert: {exc}"],
                "retry_target": "create_alert",
                "current_step": "create_alert_error",
            }

    async def _node_update_invoice(self, state: InvoiceState) -> dict:
        invoice_id = state["invoice_id"]
        job_id     = state["job_id"]
        log = logger.bind(invoice_id=invoice_id, node="update_invoice")
        log.info("Node: update_invoice")

        await self._update_job_step(job_id, 17, "update_invoice", 96)

        try:
            status_map = {"approve": "approved", "review": "under_review", "block": "blocked"}
            from sqlalchemy import text
            await self.db.execute(
                text("UPDATE invoices SET status=:s, risk_score=:score, risk_level=:level WHERE invoice_id=:id"),
                {
                    "s":     status_map.get(state["decision"], "processed"),
                    "score": state["final_score"],
                    "level": state["risk_level"],
                    "id":    invoice_id,
                },
            )
            await self.db.commit()
            log.info("Invoice updated", decision=state["decision"])

            return {
                **self._append_steps(state, [(17, "update_invoice", 98)]),
                "current_step": self._step_token(17, "update_invoice"),
                "progress": 98,
            }
        except Exception as exc:
            log.error("Invoice update failed", error=str(exc))
            return {
                "node_errors": state.get("node_errors", []) + [f"update_invoice: {exc}"],
                "retry_target": "update_invoice",
                "current_step": "update_invoice_error",
            }

    async def _node_complete_pipeline(self, state: InvoiceState) -> dict:
        invoice_id = state["invoice_id"]
        job_id     = state["job_id"]
        trace_id   = state["trace_id"]
        invoice    = state["invoice"]
        invoice_text = state.get("invoice_text", "")
        log = logger.bind(invoice_id=invoice_id, node="complete_pipeline")
        log.info("Node: complete_pipeline")

        final_steps = self._append_steps(state, [
            (18, "complete_pipeline:result_persisted", 99),
            (19, "complete_pipeline:audit_finalized", 100),
            (20, "complete_pipeline:return_ready", 100),
        ])
        result = {
            "invoice_id":             invoice_id,
            "trace_id":               trace_id,
            "risk_score":             state["final_score"],
            "risk_level":             state["risk_level"],
            "decision":               state["decision"],
            "alert_id":               state.get("alert_id"),
            "flags":                  state["all_flags"],
            "explanation":            state["explanation"],
            "extracted_text_preview": (invoice_text or "")[:2000],
            "extracted_text_length":  len(invoice_text or ""),
            "llm_analysis":           state["llm_result"],
            "anomaly_analysis":       state["anomaly_result"],
            "cv_analysis":            state["cv_result"],
            "multilingual_analysis":  state["multilingual_result"],
            "fraud_simulation_analysis": state["fraud_result"],
            "verification":           state["verification"],
            "langgraph": True,        # flag so callers know LangGraph was used
            "node_errors":            state.get("node_errors", []),
            "step_index":             final_steps["step_index"],
            "total_steps":            final_steps["total_steps"],
            "step_history":           final_steps["step_history"],
            "needs_human_review":     state.get("needs_human_review", False),
            "escalation_reason":      state.get("escalation_reason", ""),
            "processed_at":           datetime.utcnow().isoformat(),
        }

        await self._update_job_step(job_id, 20, "complete_pipeline:return_ready", 100)
        await self._complete_job(job_id, result)
        await self.audit.log(
            trace_id, invoice_id, "orchestrator", "pipeline_complete",
            {"invoice_id": invoice_id},
            {"risk_score": state["final_score"], "decision": state["decision"]},
        )

        log.info("Pipeline complete",
            risk_score=state["final_score"],
            decision=state["decision"],
            langgraph=True,
        )
        return {
            **final_steps,
            "result": result,
            "current_step": self._step_token(20, "complete_pipeline:return_ready"),
            "progress": 100,
        }

    async def _node_handle_error(self, state: InvoiceState) -> dict:
        retry_count  = state.get("retry_count", 0)
        retry_target = state.get("retry_target", "")
        errors       = state.get("node_errors", [])
        log = logger.bind(retry_count=retry_count, target=retry_target)

        if retry_count < 3:
            backoff = 2 ** retry_count          # 1s, 2s, 4s
            log.warning("Retrying node after backoff", backoff_secs=backoff)
            await asyncio.sleep(backoff)
            return {
                "retry_count": retry_count + 1,
                "current_step": f"retry_{retry_target}",
                "step_history": list(state.get("step_history", [])) + [{
                    "step_index": state.get("step_index", 0),
                    "label": f"retry:{retry_target}",
                    "progress": state.get("progress", 0),
                }],
            }
        else:
            log.error("Max retries exhausted", errors=errors, target=retry_target)
            return {
                "retry_target": "escalate_human_review" if retry_target in self.RETRYABLE_TARGETS else "fail_pipeline",
                "current_step": "max_retries_exhausted",
                "needs_human_review": True,
                "escalation_reason": f"retry_exhausted:{retry_target}",
            }

    async def _node_fail_pipeline(self, state: InvoiceState) -> dict:
        job_id       = state["job_id"]
        invoice_id   = state["invoice_id"]
        trace_id     = state.get("trace_id", "unknown")
        errors       = state.get("node_errors", [])
        failure      = "; ".join(errors) if errors else "Unknown pipeline failure"
        log = logger.bind(invoice_id=invoice_id)
        log.error("Pipeline failed permanently", reason=failure)

        await self._fail_job(job_id, failure)
        await self.audit.log(
            trace_id, invoice_id, "orchestrator", "pipeline_failed",
            {}, {"error": failure}, status="failed",
        )

        return {
            "failed": True,
            "failure_reason": failure,
            "current_step": "failed",
            "progress": 0,
            "step_history": list(state.get("step_history", [])),
            "needs_human_review": state.get("needs_human_review", False),
            "escalation_reason": state.get("escalation_reason", ""),
        }

    # ─────────────────────────────────────────
    # Routing functions (conditional edges)
    # ─────────────────────────────────────────

    def _route_after_context(self, state: InvoiceState) -> str:
        errors = state.get("node_errors", [])
        if errors and any("load_context" in e for e in errors):
            return "handle_error"
        if not state.get("invoice"):
            return "handle_error"
        return "run_parallel_agents"

    def _route_after_parallel(self, state: InvoiceState) -> str:
        errors = state.get("node_errors", [])
        if errors and any("parallel_agents" in e for e in errors):
            return "handle_error"
        # LLM result missing is a critical failure
        if not state.get("llm_result"):
            return "handle_error"
        return "aggregate_risk"

    def _route_error_handler(self, state: InvoiceState) -> str:
        target = state.get("retry_target", "fail_pipeline")
        if target == "fail_pipeline":
            return "fail_pipeline"
        retry_count = state.get("retry_count", 0)
        # After backoff sleep in handle_error, retry_count was incremented.
        # If we've already marked it for fail_pipeline, go there.
        if retry_count > 3:
            return "fail_pipeline"
        return target if target in self.RETRYABLE_TARGETS else "fail_pipeline"

    def _route_after_verify(self, state: InvoiceState) -> str:
        score    = state.get("final_score", 0)
        decision = state.get("decision", "approve")
        if score >= settings.RISK_HUMAN_REVIEW or decision == "block":
            return "escalate_human_review"
        return "update_invoice"

    # ─────────────────────────────────────────
    # Individual agent runners (with audit)
    # ─────────────────────────────────────────

    async def _run_llm(self, text_content, supplier, behavioral, trace_id, invoice_id):
        start  = datetime.utcnow()
        result = await analyze_invoice(text_content, supplier, behavioral)
        dur    = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(trace_id, invoice_id, "llm_analysis_agent", "invoice_analyzed",
            {"text_length": len(text_content or "")},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur)
        return result

    async def _run_anomaly(self, invoice, baseline, trace_id, invoice_id):
        start  = datetime.utcnow()
        result = self.anomaly.analyze(dict(invoice), baseline)
        dur    = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(trace_id, invoice_id, "anomaly_detection_agent", "behavioral_analyzed",
            {"amount": invoice.get("amount")},
            {"risk_score": result.get("risk_score"), "anomaly_score": result.get("anomaly_score")},
            duration_ms=dur)
        return result

    async def _run_cv(self, invoice, invoice_text, trace_id, invoice_id):
        start  = datetime.utcnow()
        result = self.cv.analyze(dict(invoice), invoice_text)
        dur    = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(trace_id, invoice_id, "computer_vision_agent", "document_visual_analyzed",
            {"file_path": invoice.get("local_file_path")},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur)
        return result

    async def _run_multilingual(self, invoice_text, trace_id, invoice_id):
        start  = datetime.utcnow()
        result = self.multi.analyze(invoice_text)
        dur    = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(trace_id, invoice_id, "multilingual_agent", "language_risk_analyzed",
            {"text_length": len(invoice_text or "")},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur)
        return result

    async def _run_fraud_simulation(self, invoice, baseline, trace_id, invoice_id):
        start  = datetime.utcnow()
        result = self.fraud_sim.analyze(dict(invoice), baseline)
        dur    = int((datetime.utcnow() - start).total_seconds() * 1000)
        await self.audit.log(trace_id, invoice_id, "fraud_simulation_agent", "synthetic_pattern_scored",
            {"amount": invoice.get("amount")},
            {"risk_score": result.get("risk_score"), "flags": len(result.get("flags", []))},
            duration_ms=dur)
        return result

    # ─────────────────────────────────────────
    # DB helpers
    # ─────────────────────────────────────────

    async def _update_job(self, jid: str, step: str, progress: int):
        from sqlalchemy import text
        await self.db.execute(
            text("""
                UPDATE processing_jobs
                SET status='processing', current_step=:s, progress=:p,
                    started_at=COALESCE(started_at, CURRENT_TIMESTAMP)
                WHERE job_id=:id
            """),
            {"s": step, "p": progress, "id": jid},
        )
        await self.db.commit()

    async def _complete_job(self, jid: str, result: dict):
        from sqlalchemy import text
        await self.db.execute(
            text("""
                UPDATE processing_jobs
                SET status='completed', progress=100, result=:r,
                    completed_at=CURRENT_TIMESTAMP
                WHERE job_id=:id
            """),
            {"r": json.dumps(result, default=str), "id": jid},
        )
        await self.db.commit()

    async def _fail_job(self, jid: str, error: str):
        from sqlalchemy import text
        await self.db.execute(
            text("UPDATE processing_jobs SET status='failed', error_message=:e WHERE job_id=:id"),
            {"e": error, "id": jid},
        )
        await self.db.commit()

    async def _persist_alert(self, invoice_id, supplier_id, risk_score, risk_level,
                              flags, explanation, recommended_action) -> str:
        from sqlalchemy import text
        aid = str(uuid.uuid4())
        await self.db.execute(
            text("""
                INSERT INTO fraud_alerts
                    (alert_id, invoice_id, supplier_id, risk_score, risk_level,
                     flags, explanation_text, recommended_action, layer_triggered, created_at)
                VALUES
                    (:aid, :iid, :sid, :score, :level, :flags, :exp, :action, 'multi_agent_langgraph', CURRENT_TIMESTAMP)
            """),
            {
                "aid":    aid,
                "iid":    invoice_id,
                "sid":    str(supplier_id) if supplier_id else None,
                "score":  risk_score,
                "level":  risk_level,
                "flags":  json.dumps(flags, default=str),
                "exp":    explanation,
                "action": recommended_action,
            },
        )
        await self.db.commit()
        return aid
