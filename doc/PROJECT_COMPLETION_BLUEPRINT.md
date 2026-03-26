# GenSafe Completion Blueprint (Backward-Compatible)

This blueprint completes the remaining roadmap in production-safe phases while preserving existing behavior.

## Non-Negotiables
- Keep all existing API routes and payload shapes working.
- Keep current decision behavior unless explicitly toggled by environment flag.
- Add new capabilities behind flags and with safe defaults.
- Every phase ships with smoke checks and rollback path.

## Current Status Snapshot
- Implemented: invoice ingestion, OCR, LLM analysis, anomaly scoring, risk aggregation, alerting, audit trail, dashboard, tasks.
- Implemented now: object storage abstraction (local/S3), dispatch abstraction, ACP message table + APIs, escalation runner, Redis-capable context cache, QuickBooks/Xero OAuth APIs, provider-specific webhook endpoints, SQLite->PostgreSQL migration script, CV/multilingual/fraud simulation agents, security hardening knobs, audit integrity chain, retention tooling, local load-test harness, backend runbook.
- Missing/partial: cloud deployment setup only, plus any external production rollout items the team chooses to keep out of scope.

## Progress (Backend)
- Phase 1: Completed.
- Phase 2: Completed (except cloud deployment setup by request).
- Phase 3: Completed.
- Phase 4: Completed for OAuth/webhooks/escalation baseline.
- Phase 5: Completed except cloud deployment by request.

## Phase 1 - Stabilize Core (Now)
### Scope
- Context Retrieval Agent (single context packet for downstream workers).
- Verification Agent (guardrails, default disabled for compatibility).
- Workflow Health Monitor endpoint for queue/SLA visibility.
- Environment hardening and secure `.env.example`.

### Acceptance
- Existing invoice flow still works unchanged.
- `GET /api/v1/ops/health` returns status + metrics.
- With `ENABLE_VERIFICATION_RULES=false`, decisions remain legacy-compatible.

## Phase 2 - Data and Infrastructure Upgrade
### Scope
- Move from SQLite to PostgreSQL in non-breaking migration.
- Add Redis cache and optional message queue abstraction.
- Add S3 storage abstraction (local fallback remains).
- Add migration scripts + backup/restore scripts.

### Acceptance
- Zero route contract changes.
- Backfill scripts complete without data loss.
- Read/write latency and queue depth visible from health endpoint.

## Phase 3 - Agentic Expansion
### Scope
- Add CV agent and multilingual extraction path.
- Add formal agent communication envelope and trace chaining.
- Add verification policy packs per tenant/risk profile.
- Add conflict-resolution policy for multi-agent disagreements.

### Acceptance
- New agent outputs merged into aggregator without breaking existing fields.
- Each agent action logged in `agent_decisions` with trace continuity.

## Phase 4 - ERP and Workflow Automation
### Scope
- QuickBooks/Xero OAuth connectors.
- SLA escalation automation for tasks and stuck invoice jobs.
- Notifications (email/Slack/Teams) with retry and dead-letter handling.

### Acceptance
- ERP webhook + callback loop validated in sandbox.
- Escalation rules produce deterministic outcomes.

## Phase 5 - Compliance and Scale
### Scope
- Security hardening: shorter JWT lifetimes, secrets strategy, stricter CORS.
- Immutable audit controls and retention policy.
- CI/CD and deployment hardening (Docker/ECS/K8s path).
- Load tests and incident playbooks.

### Acceptance
- Security checklist green.
- Load profile sustained at target throughput.
- Runbooks tested for failover and rollback.

## Execution Model
- Small, reversible pull requests.
- Feature flags for all behavior-changing logic.
- Per-phase demo checklist and go/no-go gate.
