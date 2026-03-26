"""Caching service with Redis-first optional mode and memory fallback."""
from __future__ import annotations

import json
import time
from typing import Any

import structlog

from core.config import settings

logger = structlog.get_logger()


class CacheService:
    def __init__(self):
        self.mode = (settings.CACHE_MODE or "memory").lower()
        self._memory: dict[str, tuple[float, str]] = {}
        self._redis = None

        if self.mode == "redis":
            try:
                import redis.asyncio as redis  # type: ignore

                self._redis = redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    health_check_interval=30,
                )
            except Exception as exc:
                logger.warning(
                    "Redis cache unavailable, using memory fallback",
                    error=str(exc),
                )
                self.mode = "memory"

    async def get_json(self, key: str) -> Any | None:
        if self.mode == "redis" and self._redis is not None:
            try:
                raw = await self._redis.get(key)
                return json.loads(raw) if raw else None
            except Exception as exc:
                logger.warning("Redis get failed, falling back to memory", error=str(exc))
                self.mode = "memory"

        cached = self._memory.get(key)
        if not cached:
            return None
        expires_at, raw = cached
        if time.time() >= expires_at:
            self._memory.pop(key, None)
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def set_json(self, key: str, value: Any, ttl_seconds: int):
        payload = json.dumps(value, default=str)
        if self.mode == "redis" and self._redis is not None:
            try:
                await self._redis.set(key, payload, ex=ttl_seconds)
                return
            except Exception as exc:
                logger.warning("Redis set failed, falling back to memory", error=str(exc))
                self.mode = "memory"

        self._memory[key] = (time.time() + max(1, int(ttl_seconds)), payload)

    async def delete(self, key: str):
        if self.mode == "redis" and self._redis is not None:
            try:
                await self._redis.delete(key)
            except Exception:
                pass
        self._memory.pop(key, None)


cache_service = CacheService()
