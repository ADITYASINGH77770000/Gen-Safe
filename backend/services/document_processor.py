"""Document processor - extract text from PDF/image/txt."""
import os
import shutil
import uuid
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
        if not text.strip():
            text = f"[No text extracted from {filename}]"
    except Exception as e:
        logger.error("Document processing failed", error=str(e))
        text = f"[Extraction failed: {e}]"
    return {"text": text[:10000], "filename": filename}


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
                ocr_pages.append(pytesseract.image_to_string(image))

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
        text = pytesseract.image_to_string(Image.open(path))
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
