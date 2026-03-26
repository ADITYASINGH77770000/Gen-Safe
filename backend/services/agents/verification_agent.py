"""Verification Agent - validates risk/flag consistency before final action."""
from core.config import settings


class VerificationAgent:
    def verify(
        self,
        invoice: dict,
        final_score: float,
        flags: list,
        proposed_decision: str,
    ) -> dict:
        checks = []
        final_decision = proposed_decision
        amount = float(invoice.get("amount") or 0)
        flag_count = len(flags or [])

        if final_score >= settings.RISK_AUTO_BLOCK and proposed_decision != "block":
            checks.append(
                "Risk score exceeds auto-block threshold; block is safer than non-block decision."
            )
            final_decision = "block"

        if final_score >= settings.RISK_HUMAN_REVIEW and proposed_decision == "approve":
            checks.append(
                "Risk score exceeds human-review threshold; approve decision is inconsistent."
            )
            final_decision = "review"

        high_value_threshold = float(settings.VERIFICATION_HIGH_VALUE_THRESHOLD)
        if amount >= high_value_threshold and proposed_decision == "approve":
            checks.append(
                "High-value invoice auto-approve is disabled by verification policy."
            )
            final_decision = "review"

        if final_score >= 80 and flag_count == 0:
            checks.append(
                "High risk score with zero flags detected; review model output consistency."
            )

        if not checks:
            checks.append("Verification passed with no policy violations.")

        # Backward-compatibility: keep old logic unless explicitly enabled.
        applied_decision = (
            final_decision if settings.ENABLE_VERIFICATION_RULES else proposed_decision
        )

        return {
            "proposed_decision": proposed_decision,
            "final_decision": applied_decision,
            "checks": checks,
            "rules_enabled": settings.ENABLE_VERIFICATION_RULES,
        }
