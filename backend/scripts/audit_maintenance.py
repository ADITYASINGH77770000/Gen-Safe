"""
Audit retention helper.

Examples:
  python backend/scripts/audit_maintenance.py --retention-days 365
  python backend/scripts/audit_maintenance.py --retention-days 365 --purge
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.database import AsyncSessionLocal  # noqa: E402
from services.audit_maintenance import AuditMaintenanceService  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser(description="Archive or purge aged audit records")
    parser.add_argument("--retention-days", type=int, default=None, help="How many days to retain")
    parser.add_argument("--archive-dir", default=None, help="Archive output directory")
    parser.add_argument("--purge", action="store_true", help="Delete rows after archiving")
    return parser.parse_args()


async def main():
    args = parse_args()
    async with AsyncSessionLocal() as db:
        service = AuditMaintenanceService(db)
        if args.purge:
            result = await service.export_and_purge(retention_days=args.retention_days, archive_dir=args.archive_dir)
        else:
            result = await service.retention_preview(retention_days=args.retention_days)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
