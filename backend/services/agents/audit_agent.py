"""Audit Agent - writes immutable decision records."""
import asyncio
import hashlib
import json
import uuid

import structlog
from sqlalchemy import text

logger = structlog.get_logger()


class AuditAgent:
    def __init__(self, db):
        self.db = db
        self._lock = asyncio.Lock()

    async def log(
        self,
        trace_id,
        invoice_id,
        agent_id,
        action,
        input_data,
        output_data,
        status="completed",
        duration_ms=None,
    ):
        try:
            input_str = json.dumps(input_data, default=str)
            output_str = json.dumps(output_data, default=str)

            async with self._lock:
                previous_hash = await self._latest_hash(trace_id)
                record_hash = self._compute_record_hash(
                    trace_id=trace_id,
                    invoice_id=invoice_id,
                    agent_id=agent_id,
                    action=action,
                    input_str=input_str,
                    output_str=output_str,
                    status=status,
                    duration_ms=duration_ms,
                    previous_hash=previous_hash,
                )
                await self.db.execute(
                    text(
                        """
                        INSERT INTO agent_decisions
                            (id, trace_id, invoice_id, agent_id, action, input_hash, output_hash,
                             input_data, output_data, reason_text, status, duration_ms,
                             previous_hash, record_hash, created_at)
                        VALUES
                            (:id, :tid, :iid, :aid, :action, :ihash, :ohash,
                             :idata, :odata, :reason, :status, :dur, :prev_hash, :record_hash, CURRENT_TIMESTAMP)
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "tid": trace_id,
                        "iid": invoice_id,
                        "aid": agent_id,
                        "action": action,
                        "ihash": hashlib.sha256(input_str.encode()).hexdigest()[:16],
                        "ohash": hashlib.sha256(output_str.encode()).hexdigest()[:16],
                        "idata": input_str,
                        "odata": output_str,
                        "reason": output_data.get("reason_text", action)
                        if isinstance(output_data, dict)
                        else action,
                        "status": status,
                        "dur": duration_ms,
                        "prev_hash": previous_hash,
                        "record_hash": record_hash,
                    },
                )
                await self.db.commit()
        except Exception as e:
            logger.error("Audit log failed", error=str(e), agent=agent_id)

    async def _latest_hash(self, trace_id: str) -> str | None:
        result = await self.db.execute(
            text(
                """
                SELECT record_hash
                FROM agent_decisions
                WHERE trace_id=:trace_id
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """
            ),
            {"trace_id": trace_id},
        )
        row = result.mappings().first()
        if row and row.get("record_hash"):
            return str(row["record_hash"])
        return None

    def _compute_record_hash(
        self,
        *,
        trace_id,
        invoice_id,
        agent_id,
        action,
        input_str,
        output_str,
        status,
        duration_ms,
        previous_hash,
    ) -> str:
        payload = {
            "trace_id": trace_id,
            "invoice_id": invoice_id,
            "agent_id": agent_id,
            "action": action,
            "input": input_str,
            "output": output_str,
            "status": status,
            "duration_ms": duration_ms,
            "previous_hash": previous_hash,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()
