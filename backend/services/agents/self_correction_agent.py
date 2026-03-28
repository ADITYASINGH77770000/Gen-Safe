"""Self-correction and feedback loop agent."""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta

import structlog
from sqlalchemy import text

logger = structlog.get_logger()


class SelfCorrectionAgent:
    """Learns from analyst feedback and refreshes supplier baselines."""

    def __init__(self, db):
        self.db = db

    async def process_feedback(self, alert_id: str, was_correct: bool, analyst_note: str | None = None) -> dict:
        log = logger.bind(alert_id=alert_id, was_correct=was_correct)
        log.info("Self-correction agent triggered")

        try:
            result = await self.db.execute(
                text(
                    """
                    SELECT fa.*, i.amount, i.currency, i.supplier_id AS inv_supplier
                    FROM fraud_alerts fa
                    LEFT JOIN invoices i ON fa.invoice_id = i.invoice_id
                    WHERE fa.alert_id = :id
                    """
                ),
                {"id": alert_id},
            )
            alert = result.mappings().first()
            if not alert:
                return {"status": "alert_not_found"}

            supplier_id = str(alert.get("supplier_id") or alert.get("inv_supplier") or "")
            amount = float(alert.get("amount") or 0)
            outcome: dict[str, object] = {}

            if not was_correct and supplier_id:
                outcome["baseline_updated"] = await self._update_supplier_baseline(supplier_id, amount)

            if supplier_id:
                fp_count = await self._count_recent_false_positives(supplier_id)
                if fp_count >= 3:
                    await self._lower_supplier_sensitivity(supplier_id, fp_count)
                    outcome["sensitivity_adjusted"] = True
                    outcome["fp_count"] = fp_count
                    log.info("Supplier sensitivity lowered", supplier_id=supplier_id, fp_count=fp_count)

            await self._log_retraining_signal(alert_id, was_correct, analyst_note)
            outcome["retraining_signal_logged"] = True

            log.info("Self-correction complete", **outcome)
            return {"status": "ok", **outcome}
        except Exception as exc:
            log.error("Self-correction failed", error=str(exc))
            return {"status": "error", "error": str(exc)}

    async def compute_supplier_baselines(self, supplier_id: str | None = None) -> dict:
        if supplier_id:
            supplier_ids = [supplier_id]
        else:
            result = await self.db.execute(
                text("SELECT DISTINCT supplier_id FROM invoices WHERE supplier_id IS NOT NULL")
            )
            supplier_ids = [str(row[0]) for row in result.fetchall()]

        updated = 0
        for sid in supplier_ids:
            amounts_result = await self.db.execute(
                text(
                    """
                    SELECT amount
                    FROM invoices
                    WHERE supplier_id = :sid AND amount > 0
                    ORDER BY created_at DESC
                    LIMIT 100
                    """
                ),
                {"sid": sid},
            )
            amounts = [float(row[0]) for row in amounts_result.fetchall()]
            if len(amounts) < 2:
                continue

            avg = sum(amounts) / len(amounts)
            variance = sum((value - avg) ** 2 for value in amounts) / len(amounts)
            std = math.sqrt(variance)

            iban_result = await self.db.execute(
                text("SELECT bank_account_iban FROM suppliers WHERE supplier_id = :sid"),
                {"sid": sid},
            )
            iban_row = iban_result.mappings().first()
            iban = iban_row["bank_account_iban"] if iban_row else None

            existing = await self.db.execute(
                text("SELECT baseline_id FROM supplier_baselines WHERE supplier_id = :sid"),
                {"sid": sid},
            )
            if existing.fetchone():
                await self.db.execute(
                    text(
                        """
                        UPDATE supplier_baselines
                        SET avg_invoice_amount = :avg,
                            stddev_amount = :std,
                            invoice_count = :cnt,
                            typical_iban = :iban,
                            computed_at = CURRENT_TIMESTAMP
                        WHERE supplier_id = :sid
                        """
                    ),
                    {"avg": avg, "std": std, "cnt": len(amounts), "iban": iban, "sid": sid},
                )
            else:
                await self.db.execute(
                    text(
                        """
                        INSERT INTO supplier_baselines
                            (baseline_id, supplier_id, avg_invoice_amount, stddev_amount, invoice_count, typical_iban, computed_at)
                        VALUES
                            (:bid, :sid, :avg, :std, :cnt, :iban, CURRENT_TIMESTAMP)
                        """
                    ),
                    {
                        "bid": str(uuid.uuid4()),
                        "sid": sid,
                        "avg": avg,
                        "std": std,
                        "cnt": len(amounts),
                        "iban": iban,
                    },
                )
            updated += 1

        await self.db.commit()
        logger.info("Baselines recomputed", suppliers=updated)
        return {"suppliers_updated": updated, "total_suppliers": len(supplier_ids)}

    async def _update_supplier_baseline(self, supplier_id: str, invoice_amount: float) -> bool:
        try:
            result = await self.db.execute(
                text(
                    """
                    SELECT *
                    FROM supplier_baselines
                    WHERE supplier_id = :sid
                    ORDER BY computed_at DESC
                    LIMIT 1
                    """
                ),
                {"sid": supplier_id},
            )
            baseline = result.mappings().first()

            if baseline:
                old_avg = float(baseline["avg_invoice_amount"] or 0)
                old_count = int(baseline["invoice_count"] or 1)
                new_count = old_count + 1
                new_avg = ((old_avg * old_count) + invoice_amount) / new_count
                old_std = float(baseline["stddev_amount"] or 0)
                delta = invoice_amount - old_avg
                delta2 = invoice_amount - new_avg
                new_variance = ((old_std ** 2 * old_count) + delta * delta2) / new_count
                new_std = math.sqrt(max(new_variance, 0.0))
                await self.db.execute(
                    text(
                        """
                        UPDATE supplier_baselines
                        SET avg_invoice_amount = :avg,
                            stddev_amount = :std,
                            invoice_count = :cnt,
                            computed_at = CURRENT_TIMESTAMP
                        WHERE supplier_id = :sid
                        """
                    ),
                    {"avg": new_avg, "std": new_std, "cnt": new_count, "sid": supplier_id},
                )
            else:
                await self.db.execute(
                    text(
                        """
                        INSERT INTO supplier_baselines
                            (baseline_id, supplier_id, avg_invoice_amount, stddev_amount, invoice_count, computed_at)
                        VALUES
                            (:bid, :sid, :avg, :std, 1, CURRENT_TIMESTAMP)
                        """
                    ),
                    {
                        "bid": str(uuid.uuid4()),
                        "sid": supplier_id,
                        "avg": invoice_amount,
                        "std": max(invoice_amount * 0.1, 1.0),
                    },
                )

            await self.db.commit()
            return True
        except Exception as exc:
            logger.error("Baseline update failed", error=str(exc))
            return False

    async def _count_recent_false_positives(self, supplier_id: str) -> int:
        cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
        result = await self.db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM model_feedback mf
                JOIN fraud_alerts fa ON mf.alert_id = fa.alert_id
                WHERE fa.supplier_id = :sid
                  AND mf.was_correct = 0
                  AND mf.created_at >= :cutoff
                """
            ),
            {"sid": supplier_id, "cutoff": cutoff},
        )
        return int(result.scalar() or 0)

    async def _lower_supplier_sensitivity(self, supplier_id: str, fp_count: int):
        new_risk = "low" if fp_count >= 5 else "medium"
        await self.db.execute(
            text("UPDATE suppliers SET risk_level = :risk WHERE supplier_id = :sid"),
            {"risk": new_risk, "sid": supplier_id},
        )
        await self.db.commit()

    async def _log_retraining_signal(self, alert_id: str, was_correct: bool, note: str | None):
        feedback_type = "confirmed_fraud" if was_correct else "false_positive_correction"
        await self.db.execute(
            text(
                """
                UPDATE model_feedback
                SET feedback_type = :ft
                WHERE alert_id = :aid
                """
            ),
            {"ft": feedback_type, "aid": alert_id},
        )
        await self.db.commit()
