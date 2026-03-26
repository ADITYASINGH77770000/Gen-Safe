"""
Local backend load-and-smoke harness.

Examples:
  python backend/scripts/load_test.py --base-url http://127.0.0.1:8000 \
      --email admin@gensafe.com --password admin123 --iterations 20 --concurrency 5

  python backend/scripts/load_test.py --base-url http://127.0.0.1:8000 \
      --sample-file backend/static/uploads/sample_invoice.png
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
from pathlib import Path

import httpx


def parse_args():
    parser = argparse.ArgumentParser(description="Run a local smoke/load test against the GenSafe backend")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend base URL")
    parser.add_argument("--email", default="admin@gensafe.com", help="Login email")
    parser.add_argument("--password", default="admin123", help="Login password")
    parser.add_argument("--iterations", type=int, default=10, help="Number of read requests to execute")
    parser.add_argument("--concurrency", type=int, default=4, help="Parallel request count")
    parser.add_argument("--sample-file", help="Optional document to submit through OCR + pipeline")
    parser.add_argument("--sample-filename", help="Filename to send with --sample-file")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP timeout in seconds")
    return parser.parse_args()


async def login(client: httpx.AsyncClient, base_url: str, email: str, password: str) -> str:
    response = await client.post(
        f"{base_url}/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    response.raise_for_status()
    token = response.json()["access_token"]
    return token


async def run_read_mix(client: httpx.AsyncClient, base_url: str, headers: dict, iterations: int, concurrency: int):
    endpoints = [
        "/api/v1/ops/health",
        "/api/v1/ops/security",
        "/api/v1/invoice/list",
        "/api/v1/audit/stats",
    ]

    timings = []

    async def one_request(index: int):
        endpoint = endpoints[index % len(endpoints)]
        start = time.perf_counter()
        response = await client.get(f"{base_url}{endpoint}", headers=headers)
        elapsed = (time.perf_counter() - start) * 1000
        response.raise_for_status()
        timings.append(elapsed)

    for offset in range(0, iterations, concurrency):
        batch = [asyncio.create_task(one_request(i)) for i in range(offset, min(offset + concurrency, iterations))]
        await asyncio.gather(*batch)

    return timings


async def run_document_flow(client: httpx.AsyncClient, base_url: str, headers: dict, sample_file: str, sample_filename: str | None):
    path = Path(sample_file)
    if not path.exists():
        raise FileNotFoundError(f"Sample file not found: {sample_file}")

    filename = sample_filename or path.name
    with path.open("rb") as handle:
        files = {"file": (filename, handle.read(), "application/octet-stream")}
        data = {"currency": "USD"}
        response = await client.post(
            f"{base_url}/api/v1/invoice/analyze",
            headers=headers,
            files=files,
            data=data,
        )
    response.raise_for_status()
    payload = response.json()
    job_id = payload["job_id"]

    deadline = time.time() + 120
    last = None
    while time.time() < deadline:
        result = await client.get(f"{base_url}/api/v1/invoice/{job_id}/result", headers=headers)
        result.raise_for_status()
        last = result.json()
        if last.get("status") in {"completed", "failed"}:
            break
        await asyncio.sleep(1)

    return {"submit": payload, "result": last}


async def main():
    args = parse_args()
    timeout = httpx.Timeout(args.timeout)
    async with httpx.AsyncClient(timeout=timeout) as client:
        token = await login(client, args.base_url, args.email, args.password)
        headers = {"Authorization": f"Bearer {token}"}

        read_timings = await run_read_mix(client, args.base_url, headers, args.iterations, args.concurrency)
        summary = {
            "iterations": args.iterations,
            "concurrency": args.concurrency,
            "min_ms": round(min(read_timings), 2) if read_timings else None,
            "max_ms": round(max(read_timings), 2) if read_timings else None,
            "avg_ms": round(statistics.mean(read_timings), 2) if read_timings else None,
            "p95_ms": round(statistics.quantiles(read_timings, n=20)[18], 2) if len(read_timings) >= 20 else None,
        }

        document_flow = None
        if args.sample_file:
            document_flow = await run_document_flow(client, args.base_url, headers, args.sample_file, args.sample_filename)

        print(
            json.dumps(
                {
                    "summary": summary,
                    "document_flow": document_flow,
                },
                indent=2,
                default=str,
            )
        )


if __name__ == "__main__":
    asyncio.run(main())
