"""Anomaly Detection Agent — behavioral scoring"""
from datetime import datetime
import structlog
logger = structlog.get_logger()

class AnomalyDetectionAgent:
    def analyze(self, invoice: dict, baseline: dict) -> dict:
        flags = []
        score = 0.0
        amount = float(invoice.get("amount") or 0)
        avg = float(baseline.get("avg_invoice_amount") or 0) if baseline else 0
        stddev = float(baseline.get("stddev_amount") or 1) if baseline else 1
        invoice_count = int(baseline.get("invoice_count") or 0) if baseline else 0
        typical_iban = baseline.get("typical_iban") if baseline else None
        current_iban = invoice.get("supplier_bank_iban", "") or ""

        # Amount deviation
        if avg > 0 and stddev > 0:
            deviation = abs(amount - avg) / stddev
            if deviation > 3:
                score += 35
                flags.append({"type": "extreme_amount_deviation", "description": f"Amount is {deviation:.1f} standard deviations from supplier average", "severity": "high", "evidence": f"Amount: {amount}, Avg: {avg:.2f}, StdDev: {stddev:.2f}"})
            elif deviation > 2:
                score += 20
                flags.append({"type": "high_amount_deviation", "description": "Amount deviates significantly from supplier pattern", "severity": "medium", "evidence": f"Deviation: {deviation:.1f}σ"})
        elif invoice_count == 0:
            score += 10
            flags.append({"type": "new_supplier", "description": "First invoice — no baseline available", "severity": "low", "evidence": "No historical invoices"})

        # Bank account change
        if typical_iban and current_iban and typical_iban != current_iban:
            score += 40
            flags.append({"type": "bank_account_change", "description": "Bank IBAN differs from previous invoices", "severity": "high", "evidence": f"Previous: {typical_iban[:8]}... Current: {current_iban[:8]}..."})

        # Round number
        if amount > 0 and amount % 1000 == 0 and amount >= 5000:
            score += 10
            flags.append({"type": "round_number", "description": "Suspiciously round invoice amount", "severity": "low", "evidence": f"Amount: {amount} (exact multiple of 1000)"})

        # Weekend submission
        created = invoice.get("created_at")
        if created:
            try:
                dt = datetime.fromisoformat(str(created).replace("Z", "+00:00")) if isinstance(created, str) else created
                if dt.weekday() >= 5:
                    score += 8
                    flags.append({"type": "weekend_submission", "description": "Invoice submitted on weekend", "severity": "low", "evidence": f"Submitted on {dt.strftime('%A')}"})
            except Exception:
                pass

        # Zero/negative amount
        if amount <= 0:
            score += 50
            flags.append({"type": "invalid_amount", "description": "Zero or negative amount", "severity": "high", "evidence": f"Amount: {amount}"})

        risk_score = min(score, 100)
        return {
            "risk_score": risk_score,
            "anomaly_score": round(min(score / 100, 1.0), 3),
            "risk_level": "critical" if risk_score >= 80 else "high" if risk_score >= 60 else "medium" if risk_score >= 40 else "low",
            "flags": flags,
            "agent": "anomaly_detection"
        }
