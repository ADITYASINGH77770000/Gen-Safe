"""GAN Fraud Simulation Agent.

This module keeps the GAN discriminator role from the archived codebase,
but implements it as a lightweight statistical heuristic so it can run in
the current project without GPU training data.
"""
from __future__ import annotations

import math
import re
from collections import Counter


class GANFraudAgent:
    BENFORD = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046]

    def analyze(self, invoice: dict, baseline: dict | None) -> dict:
        text = str(
            invoice.get("extracted_text")
            or invoice.get("invoice_text")
            or invoice.get("text")
            or ""
        )
        amount = float(invoice.get("amount") or 0)
        flags = []
        score = 0.0

        benford_flags, benford_score = self._benford_check(amount, text)
        entropy_flags, entropy_score = self._text_entropy_check(text)
        template_flags, template_score = self._template_check(text)
        digit_flags, digit_score = self._digit_pattern_check(amount, text)
        urgency_flags, urgency_score = self._urgency_pattern_check(text)
        baseline_flags, baseline_score = self._baseline_check(amount, baseline)

        flags.extend(benford_flags)
        flags.extend(entropy_flags)
        flags.extend(template_flags)
        flags.extend(digit_flags)
        flags.extend(urgency_flags)
        flags.extend(baseline_flags)
        score += benford_score + entropy_score + template_score + digit_score + urgency_score + baseline_score

        final_score = min(score, 100)
        return {
            "risk_score": round(final_score, 2),
            "risk_level": "critical"
            if final_score >= 80
            else "high"
            if final_score >= 60
            else "medium"
            if final_score >= 40
            else "low",
            "flags": flags,
            "agent": "gan_discriminator",
            "discriminator_confidence": self._score_to_confidence(final_score),
            "note": "Statistical discriminator until a trained ONNX model is available.",
        }

    def _baseline_check(self, amount: float, baseline: dict | None):
        flags = []
        score = 0.0
        if not baseline:
            return flags, score

        avg = float(baseline.get("avg_invoice_amount") or 0)
        invoice_count = int(baseline.get("invoice_count") or 0)
        if avg > 0 and amount > avg * 2.5:
            score += 18
            flags.append(
                {
                    "type": "baseline_deviation",
                    "description": "Invoice amount is far outside the supplier's normal range.",
                    "severity": "medium",
                    "evidence": f"Amount {amount} vs baseline avg {avg}",
                }
            )
        if invoice_count < 3:
            score += 6
            flags.append(
                {
                    "type": "thin_history",
                    "description": "Supplier has little historical history for strong baseline analysis.",
                    "severity": "low",
                    "evidence": f"Historical invoice count: {invoice_count}",
                }
            )
        return flags, score

    def _benford_check(self, amount: float, text: str):
        flags = []
        score = 0.0
        numbers = re.findall(r"\b(\d+(?:[.,]\d+)?)\b", text)
        values = []
        for raw in numbers:
            try:
                value = float(raw.replace(",", ""))
            except ValueError:
                continue
            if value > 10:
                values.append(value)
        if amount > 0:
            values.append(amount)
        if len(values) < 3:
            return flags, score

        first_digits = [0] * 9
        for value in values:
            first = int(str(abs(value)).replace(".", "").lstrip("0")[:1] or "0")
            if 1 <= first <= 9:
                first_digits[first - 1] += 1

        total = sum(first_digits)
        if total < 3:
            return flags, score

        observed = [count / total for count in first_digits]
        chi2 = sum(((obs - exp) ** 2) / exp for obs, exp in zip(observed, self.BENFORD) if exp > 0)
        if chi2 > 15:
            score += 25
            flags.append(
                {
                    "type": "benford_law_violation",
                    "description": "Amount digit distribution deviates strongly from Benford's Law.",
                    "severity": "high",
                    "evidence": f"Chi-squared statistic: {chi2:.1f} (threshold: 15)",
                }
            )
        elif chi2 > 8:
            score += 12
            flags.append(
                {
                    "type": "benford_law_anomaly",
                    "description": "Mild deviation from expected digit distribution.",
                    "severity": "low",
                    "evidence": f"Chi-squared statistic: {chi2:.1f}",
                }
            )
        return flags, score

    def _text_entropy_check(self, text: str):
        flags = []
        score = 0.0
        if len(text) < 50:
            return flags, score

        freq = Counter(text.lower())
        total = len(text)
        entropy = -sum((count / total) * math.log2(count / total) for count in freq.values() if count > 0)

        if entropy < 3.5:
            score += 20
            flags.append(
                {
                    "type": "low_text_entropy",
                    "description": "Invoice text has unusually low complexity.",
                    "severity": "high",
                    "evidence": f"Shannon entropy: {entropy:.2f}",
                }
            )
        elif entropy > 5.5:
            score += 10
            flags.append(
                {
                    "type": "high_text_entropy",
                    "description": "Invoice text is unusually noisy or obfuscated.",
                    "severity": "medium",
                    "evidence": f"Shannon entropy: {entropy:.2f}",
                }
            )

        words = text.lower().split()
        if len(words) > 10:
            unique_ratio = len(set(words)) / len(words)
            if unique_ratio < 0.4:
                score += 15
                flags.append(
                    {
                        "type": "high_word_repetition",
                        "description": "Excessive word repetition detected.",
                        "severity": "medium",
                        "evidence": f"Unique word ratio: {unique_ratio:.2f}",
                    }
                )
        return flags, score

    def _template_check(self, text: str):
        flags = []
        score = 0.0
        text_lower = text.lower()
        template_phrases = [
            (r"invoice\s+template", 15, "Invoice template keyword found"),
            (r"sample\s+invoice", 20, "Sample invoice keyword found"),
            (r"lorem\s+ipsum", 25, "Placeholder text found"),
            (r"your\s+company\s+name", 20, "Generic placeholder company name"),
            (r"test\s+invoice", 25, "Test invoice keyword found"),
        ]
        for pattern, pts, desc in template_phrases:
            if re.search(pattern, text_lower):
                score += pts
                flags.append(
                    {
                        "type": "template_phrase_detected",
                        "description": desc,
                        "severity": "high",
                        "evidence": f"Pattern: {pattern}",
                    }
                )
        return flags, score

    def _digit_pattern_check(self, amount: float, text: str):
        flags = []
        score = 0.0
        all_amounts = re.findall(r"\b(\d{3,}(?:[.,]\d{2})?)\b", text)

        round_count = 0
        parsed_amounts = []
        for raw in all_amounts:
            try:
                value = float(raw.replace(",", ""))
            except ValueError:
                continue
            parsed_amounts.append(round(value, 2))
            if value >= 100 and value % 100 == 0:
                round_count += 1

        if round_count >= 3:
            score += 15
            flags.append(
                {
                    "type": "round_number_clustering",
                    "description": "Multiple round numbers found.",
                    "severity": "medium",
                    "evidence": f"Round number count: {round_count}",
                }
            )

        if parsed_amounts:
            counts = Counter(parsed_amounts)
            duplicates = [(value, count) for value, count in counts.items() if count >= 3 and value > 0]
            if duplicates:
                score += 10
                flags.append(
                    {
                        "type": "duplicate_amount_values",
                        "description": "Same amount value repeated multiple times.",
                        "severity": "low",
                        "evidence": str(duplicates[:3]),
                    }
                )

        if amount > 0 and amount % 500 == 0:
            score += 8
            flags.append(
                {
                    "type": "generated_amount_shape",
                    "description": "Rounded amount shape resembles synthetic fraud signatures.",
                    "severity": "low",
                    "evidence": f"Amount {amount} divisible by 500",
                }
            )

        return flags, score

    def _urgency_pattern_check(self, text: str):
        flags = []
        score = 0.0
        text_lower = text.lower()
        urgency_patterns = [
            (r"\burgent\b", 8),
            (r"\bimmediately\b", 8),
            (r"\boverdue\b", 5),
            (r"\bfinal\s+notice\b", 12),
            (r"\blast\s+chance\b", 15),
            (r"\bpay\s+now\b", 10),
            (r"\bdo\s+not\s+delay\b", 12),
            (r"\baction\s+required\b", 8),
            (r"\bnew\s+bank\s+account\b", 30),
            (r"\bbank\s+details?\s+changed?\b", 30),
            (r"\bnew\s+iban\b", 25),
            (r"\bchanged?\s+account\b", 20),
        ]
        for pattern, pts in urgency_patterns:
            if re.search(pattern, text_lower):
                score += pts
                flags.append(
                    {
                        "type": "urgency_pattern",
                        "description": f"Urgency or payment-redirection language matched: {pattern}",
                        "severity": "medium" if pts < 15 else "high",
                        "evidence": f"Pattern: {pattern}",
                    }
                )
        return flags, score

    def _score_to_confidence(self, score: float) -> float:
        return round(max(0.2, min(0.95, 0.2 + score / 120)), 3)


FraudSimulationAgent = GANFraudAgent
