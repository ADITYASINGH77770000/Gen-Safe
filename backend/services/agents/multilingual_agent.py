"""Multilingual Agent (lightweight heuristic version)."""
import re


class MultilingualAgent:
    def analyze(self, invoice_text: str) -> dict:
        text = invoice_text or ""
        flags = []
        score = 0.0

        non_ascii_chars = sum(1 for c in text if ord(c) > 127)
        total_chars = max(1, len(text))
        non_ascii_ratio = non_ascii_chars / total_chars

        if non_ascii_ratio > 0.2:
            score += 10
            flags.append(
                {
                    "type": "multilingual_document",
                    "description": "Document appears to contain multilingual characters.",
                    "severity": "low",
                    "evidence": f"Non-ASCII ratio: {non_ascii_ratio:.2f}",
                }
            )

        mixed_digits = len(re.findall(r"[A-Za-z]{2,}\d{2,}[A-Za-z]{1,}", text))
        if mixed_digits >= 3:
            score += 12
            flags.append(
                {
                    "type": "entity_text_noise",
                    "description": "Mixed alphanumeric entity noise detected.",
                    "severity": "medium",
                    "evidence": f"Pattern count: {mixed_digits}",
                }
            )

        score = min(score, 100)
        return {
            "risk_score": round(score, 2),
            "risk_level": "high" if score >= 60 else "medium" if score >= 35 else "low",
            "flags": flags,
            "agent": "multilingual_agent",
        }
