"""
One-time migration utility: SQLite -> PostgreSQL.

Usage:
  python backend/scripts/migrate_sqlite_to_postgres.py \
      --sqlite-path backend/gensafe.db \
      --pg-dsn postgresql://user:pass@localhost:5432/gensafe

Notes:
  1. Ensure target PostgreSQL schema exists (start backend once with DATABASE_URL pointing to Postgres).
  2. Migration is idempotent via "ON CONFLICT DO NOTHING".
"""
from __future__ import annotations

import argparse
import asyncio
import sqlite3

import asyncpg


TABLES = [
    "users",
    "suppliers",
    "invoices",
    "processing_jobs",
    "fraud_alerts",
    "model_feedback",
    "agent_decisions",
    "agent_messages",
    "workflow_tasks",
    "supplier_baselines",
    "erp_integrations",
    "erp_oauth_states",
    "erp_tokens",
]


async def migrate(sqlite_path: str, pg_dsn: str):
    src = sqlite3.connect(sqlite_path)
    src.row_factory = sqlite3.Row
    dst = await asyncpg.connect(pg_dsn)

    print(f"Starting migration from {sqlite_path} to PostgreSQL")
    try:
        for table in TABLES:
            rows = src.execute(f"SELECT * FROM {table}").fetchall()
            if not rows:
                print(f"[{table}] 0 rows")
                continue

            columns = list(rows[0].keys())
            col_sql = ", ".join(columns)
            placeholders = ", ".join(f"${i}" for i in range(1, len(columns) + 1))
            sql = (
                f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders}) "
                "ON CONFLICT DO NOTHING"
            )

            inserted = 0
            for row in rows:
                values = [row[c] for c in columns]
                await dst.execute(sql, *values)
                inserted += 1
            print(f"[{table}] migrated {inserted} rows")
    finally:
        src.close()
        await dst.close()
    print("Migration complete")


def parse_args():
    parser = argparse.ArgumentParser(description="Migrate GenSafe SQLite data to PostgreSQL")
    parser.add_argument("--sqlite-path", required=True, help="Path to SQLite database file")
    parser.add_argument("--pg-dsn", required=True, help="PostgreSQL DSN, e.g. postgresql://user:pass@host:5432/db")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(migrate(args.sqlite_path, args.pg_dsn))
