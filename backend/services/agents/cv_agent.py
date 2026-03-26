"""Computer Vision Agent (lightweight heuristic version)."""
from pathlib import Path


class ComputerVisionAgent:
    def analyze(self, invoice: dict, invoice_text: str) -> dict:
        flags = []
        score = 0.0
        file_path = str(invoice.get("local_file_path") or "")
        suffix = Path(file_path).suffix.lower()
        text = (invoice_text or "").lower()

        if suffix in {".png", ".jpg", ".jpeg"}:
            score += 10
            flags.append(
                {
                    "type": "image_document",
                    "description": "Image-based invoice requires visual scrutiny.",
                    "severity": "low",
                    "evidence": f"File type: {suffix}",
                }
            )

        suspicious_terms = [
            "scan copy",
            "manually edited",
            "image quality low",
            "signature mismatch",
            "logo updated",
        ]
        for term in suspicious_terms:
            if term in text:
                score += 12
                flags.append(
                    {
                        "type": "visual_manipulation_hint",
                        "description": "Possible visual manipulation hint in extracted text.",
                        "severity": "medium",
                        "evidence": f"Matched phrase: {term}",
                    }
                )

        score = min(score, 100)
        return {
            "risk_score": round(score, 2),
            "risk_level": "high" if score >= 60 else "medium" if score >= 35 else "low",
            "flags": flags,
            "agent": "computer_vision_agent",
        }
