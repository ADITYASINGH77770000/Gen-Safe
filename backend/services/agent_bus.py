"""Agent communication protocol (ACP) bus persistence."""
import asyncio
import hashlib
import json
import uuid
from datetime import datetime

import structlog
from sqlalchemy import text

logger = structlog.get_logger()


class AgentBus:
    def __init__(self, db):
        self.db = db
        self._lock = asyncio.Lock()

    async def publish(
        self,
        trace_id: str,
        from_agent: str,
        to_agent: str,
        message_type: str,
        payload: dict,
        retry_count: int = 0,
    ) -> dict:
        message = {
            "message_id": str(uuid.uuid4()),
            "trace_id": trace_id,
            "from_agent": from_agent,
            "to_agent": to_agent,
            "message_type": message_type,
            "payload": payload,
            "retry_count": retry_count,
            "timestamp": datetime.utcnow().isoformat(),
        }
        try:
            async with self._lock:
                previous_hash = await self._latest_hash(trace_id)
                record_hash = self._compute_record_hash(
                    trace_id=trace_id,
                    from_agent=from_agent,
                    to_agent=to_agent,
                    message_type=message_type,
                    payload=payload,
                    retry_count=retry_count,
                    previous_hash=previous_hash,
                )
                await self.db.execute(
                    text(
                        """
                        INSERT INTO agent_messages
                            (message_id, trace_id, from_agent, to_agent, message_type, payload, retry_count, status,
                             previous_hash, record_hash, created_at)
                        VALUES
                            (:mid, :trace_id, :from_agent, :to_agent, :msg_type, :payload, :retry_count, 'published',
                             :prev_hash, :record_hash, CURRENT_TIMESTAMP)
                        """
                    ),
                    {
                        "mid": message["message_id"],
                        "trace_id": trace_id,
                        "from_agent": from_agent,
                        "to_agent": to_agent,
                        "msg_type": message_type,
                        "payload": json.dumps(payload, default=str),
                        "retry_count": retry_count,
                        "prev_hash": previous_hash,
                        "record_hash": record_hash,
                    },
                )
                await self.db.commit()
        except Exception as exc:
            logger.error("Agent message publish failed", error=str(exc), trace_id=trace_id)
        return message

    async def _latest_hash(self, trace_id: str) -> str | None:
        result = await self.db.execute(
            text(
                """
                SELECT record_hash
                FROM agent_messages
                WHERE trace_id=:trace_id
                ORDER BY created_at DESC, message_id DESC
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
        from_agent,
        to_agent,
        message_type,
        payload,
        retry_count,
        previous_hash,
    ) -> str:
        payload_data = {
            "trace_id": trace_id,
            "from_agent": from_agent,
            "to_agent": to_agent,
            "message_type": message_type,
            "payload": payload,
            "retry_count": retry_count,
            "previous_hash": previous_hash,
        }
        return hashlib.sha256(json.dumps(payload_data, sort_keys=True, default=str).encode("utf-8")).hexdigest()

    async def list_messages(self, trace_id: str, limit: int = 200) -> list[dict]:
        result = await self.db.execute(
            text(
                """
                SELECT * FROM agent_messages
                WHERE trace_id=:trace_id
                ORDER BY created_at ASC
                LIMIT :limit
                """
            ),
            {"trace_id": trace_id, "limit": int(limit)},
        )
        rows = []
        for row in result.mappings().all():
            item = dict(row)
            payload = item.get("payload")
            if isinstance(payload, str):
                try:
                    item["payload"] = json.loads(payload)
                except Exception:
                    pass
            rows.append(item)
        return rows
