"""
Gemini AI Service â€” gemini-2.0-flash
Powers: Invoice analysis, Alert explanation, Meeting intelligence
"""
import json
import hashlib
import os
import structlog
from core.config import settings

logger = structlog.get_logger()
_model = None
_MISSING_KEY_ACTION = (
    "Set GEMINI_API_KEY (or GOOGLE_API_KEY) in backend/.env "
    "or project-root .env, then restart backend."
)

def _api_key() -> str:
    return (settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()


def get_model():
    global _model
    if _model is None:
        try:
            import google.generativeai as genai
            genai.configure(api_key=_api_key())
            _model = genai.GenerativeModel(settings.GEMINI_MODEL)
        except Exception as e:
            logger.error("Gemini init failed", error=str(e))
            return None
    return _model

INVOICE_PROMPT = """
You are GenSafe B2B fraud detection AI. Analyze this invoice for fraud.

INVOICE TEXT:
{invoice_text}

SUPPLIER INFO:
{supplier_info}

BEHAVIORAL CONTEXT:
{behavioral_context}

Check for:
1. Math errors (do line items add up?)
2. Supplier name vs bank account mismatch
3. Date logic issues
4. Address/VAT inconsistencies
5. Urgency language patterns
6. Round number fraud patterns
7. Bank detail changes

Respond with ONLY valid JSON â€” no markdown, no extra text:
{{
  "risk_score": <0-100>,
  "risk_level": "<low|medium|high|critical>",
  "flags": [
    {{
      "type": "<flag_type>",
      "description": "<what was found>",
      "severity": "<low|medium|high>",
      "evidence": "<specific evidence>"
    }}
  ],
  "explanation": "<plain English for finance team>",
  "recommended_action": "<specific action>",
  "confidence": <0.0-1.0>,
  "math_check": {{"passed": <true|false>, "details": "<what was checked>"}}
}}
"""

EXPLANATION_PROMPT = """
Write a clear fraud alert for a finance team.

Invoice: {invoice_number}
Supplier: {supplier_name}
Amount: {amount} {currency}
Risk Score: {risk_score}/100

Analysis findings:
{analysis_results}

Write plain English, under 250 words, no markdown.
Start with the risk level. List each red flag with evidence. End with recommended action.
"""

MEETING_PROMPT = """
Extract action items from this meeting transcript.

TRANSCRIPT:
{transcript}

Respond with ONLY valid JSON:
{{
  "decisions": [{{"decision": "<text>", "context": "<why>"}}],
  "action_items": [
    {{
      "task": "<what to do>",
      "owner": "<person name or role>",
      "deadline": "<date or null>",
      "priority": "<high|medium|low>",
      "context": "<why>"
    }}
  ],
  "open_questions": ["<question>"],
  "summary": "<2-3 sentence summary>"
}}
"""

async def analyze_invoice(invoice_text: str, supplier_info: dict, behavioral_context: dict) -> dict:
    if not _api_key():
        logger.warning("No Gemini API key configured; using mock analysis")
        return _mock_analysis(invoice_text)
    try:
        model = get_model()
        if not model:
            return _mock_analysis(invoice_text, error="Model init failed")

        import google.generativeai as genai
        prompt = INVOICE_PROMPT.format(
            invoice_text=invoice_text[:6000],
            supplier_info=json.dumps(supplier_info, indent=2, default=str),
            behavioral_context=json.dumps(behavioral_context, indent=2, default=str)
        )
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.1, max_output_tokens=2048)
        )
        raw = response.text.strip()
        result = _parse_json_or_repair(model, raw, schema_name="invoice analysis")
        if result is None:
            logger.error("Gemini response could not be parsed", raw_preview=raw[:500])
            return _mock_analysis(invoice_text, error="Gemini response could not be parsed as JSON")
        result["agent"] = "gemini_llm"
        result["model"] = settings.GEMINI_MODEL
        result["input_hash"] = hashlib.sha256(invoice_text.encode()).hexdigest()[:16]
        return result
    except Exception as e:
        logger.error("Gemini API error", error=str(e))
        return _mock_analysis(invoice_text, error=f"Gemini API error: {e}")

async def generate_explanation(analysis: dict, invoice_number: str, supplier_name: str, amount: float, currency: str, risk_score: float) -> str:
    if not _api_key():
        return _mock_explanation(
            risk_score,
            supplier_name,
            invoice_number,
            reason="No Gemini API key configured",
        )
    try:
        import google.generativeai as genai
        model = get_model()
        if not model:
            return _mock_explanation(
                risk_score,
                supplier_name,
                invoice_number,
                reason="Gemini model initialization failed",
            )
        prompt = EXPLANATION_PROMPT.format(
            invoice_number=invoice_number,
            supplier_name=supplier_name,
            amount=amount,
            currency=currency,
            risk_score=risk_score,
            analysis_results=json.dumps(analysis, indent=2, default=str)
        )
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.2, max_output_tokens=1024)
        )
        return response.text.strip()
    except Exception as e:
        logger.error("Explanation generation failed", error=str(e))
        return _mock_explanation(
            risk_score,
            supplier_name,
            invoice_number,
            reason=f"Gemini API error: {e}",
        )

