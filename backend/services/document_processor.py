"""Document processor - extract text from PDF/image/txt."""
import os
import shutil
import uuid
import re
from pathlib import Path

import pytesseract
import structlog

from core.config import settings
from services.object_storage import object_storage

logger = structlog.get_logger()


def _resolve_tesseract_candidate(candidate: str | None) -> str | None:
    if not candidate:
        return None

    if Path(candidate).exists():
        return candidate

    resolved = shutil.which(candidate)
    return resolved


def _configure_tesseract() -> str | None:
    # Prefer explicit env override, then PATH, then common Windows install paths.
    env_cmd = settings.TESSERACT_CMD or os.getenv("TESSERACT_CMD")
    program_files = os.getenv("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.getenv("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local_app_data = os.getenv("LOCALAPPDATA")
    home_dir = Path.home()
    candidates = [
        env_cmd,
        "tesseract",
        str(Path(program_files) / "Tesseract-OCR" / "tesseract.exe"),
        str(Path(program_files_x86) / "Tesseract-OCR" / "tesseract.exe"),
        str(home_dir / "AppData" / "Local" / "Programs" / "Tesseract-OCR" / "tesseract.exe"),
        str(Path(local_app_data) / "Programs" / "Tesseract-OCR" / "tesseract.exe") if local_app_data else None,
        r"D:\Tesseract-OCR\tesseract.exe",
    ]

    for candidate in candidates:
        resolved = _resolve_tesseract_candidate(candidate)
        if resolved:
            pytesseract.pytesseract.tesseract_cmd = resolved
            return resolved

    return None


_TESSERACT_CMD = _configure_tesseract()
if _TESSERACT_CMD:
    logger.info("Tesseract configured", tesseract_cmd=_TESSERACT_CMD)
else:
    logger.warning("Tesseract not configured")


async def process_document(file_path: str, filename: str) -> dict:
    ext = Path(filename).suffix.lower()
    text = ""
    logger.info("Document processing started", filename=filename, extension=ext)
    fields = {}
    try:
        if ext == ".pdf":
            text = await _extract_pdf(file_path)
        elif ext in [".png", ".jpg", ".jpeg"]:
            text = await _extract_image(file_path)
        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        else:
            text = f"[Unsupported format: {ext}]"
        fields = parse_invoice_fields(text)
        if not text.strip():
            text = f"[No text extracted from {filename}]"
    except Exception as e:
        logger.error("Document processing failed", error=str(e))
        text = f"[Extraction failed: {e}]"
    return {"text": text[:10000], "filename": filename, "fields": fields}


async def _extract_pdf(path: str) -> str:
    try:
        import fitz

        with fitz.open(path) as doc:
            embedded = "\n".join(page.get_text() for page in doc if page.get_text().strip())
            if embedded.strip():
                logger.info("PDF extracted with embedded text", path=path)
                return embedded

            if not _TESSERACT_CMD:
                logger.warning("PDF OCR skipped: tesseract missing", path=path)
                return "[No embedded PDF text and OCR unavailable: install Tesseract OCR and set PATH or TESSERACT_CMD]"

            from PIL import Image

            logger.info("PDF OCR started", path=path, tesseract_cmd=_TESSERACT_CMD)
            ocr_pages = []
            for page in doc:
                pix = page.get_pixmap(dpi=300)
                mode = "RGBA" if pix.alpha else "RGB"
                image = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
                ocr_pages.append(_image_to_text(image))

            logger.info("PDF OCR completed", path=path, pages=len(ocr_pages))
            return "\n".join(ocr_pages)
    except ImportError:
        return "[PDF extraction requires PyMuPDF. For scanned PDFs OCR also needs Pillow.]"
    except Exception as e:
        return f"[PDF error: {e}]"


async def _extract_image(path: str) -> str:
    try:
        from PIL import Image

        if not _TESSERACT_CMD:
            logger.warning("Image OCR skipped: tesseract missing", path=path)
            return "[Image OCR unavailable: install Tesseract OCR and set PATH or TESSERACT_CMD]"

        logger.info("Image OCR started", path=path, tesseract_cmd=_TESSERACT_CMD)
        text = _image_to_text(Image.open(path))
        logger.info("Image OCR completed", path=path, chars=len(text))
        return text
    except ImportError:
        return "[Image OCR requires pytesseract and Pillow]"
    except Exception as e:
        return f"[Image error: {e}]"


def _save_local_file(content: bytes, filename: str) -> str:
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe = f"{uuid.uuid4()}_{filename.replace(' ', '_')}"
    path = upload_dir / safe
    with open(path, "wb") as f:
        f.write(content)
    return str(path)


def save_file(content: bytes, filename: str) -> str:
    return _save_local_file(content, filename)


def save_file_with_metadata(content: bytes, filename: str) -> dict:
    local_path = _save_local_file(content, filename)
    object_name = Path(local_path).name
    document_url = object_storage.archive_file(local_path, object_name)
    return {"local_path": local_path, "document_url": document_url}


def parse_invoice_fields(text: str) -> dict:
    """Best-effort OCR parser for common invoice fields."""
    raw = text or ""
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    compact = " ".join(lines)
    fields: dict[str, object] = {}

    supplier_name = _match_first(
        raw,
        [
            r"(?:supplier|vendor|seller|from|company)\s*[:\-]\s*([^\n]{2,80})",
            r"(?:invoice\s+from)\s*[:\-]?\s*([^\n]{2,80})",
        ],
        cleaner=_clean_supplier_name,
    )
    if not supplier_name:
        supplier_name = _infer_supplier_name(lines)
    if supplier_name:
        fields["supplier_name"] = supplier_name

    invoice_number = _match_first(
        raw,
        [
            r"(?:invoice\s*(?:id|no|number|#)|inv\s*(?:id|no|#)?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/._\-]{2,})",
            r"invoice\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/._\-]{2,})",
        ],
        cleaner=_clean_reference_value,
    )
    if invoice_number:
        fields["invoice_number"] = invoice_number

    invoice_date = _match_first(
        raw,
        [
            r"(?:invoice\s+date|date\s+issued|issued\s+on|date)\s*[:\-]?\s*([0-9]{1,4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{2,4})",
        ],
        cleaner=_clean_date_value,
    )
    if invoice_date:
        fields["invoice_date"] = invoice_date

    due_date = _match_first(
        raw,
        [
            r"(?:due\s+date|payment\s+due|due)\s*[:\-]?\s*([0-9]{1,4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{2,4})",
        ],
        cleaner=_clean_date_value,
    )
    if due_date:
        fields["due_date"] = due_date

    po_number = _match_first(
        raw,
        [
            r"(?:purchase\s+order|po)\s*(?:number|no|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/._\-]{2,})",
        ],
        cleaner=_clean_reference_value,
    )
    if po_number:
        fields["po_number"] = po_number

    reference = _match_first(
        raw,
        [
            r"(?:reference|ref)\s*(?:number|no|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/._\- ]{2,})",
        ],
        cleaner=_clean_reference_value,
    )
    if reference:
        fields["reference"] = reference

    payment_terms = _match_first(
        raw,
        [
            r"(?:payment\s+terms|terms)\s*[:\-]?\s*([^\n]{2,80})",
        ],
        cleaner=_clean_short_text,
    )
    if payment_terms:
        fields["payment_terms"] = payment_terms

    bill_to = _match_first(
        raw,
        [
            r"(?:bill\s+to)\s*[:\-]?\s*([^\n]{2,120})",
        ],
        cleaner=_clean_short_text,
    )
    if bill_to:
        fields["bill_to"] = bill_to

    parsed_amount = _match_first(
        raw,
        [
            r"(?:grand\s+total|invoice\s+total|amount\s+due|total)\s*(?:\(([A-Z]{3})\))?\s*[:\-]?\s*([€$£₹])?\s*([0-9][0-9,]*\.?[0-9]{0,2})",
            r"(?:grand\s+total|invoice\s+total|amount\s+due|total)\s*[:\-]?\s*([0-9][0-9,]*\.?[0-9]{0,2})\s*(?:([A-Z]{3}))?",
        ],
        amount=True,
    )
    if parsed_amount:
        fields["total_amount"] = parsed_amount["amount"]
        if parsed_amount.get("currency"):
            fields["currency"] = parsed_amount["currency"]

    if "currency" not in fields:
        currency = _infer_currency(compact)
        if currency:
            fields["currency"] = currency

    subtotal = _match_first(
        raw,
        [r"sub\s*total\s*(?:\(([A-Z]{3})\))?\s*[:\-]?\s*([€$£₹])?\s*([0-9][0-9,]*\.?[0-9]{0,2})"],
        amount=True,
    )
    if subtotal:
        fields["subtotal"] = subtotal["amount"]

    tax = _match_first(
        raw,
        [r"tax\s*(?:\(([0-9]+(?:\.[0-9]+)?%)\))?\s*[:\-]?\s*([€$£₹])?\s*([0-9][0-9,]*\.?[0-9]{0,2})"],
        amount=True,
    )
    if tax:
        fields["tax"] = tax["amount"]

    discount = _match_first(
        raw,
        [r"discount\s*(?:\(([0-9]+(?:\.[0-9]+)?%)\))?\s*[:\-]?\s*([€$£₹])?\s*([0-9][0-9,]*\.?[0-9]{0,2})"],
        amount=True,
    )
    if discount:
        fields["discount"] = discount["amount"]

    if "total_amount" not in fields and any(key in fields for key in ("subtotal", "tax", "discount")):
        subtotal_val = float(fields.get("subtotal") or 0)
        tax_val = float(fields.get("tax") or 0)
        discount_val = float(fields.get("discount") or 0)
        if subtotal_val or tax_val or discount_val:
            fields["total_amount"] = round(subtotal_val + tax_val - discount_val, 2)

    coverage_fields = (
        "supplier_name",
        "invoice_number",
        "invoice_date",
        "due_date",
        "po_number",
        "reference",
        "payment_terms",
        "bill_to",
        "subtotal",
        "tax",
        "discount",
        "total_amount",
        "currency",
    )
    coverage = sum(1 for key in coverage_fields if fields.get(key) not in (None, ""))
    fields["confidence"] = round(min(1.0, coverage / len(coverage_fields)), 2)
    return fields


def _infer_currency(text: str) -> str | None:
    for currency in ("EUR", "USD", "GBP", "INR", "JPY", "AED", "CAD", "AUD", "CHF"):
        if re.search(rf"\b{currency}\b", text, re.IGNORECASE):
            return currency
    return None


def _infer_supplier_name(lines: list[str]) -> str | None:
    skip_words = {
        "invoice",
        "tax id",
        "tax",
        "phone",
        "fax",
        "bill to",
        "bill",
        "ship to",
        "customer",
        "date",
        "total",
        "subtotal",
        "discount",
        "amount",
        "description",
        "qty",
        "units",
        "unit price",
        "payment terms",
        "reference",
        "purchase order",
        "po number",
        "invoice number",
        "invoice date",
        "due date",
        "remit to",
    }
    for line in lines[:12]:
        clean = _clean_supplier_name(line)
        if not clean:
            continue
        lower = clean.lower()
        if any(word in lower for word in skip_words):
            continue
        if len(clean) > 60:
            continue
        if re.fullmatch(r"[A-Z0-9][A-Z0-9&.,'()/\- ]{2,}", clean, re.IGNORECASE):
            return clean
    return None


def _match_first(text: str, patterns: list[str], amount: bool = False, cleaner=None):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if not match:
            continue
        if amount:
            currency = None
            for group in match.groups():
                if not group:
                    continue
                group = str(group).strip()
                if re.fullmatch(r"[A-Z]{3}", group):
                    currency = group.upper()
                    continue
                if group in {"$", "€", "£", "₹"}:
                    currency = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR"}[group]
                    continue
                try:
                    amount_value = float(group.replace(",", ""))
                    return {"amount": round(amount_value, 2), "currency": currency}
                except ValueError:
                    continue
        else:
            for group in match.groups():
                if group:
                    value = group.strip()
                    return cleaner(value) if cleaner else value
    return None


def _image_to_text(image) -> str:
    """Run OCR with light preprocessing and a couple of page-segmentation strategies."""
    from PIL import ImageFilter, ImageOps

    working = image.convert("L")
    working = ImageOps.autocontrast(working)
    if min(working.size) < 1400:
        working = working.resize((working.width * 2, working.height * 2))
    working = working.filter(ImageFilter.SHARPEN)
    thresholded = working.point(lambda px: 255 if px > 170 else 0)

    variants = [
        (working, "--oem 3 --psm 6"),
        (thresholded, "--oem 3 --psm 6"),
        (working, "--oem 3 --psm 11"),
    ]

    best = ""
    best_score = -1
    for variant, config in variants:
        try:
            extracted = pytesseract.image_to_string(variant, config=config)
        except TypeError:
            extracted = pytesseract.image_to_string(variant)
        score = len(re.findall(r"[A-Za-z0-9]", extracted or ""))
        if score > best_score:
            best = extracted
            best_score = score
    return best


def _clean_reference_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" :-\t").rstrip(".,;")


def _clean_date_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" :-\t").rstrip(".,;")


def _clean_short_text(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" :-\t")
    cleaned = re.split(r"\s{2,}", cleaned)[0]
    return cleaned.rstrip(".,;")


def _clean_supplier_name(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" :-\t")
    cleaned = re.sub(r"^(supplier|vendor|seller|company|invoice from)\s*[:\-]\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.rstrip(".,;")
    if len(cleaned) > 80:
        cleaned = cleaned[:80].rstrip()
    return cleaned
