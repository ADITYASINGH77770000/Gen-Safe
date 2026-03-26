"""Fraud Simulation Agent (GAN-inspired risk heuristic)."""


class FraudSimulationAgent:
    def analyze(self, invoice: dict, baseline: dict | None) -> dict:
        flags = []
        score = 0.0
        amount = float(invoice.get("amount") or 0)
        avg = float(baseline.get("avg_invoice_amount") or 0) if baseline else 0

        if avg > 0 and amount > avg * 2.5:
            score += 22
            flags.append(
                {
                    "type": "synthetic_pattern_deviation",
                    "description": "Invoice appears outside synthetic-normal behavior envelope.",
                    "severity": "medium",
                    "evidence": f"Amount {amount} vs baseline avg {avg}",
                }
            )

        if amount > 0 and amount % 500 == 0:
            score += 8
            flags.append(
                {
                    "type": "generated_amount_shape",
                    "description": "Rounded amount shape resembles synthetic fraud signature.",
                    "severity": "low",
                    "evidence": f"Amount {amount} divisible by 500",
                }
            )

        score = min(score, 100)
        return {
            "risk_score": round(score, 2),
            "risk_level": "high" if score >= 60 else "medium" if score >= 35 else "low",
            "flags": flags,
            "agent": "fraud_simulation_agent",
        }