async def extract_meeting_items(transcript: str) -> dict:
    if not _api_key():
        return {"decisions": [], "action_items": [], "open_questions": [], "summary": "No Gemini API key configured."}
    try:
        import google.generativeai as genai
        model = get_model()
        if not model:
            return {"decisions": [], "action_items": [], "open_questions": [], "summary": "Model init failed."}
        prompt = MEETING_PROMPT.format(transcript=transcript[:10000])
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.1, max_output_tokens=2048)
        )
        raw = response.text.strip()
        parsed = _parse_json_or_repair(model, raw, schema_name="meeting extraction")
        if parsed is not None:
            return parsed
        logger.error("Meeting extraction could not be parsed", raw_preview=raw[:500])
        return {"decisions": [], "action_items": [], "open_questions": [], "summary": "Gemini response could not be parsed as JSON."}
    except Exception as e:
        logger.error("Meeting extraction failed", error=str(e))
        return {"decisions": [], "action_items": [], "open_questions": [], "summary": f"Extraction failed: {e}"}


def _strip_code_fences(raw: str) -> str:
    text = (raw or "").strip()
    if "```" not in text:
        return text
    parts = text.split("```")
    for part in parts:
        candidate = part.strip()
        if candidate.startswith("{") or candidate.startswith("["):
            return candidate
    return text


def _extract_json_blob(raw: str) -> str | None:
    text = _strip_code_fences(raw)
    start_candidates = [idx for idx in (text.find("{"), text.find("[")) if idx >= 0]
    if not start_candidates:
        return None
    start = min(start_candidates)
    end = max(text.rfind("}"), text.rfind("]"))
    if end <= start:
        return None
    return text[start : end + 1]


def _parse_json_or_repair(model, raw: str, schema_name: str) -> dict | None:
    candidates = [_strip_code_fences(raw)]
    blob = _extract_json_blob(raw)
    if blob and blob not in candidates:
        candidates.append(blob)

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except Exception:
            continue

    try:
        import google.generativeai as genai
        repair_prompt = (
            f"Convert the following {schema_name} output into valid JSON only. "
            "Preserve the meaning, remove any commentary, and return JSON with double-quoted keys and strings.\n\n"
            f"RAW OUTPUT:\n{raw}"
        )
        repair_response = model.generate_content(
            repair_prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.0, max_output_tokens=2048),
        )
        repaired = _extract_json_blob(repair_response.text or "")
        if repaired:
            return json.loads(repaired)
    except Exception as exc:
        logger.warning("Gemini repair attempt failed", error=str(exc), schema=schema_name)
    return None

def _mock_analysis(text: str, error: str = None) -> dict:
    score = 35.0
    flags = []
    text_lower = text.lower()
    if any(w in text_lower for w in ["urgent", "immediate", "asap", "quickly"]):
        score += 20
        flags.append({"type": "urgency_language", "description": "Urgency language detected", "severity": "medium", "evidence": "Urgent/immediate language found"})
    if any(w in text_lower for w in ["new bank", "changed account", "new iban", "new account"]):
        score += 35
        flags.append({"type": "bank_change_language", "description": "Bank change language detected", "severity": "high", "evidence": "New bank account language found"})
    return {
        "risk_score": min(score, 100),
        "risk_level": "low" if score < 40 else "medium" if score < 70 else "high",
        "flags": flags,
        "explanation": (
            f"Mock analysis fallback. Text length: {len(text)} chars."
            + (f" Note: {error}" if error else "")
        ),
        "recommended_action": _MISSING_KEY_ACTION,
        "confidence": 0.3,
        "math_check": {"passed": True, "details": "Mock - not checked"},
        "agent": "mock",
        "model": "mock"
    }

def _mock_explanation(risk_score: float, supplier_name: str, invoice_number: str, reason: str = "Mock fallback") -> str:
    level = "LOW" if risk_score < 40 else "MEDIUM" if risk_score < 70 else "HIGH"
    return (
        f"RISK LEVEL: {level} ({risk_score}/100)\n\n"
        f"Invoice {invoice_number} from {supplier_name} has been analyzed by the mock agent.\n\n"
        "To get real AI-powered fraud analysis, configure a Gemini API key.\n"
        f"Fallback reason: {reason}\n"
        "Set GEMINI_API_KEY (or GOOGLE_API_KEY) in backend/.env or project-root .env, then restart backend.\n"
        "Get a free key at: https://aistudio.google.com/app/apikey"
    )

