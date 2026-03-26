"""Context Retrieval Agent - builds one context packet for downstream agents."""
from sqlalchemy import text

from core.config import settings
from services.cache_service import cache_service


class ContextRetrievalAgent:
    def __init__(self, db, ttl_seconds: int | None = None):
        self.db = db
        self.ttl_seconds = ttl_seconds or int(settings.CONTEXT_CACHE_TTL_SECONDS)

    async def get_context(self, invoice_id: str) -> dict | None:
        cache_key = f"context:{invoice_id}"
        cached = await cache_service.get_json(cache_key)
        if cached:
            return cached

        invoice = await self._load_invoice(invoice_id)
        if not invoice:
            return None

        supplier = (
            await self._load_supplier(str(invoice["supplier_id"]))
            if invoice.get("supplier_id")
            else None
        )
        baseline = (
            await self._load_baseline(str(invoice["supplier_id"]))
            if invoice.get("supplier_id")
            else None
        )

        supplier_info = dict(supplier) if supplier else {}
        behavioral = {
            "avg_amount": float(baseline.get("avg_invoice_amount") or 0) if baseline else 0,
            "stddev": float(baseline.get("stddev_amount") or 0) if baseline else 0,
            "invoice_count": int(baseline.get("invoice_count") or 0) if baseline else 0,
            "typical_iban": baseline.get("typical_iban") if baseline else None,
            "current_iban": supplier_info.get("bank_account_iban"),
        }
        if behavioral["avg_amount"] > 0:
            deviation = abs(float(invoice.get("amount") or 0) - behavioral["avg_amount"])
            behavioral["amount_deviation_pct"] = round(
                deviation / behavioral["avg_amount"] * 100, 1
            )

        invoice_text = invoice.get("extracted_text") or (
            f"Invoice {invoice.get('invoice_number', 'N/A')} "
            f"Amount: {invoice.get('amount', '0')} {invoice.get('currency', 'USD')}"
        )

        packet = {
            "invoice": invoice,
            "supplier": supplier_info,
            "baseline": dict(baseline) if baseline else None,
            "behavioral": behavioral,
            "invoice_text": invoice_text,
        }
        await cache_service.set_json(cache_key, packet, ttl_seconds=self.ttl_seconds)
        return packet

    async def _load_invoice(self, invoice_id: str) -> dict | None:
        result = await self.db.execute(
            text("SELECT * FROM invoices WHERE invoice_id=:id"), {"id": invoice_id}
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def _load_supplier(self, supplier_id: str) -> dict | None:
        result = await self.db.execute(
            text("SELECT * FROM suppliers WHERE supplier_id=:id"), {"id": supplier_id}
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def _load_baseline(self, supplier_id: str) -> dict | None:
        result = await self.db.execute(
            text(
                "SELECT * FROM supplier_baselines "
                "WHERE supplier_id=:id ORDER BY computed_at DESC LIMIT 1"
            ),
            {"id": supplier_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None
