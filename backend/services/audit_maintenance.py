"""Audit integrity and retention utilities."""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import text

from core.config import settings


class AuditMaintenanceService:
    def __init__(self, db):
        self.db = db

    async def verify_integrity(self, trace_id: str | None = None, limit: int = 1000) -> dict:
        decision_rows = await self._load_rows(
            "agent_decisions",
            trace_id=trace_id,
            limit=limit,
            order_by="created_at ASC, id ASC",
        )
        message_rows = await self._load_rows(
            "agent_messages",
            trace_id=trace_id,
            limit=limit,
            order_by="created_at ASC, message_id ASC",
        )
        return {
            "trace_id": trace_id,
            "decisions": self._verify_collection(decision_rows, "record_hash", "previous_hash", self._decision_payload),
            "messages": self._verify_collection(message_rows, "record_hash", "previous_hash", self._message_payload),
        }

    async def retention_preview(self, retention_days: int | None = None) -> dict:
        days = int(retention_days or settings.AUDIT_RETENTION_DAYS)
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        preview = {}
        for table in ("agent_decisions", "agent_messages"):
            count = await self._scalar(
                f"SELECT COUNT(*) FROM {table} WHERE created_at < :cutoff",
                {"cutoff": cutoff},
            )
            oldest = await self._scalar_value(
                f"SELECT MIN(created_at) FROM {table} WHERE created_at < :cutoff",
                {"cutoff": cutoff},
            )
            preview[table] = {
                "eligible_for_retention": count,
                "oldest_eligible_record": oldest,
            }
        return {
            "retention_days": days,
            "cutoff": cutoff,
            "preview": preview,
            "enabled": bool(settings.ENABLE_AUDIT_RETENTION),
            "purge_allowed": bool(settings.ALLOW_AUDIT_PURGE),
        }

    async def export_and_purge(self, retention_days: int | None = None, archive_dir: str | None = None) -> dict:
        days = int(retention_days or settings.AUDIT_RETENTION_DAYS)
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        archive_root = Path(archive_dir or settings.AUDIT_ARCHIVE_DIR)
        archive_root.mkdir(parents=True, exist_ok=True)
        archive_path = archive_root / f"audit_archive_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.jsonl"

        exported_counts = {}
        with archive_path.open("w", encoding="utf-8") as handle:
            for table, order_by in (
                ("agent_decisions", "created_at ASC, id ASC"),
                ("agent_messages", "created_at ASC, message_id ASC"),
            ):
                rows = await self._load_rows(table, cutoff=cutoff, order_by=order_by)
                exported_counts[table] = len(rows)
                for row in rows:
                    handle.write(json.dumps({"table": table, **row}, default=str) + "\n")

        if not settings.ENABLE_AUDIT_RETENTION or not settings.ALLOW_AUDIT_PURGE:
            return {
                "archive_path": str(archive_path),
                "cutoff": cutoff,
                "exported": exported_counts,
                "purged": False,
                "message": "Retention is configured for archive-only mode. Enable purge flags to delete archived rows.",
            }

        deleted = {}
        for table in ("agent_decisions", "agent_messages"):
            result = await self.db.execute(
                text(f"DELETE FROM {table} WHERE created_at < :cutoff"),
                {"cutoff": cutoff},
            )
            deleted[table] = int(result.rowcount or 0)
        await self.db.commit()
        return {
            "archive_path": str(archive_path),
            "cutoff": cutoff,
            "exported": exported_counts,
            "purged": True,
            "deleted": deleted,
        }

    async def _load_rows(
        self,
        table: str,
        trace_id: str | None = None,
        cutoff: str | None = None,
        limit: int | None = None,
        order_by: str = "created_at ASC",
    ) -> list[dict]:
        sql = f"SELECT * FROM {table} WHERE 1=1"
        params: dict[str, object] = {}
        if trace_id:
            sql += " AND trace_id=:trace_id"
            params["trace_id"] = trace_id
        if cutoff:
            sql += " AND created_at < :cutoff"
            params["cutoff"] = cutoff
        sql += f" ORDER BY {order_by}"
        if limit is not None:
            sql += " LIMIT :limit"
            params["limit"] = int(limit)
        result = await self.db.execute(text(sql), params)
        return [dict(row) for row in result.mappings().all()]

    def _verify_collection(self, rows: list[dict], hash_field: str, prev_field: str, payload_builder):
        if not rows:
            return {"total": 0, "verified": 0, "mismatched": 0, "legacy": 0, "healthy": True, "traces": 0}

        by_trace: dict[str, list[dict]] = {}
        for row in rows:
            by_trace.setdefault(str(row.get("trace_id") or "legacy"), []).append(row)

        summary = {"total": 0, "verified": 0, "mismatched": 0, "legacy": 0, "healthy": True, "traces": len(by_trace)}
        for trace_rows in by_trace.values():
            trace_result = self._verify_chain(trace_rows, hash_field, prev_field, payload_builder)
            for key in ("total", "verified", "mismatched", "legacy"):
                summary[key] += trace_result[key]
            summary["healthy"] = summary["healthy"] and trace_result["healthy"]
        return summary

    def _verify_chain(self, rows: list[dict], hash_field: str, prev_field: str, payload_builder):
        verified = 0
        mismatched = 0
        legacy = 0
        previous_hash = None
        for row in rows:
            stored_hash = row.get(hash_field)
            if not stored_hash:
                legacy += 1
                previous_hash = None
                continue

            expected_hash = self._hash_payload(payload_builder(row), previous_hash)
            if stored_hash == expected_hash and row.get(prev_field) == previous_hash:
                verified += 1
            else:
                mismatched += 1
            previous_hash = stored_hash
        return {
            "total": len(rows),
            "verified": verified,
            "mismatched": mismatched,
            "legacy": legacy,
            "healthy": mismatched == 0,
        }

    def _decision_payload(self, row: dict) -> dict:
        return {
            "trace_id": row.get("trace_id"),
            "invoice_id": row.get("invoice_id"),
            "agent_id": row.get("agent_id"),
            "action": row.get("action"),
            "input": row.get("input_data"),
            "output": row.get("output_data"),
            "status": row.get("status"),
            "duration_ms": row.get("duration_ms"),
        }

    def _message_payload(self, row: dict) -> dict:
        return {
            "trace_id": row.get("trace_id"),
            "from_agent": row.get("from_agent"),
            "to_agent": row.get("to_agent"),
            "message_type": row.get("message_type"),
            "payload": row.get("payload"),
            "retry_count": row.get("retry_count"),
            "status": row.get("status"),
        }

    def _hash_payload(self, payload: dict, previous_hash: str | None) -> str:
        import hashlib

        payload_copy = dict(payload)
        payload_copy["previous_hash"] = previous_hash
        return hashlib.sha256(json.dumps(payload_copy, sort_keys=True, default=str).encode("utf-8")).hexdigest()

    async def _scalar(self, sql: str, params: dict | None = None) -> int:
        result = await self.db.execute(text(sql), params or {})
        return int(result.scalar() or 0)

    async def _scalar_value(self, sql: str, params: dict | None = None):
        result = await self.db.execute(text(sql), params or {})
        return result.scalar()
