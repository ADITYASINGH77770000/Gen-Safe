"""ERP OAuth 2.0 integration service for QuickBooks and Xero."""
from __future__ import annotations

import base64
import json
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy import text


SUPPORTED_PROVIDERS = {"quickbooks", "xero"}


class ERPOAuthService:
    def __init__(self, db):
        self.db = db

    async def list_providers(self) -> list[dict]:
        result = await self.db.execute(
            text(
                """
                SELECT provider, enabled, auth_url, token_url, scopes, redirect_uri, updated_at
                FROM erp_integrations
                ORDER BY provider
                """
            )
        )
        rows = [dict(r) for r in result.mappings().all()]
        for row in rows:
            token = await self._get_token_row(row["provider"])
            row["connected"] = bool(token and token.get("access_token"))
            row["token_expires_at"] = token.get("expires_at") if token else None
        return rows

    async def configure_provider(
        self,
        provider: str,
        client_id: str | None,
        client_secret: str | None,
        redirect_uri: str | None,
        scopes: str | None,
        enabled: bool | None,
    ) -> dict:
        provider = self._normalize_provider(provider)
        existing = await self._get_provider_row(provider)
        if not existing:
            raise ValueError(f"Unsupported provider: {provider}")

        await self.db.execute(
            text(
                """
                UPDATE erp_integrations
                SET client_id=:client_id,
                    client_secret=:client_secret,
                    redirect_uri=:redirect_uri,
                    scopes=:scopes,
                    enabled=:enabled,
                    updated_at=CURRENT_TIMESTAMP
                WHERE provider=:provider
                """
            ),
            {
                "provider": provider,
                "client_id": client_id or existing.get("client_id"),
                "client_secret": client_secret or existing.get("client_secret"),
                "redirect_uri": redirect_uri or existing.get("redirect_uri"),
                "scopes": scopes or existing.get("scopes"),
                "enabled": 1 if (enabled if enabled is not None else bool(existing.get("enabled"))) else 0,
            },
        )
        await self.db.commit()
        return await self.get_provider_status(provider)

    async def create_auth_url(self, provider: str) -> dict:
        provider = self._normalize_provider(provider)
        cfg = await self._require_config(provider)
        if not cfg.get("client_id"):
            raise ValueError(f"{provider} client_id is not configured")
        if not cfg.get("redirect_uri"):
            raise ValueError(f"{provider} redirect_uri is not configured")

        state = secrets.token_urlsafe(24)
        await self.db.execute(
            text(
                """
                INSERT INTO erp_oauth_states (state, provider, consumed, created_at)
                VALUES (:state, :provider, 0, CURRENT_TIMESTAMP)
                """
            ),
            {"state": state, "provider": provider},
        )
        await self.db.commit()

        query = {
            "response_type": "code",
            "client_id": cfg["client_id"],
            "redirect_uri": cfg["redirect_uri"],
            "scope": cfg.get("scopes") or "",
            "state": state,
        }
        if provider == "quickbooks":
            query["response_type"] = "code"
        elif provider == "xero":
            query["response_type"] = "code"

        return {
            "provider": provider,
            "state": state,
            "auth_url": f"{cfg['auth_url']}?{urlencode(query)}",
        }

    async def handle_callback(
        self,
        provider: str,
        code: str,
        state: str,
        extra: dict | None = None,
    ) -> dict:
        provider = self._normalize_provider(provider)
        await self._consume_state(provider, state)
        cfg = await self._require_config(provider)

        if not cfg.get("client_id") or not cfg.get("client_secret"):
            raise ValueError(f"{provider} is missing client credentials")

        token_resp = await self._exchange_authorization_code(
            provider=provider,
            token_url=cfg["token_url"],
            client_id=cfg["client_id"],
            client_secret=cfg["client_secret"],
            code=code,
            redirect_uri=cfg["redirect_uri"],
        )
        await self._store_token(provider, token_resp)
        status = await self.get_provider_status(provider)
        return {"message": "OAuth callback processed", **status, "extra": extra or {}}

    async def refresh_token(self, provider: str) -> dict:
        provider = self._normalize_provider(provider)
        cfg = await self._require_config(provider)
        token = await self._get_token_row(provider)
        if not token or not token.get("refresh_token"):
            raise ValueError(f"No refresh token available for {provider}")

        if not cfg.get("client_id") or not cfg.get("client_secret"):
            raise ValueError(f"{provider} is missing client credentials")

        refreshed = await self._exchange_refresh_token(
            provider=provider,
            token_url=cfg["token_url"],
            client_id=cfg["client_id"],
            client_secret=cfg["client_secret"],
            refresh_token=token["refresh_token"],
        )
        await self._store_token(provider, refreshed)
        return {"message": "Token refreshed", **(await self.get_provider_status(provider))}

    async def get_provider_status(self, provider: str) -> dict:
        provider = self._normalize_provider(provider)
        cfg = await self._require_config(provider)
        token = await self._get_token_row(provider)
        return {
            "provider": provider,
            "enabled": bool(cfg.get("enabled")),
            "configured": bool(cfg.get("client_id") and cfg.get("client_secret")),
            "connected": bool(token and token.get("access_token")),
            "expires_at": token.get("expires_at") if token else None,
            "scope": token.get("scope") if token else None,
            "redirect_uri": cfg.get("redirect_uri"),
            "scopes": cfg.get("scopes"),
        }

    async def _require_config(self, provider: str) -> dict:
        row = await self._get_provider_row(provider)
        if not row:
            raise ValueError(f"Provider not found: {provider}")
        return row

    async def _get_provider_row(self, provider: str) -> dict | None:
        result = await self.db.execute(
            text("SELECT * FROM erp_integrations WHERE provider=:provider"),
            {"provider": provider},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def _get_token_row(self, provider: str) -> dict | None:
        result = await self.db.execute(
            text("SELECT * FROM erp_tokens WHERE provider=:provider"),
            {"provider": provider},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def _consume_state(self, provider: str, state: str):
        result = await self.db.execute(
            text(
                """
                SELECT state, consumed, created_at
                FROM erp_oauth_states
                WHERE state=:state AND provider=:provider
                """
            ),
            {"state": state, "provider": provider},
        )
        row = result.mappings().first()
        if not row:
            raise ValueError("Invalid OAuth state")
        if int(row.get("consumed") or 0) == 1:
            raise ValueError("OAuth state already consumed")
        await self.db.execute(
            text("UPDATE erp_oauth_states SET consumed=1 WHERE state=:state"),
            {"state": state},
        )
        await self.db.commit()

    async def _store_token(self, provider: str, token_resp: dict):
        expires_in = int(token_resp.get("expires_in") or 3600)
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        await self.db.execute(
            text("DELETE FROM erp_tokens WHERE provider=:provider"),
            {"provider": provider},
        )
        await self.db.execute(
            text(
                """
                INSERT INTO erp_tokens
                    (provider, access_token, refresh_token, token_type, scope, expires_at, raw_json, updated_at)
                VALUES
                    (:provider, :access_token, :refresh_token, :token_type, :scope, :expires_at, :raw_json, CURRENT_TIMESTAMP)
                """
            ),
            {
                "provider": provider,
                "access_token": token_resp.get("access_token"),
                "refresh_token": token_resp.get("refresh_token"),
                "token_type": token_resp.get("token_type"),
                "scope": token_resp.get("scope"),
                "expires_at": expires_at.isoformat(),
                "raw_json": json.dumps(token_resp, default=str),
            },
        )
        await self.db.commit()

    async def _exchange_authorization_code(
        self,
        provider: str,
        token_url: str,
        client_id: str,
        client_secret: str,
        code: str,
        redirect_uri: str,
    ) -> dict:
        basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        headers = {
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(token_url, data=data, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def _exchange_refresh_token(
        self,
        provider: str,
        token_url: str,
        client_id: str,
        client_secret: str,
        refresh_token: str,
    ) -> dict:
        basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        headers = {
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(token_url, data=data, headers=headers)
            resp.raise_for_status()
            return resp.json()

    def _normalize_provider(self, provider: str) -> str:
        value = (provider or "").strip().lower()
        if value not in SUPPORTED_PROVIDERS:
            raise ValueError(f"Unsupported provider: {provider}")
        return value
