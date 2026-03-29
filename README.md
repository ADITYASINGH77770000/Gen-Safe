<div align="center">

<!-- Animated typing SVG header -->
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=40&duration=3000&pause=1000&color=00E5FF&center=true&vCenter=true&width=600&lines=GenSafe+B2B;Invoice+Fraud+Detection;Multi-Agent+AI+Platform" alt="GenSafe B2B"/>

<p><em>Agentic AI invoice fraud detection & workflow operations — powered by Google Gemini 2.0 Flash</em></p>

<br/>

<!-- Primary badges -->
![Version](https://img.shields.io/badge/version-1.0.0-00e5ff?style=for-the-badge&logo=github&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black)
![Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-ff4b6e?style=for-the-badge)

<br/>

<!-- Secondary badges -->
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-red?style=flat-square&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-ready-336791?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-optional-DC382D?style=flat-square&logo=redis&logoColor=white)
![S3](https://img.shields.io/badge/S3-optional-FF9900?style=flat-square&logo=amazons3&logoColor=white)
![Tesseract](https://img.shields.io/badge/OCR-Tesseract-5C2D91?style=flat-square)

</div>

---

## What is GenSafe B2B?

GenSafe B2B is a full-stack B2B SaaS platform that autonomously detects invoice fraud using a multi-agent AI pipeline. It ingests invoices (PDF, PNG, JPG, TXT), runs OCR, dispatches a 20-step agentic pipeline backed by Gemini, aggregates risk scores, and routes each invoice to auto-approve, human review, or auto-block — all with a complete audit trail.

---

## Features

| | Feature | Description |
|---|---|---|
| 🧾 | **Invoice Ingestion & OCR** | Upload PDF / PNG / JPG / TXT. Tesseract + PyMuPDF extract text automatically. |
| 🤖 | **Gemini AI Analysis** | Gemini 2.0 Flash scores risk, flags anomalies, and generates human-readable explanations. |
| 🚨 | **Fraud Alerts** | Auto-triaged alerts with risk scores. Analysts approve, escalate, or give feedback. |
| 🏢 | **Supplier Baselines** | Per-supplier behavioral baselines auto-computed and refreshed in the background. |
| 📋 | **Meeting → Tasks** | Paste a transcript; Gemini extracts action items, assignees, and due dates. |
| 🔗 | **QuickBooks & Xero OAuth** | Full OAuth 2.0 connector flow + webhook endpoints for real-time ERP events. |
| 🔒 | **Immutable Audit Trail** | Hash-chained audit log with integrity verification, retention policies, and archive/purge. |
| ⚡ | **Ops Center & Health Monitor** | Queue depth, SLA tracking, OCR status, integration health — all in one dashboard. |
| 🔁 | **Self-Correction & Maintenance** | Background loops auto-refresh baselines, run escalations, and heal stuck jobs. |

---

## Tech Stack

<div align="center">

![FastAPI](https://img.shields.io/badge/-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/-Python_3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Google Gemini](https://img.shields.io/badge/-Gemini_2.0_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
![React](https://img.shields.io/badge/-React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/-Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)
![Recharts](https://img.shields.io/badge/-Recharts-22B5BF?style=for-the-badge&logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![SQLite](https://img.shields.io/badge/-SQLite_(dev)-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Redis](https://img.shields.io/badge/-Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Amazon S3](https://img.shields.io/badge/-Amazon_S3-FF9900?style=for-the-badge&logo=amazons3&logoColor=white)
![JWT](https://img.shields.io/badge/-JWT_Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Tesseract](https://img.shields.io/badge/-Tesseract_OCR-5C2D91?style=for-the-badge)

</div>

---

## Architecture

```
Upload (PDF/PNG/TXT)
      │
      ▼
   OCR Layer
(Tesseract / PyMuPDF)
      │
      ▼
 Orchestrator Agent  (20-step pipeline)
      │
      ├── Context Agent        ── loads invoice + supplier data
      ├── Gemini LLM           ── risk analysis & explanation
      ├── Anomaly Agent        ── statistical deviation scoring
      ├── Verification Agent   ── policy rule checks
      ├── CV Agent             ── computer vision checks
      ├── Multilingual Agent   ── non-English invoice support
      ├── Fraud Sim Agent      ── adversarial pattern matching
      ├── GAN Agent            ── generative anomaly detection
      └── Audit Agent          ── every step logged with trace ID
                                        │
      ▼                                 │
  Risk Aggregator → Score 0–100 → Decision Engine ──────────────┘
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                   ▼
              Auto-Approve        Human Review         Auto-Block
               score < 25          25 – 80             score > 80
```

---

## Quick Start

### Prerequisites

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Tesseract](https://img.shields.io/badge/Tesseract-OCR_required-5C2D91?style=flat-square)
![Gemini Key](https://img.shields.io/badge/Google_AI_Studio-API_Key_required-4285F4?style=flat-square&logo=google&logoColor=white)

### 1. Clone & configure

```bash
git clone https://github.com/your-org/gen-safe.git
cd gen-safe
cp backend/.env.example backend/.env
# Open backend/.env and set GEMINI_API_KEY
```

### 2. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

> App → `http://localhost:3000` &nbsp;|&nbsp; API docs → `http://localhost:8000/docs`

### Windows convenience launchers

```
start_backend.bat
start_frontend.bat
```

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini 2.0 Flash |
| `JWT_SECRET` | Secret for signing JWT tokens — **change in production** |

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./gensafe.db` | Use `postgresql+asyncpg://user:pass@host:5432/db` for production |

### Risk Thresholds

| Variable | Default | Description |
|---|---|---|
| `RISK_AUTO_APPROVE` | `25.0` | Invoices below this score are automatically approved |
| `RISK_HUMAN_REVIEW` | `60.0` | Invoices above this enter the human review queue |
| `RISK_AUTO_BLOCK` | `80.0` | Invoices above this are automatically blocked |

### Optional

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | — | Redis connection string; falls back to in-memory cache if unset |
| `CACHE_MODE` | `memory` | Set to `redis` to enable Redis-backed context cache |
| `OBJECT_STORAGE_MODE` | `local` | Set to `s3` and configure bucket vars for cloud archive |
| `OBJECT_STORAGE_S3_BUCKET` | — | S3 bucket name for invoice archiving |
| `TESSERACT_CMD` | auto | Full path to tesseract binary if not on system PATH |
| `NOTIFICATION_WEBHOOK_URL` | — | Slack / Teams / custom webhook URL for escalation alerts |
| `ENABLE_VERIFICATION_RULES` | `false` | Enable strict verification agent |
| `ENABLE_SECURITY_HARDENING` | `false` | Shorter JWT lifetimes, stricter CORS, security headers |
| `ENABLE_AUDIT_RETENTION` | `false` | Enable automatic audit log retention sweeps |
| `ALLOW_AUDIT_PURGE` | `false` | Allow permanent purge of archived audit records |
| `AUDIT_RETENTION_DAYS` | `365` | How long audit records are kept before archiving |
| `ENABLE_BACKGROUND_MAINTENANCE` | `true` | Set to `false` to disable the background maintenance loop |

---

## API Reference

All routes prefixed with `/api/v1`. Swagger UI at `/docs`.

<details>
<summary><strong>🔐 Auth</strong></summary>

| Method | Route | Description |
|---|---|---|
| `POST` | `/auth/login` | Obtain JWT token |
| `POST` | `/auth/register` | Create a new user account |

</details>

<details>
<summary><strong>🧾 Invoices</strong></summary>

| Method | Route | Description |
|---|---|---|
| `POST` | `/invoice/upload` | Upload an invoice file (PDF/PNG/JPG/TXT) |
| `GET` | `/invoice/list` | List all invoices |
| `GET` | `/invoice/{id}` | Get invoice detail + risk analysis |
| `POST` | `/invoice/{id}/reprocess` | Re-run the AI pipeline on an existing invoice |

</details>

<details>
<summary><strong>🚨 Alerts</strong></summary>

| Method | Route | Description |
|---|---|---|
| `GET` | `/alert/list` | List all fraud alerts |
| `GET` | `/alert/{id}` | Get alert detail |
| `POST` | `/alert/{id}/feedback` | Submit analyst feedback / decision |

</details>

<details>
<summary><strong>🏢 Suppliers</strong></summary>

| Method | Route | Description |
|---|---|---|
| `GET` | `/supplier/list` | List all suppliers |
| `GET` | `/supplier/{id}` | Get supplier profile + baseline |
| `POST` | `/supplier/create` | Create a new supplier |

</details>

<details>
<summary><strong>📋 Tasks</strong></summary>

| Method | Route | Description |
|---|---|---|
| `POST` | `/task/extract` | Extract tasks from a meeting transcript |
| `GET` | `/task/list` | List all tasks |
| `POST` | `/task/{id}/complete` | Mark a task as complete |

</details>

<details>
<summary><strong>⚙️ Ops, Health & Self-Correction</strong></summary>

| Method | Route | Description |
|---|---|---|
| `GET` | `/ops/health` | Workflow queue + SLA snapshot |
| `GET` | `/ops/security` | Current security posture |
| `GET` | `/ops/ocr-status` | Tesseract availability check |
| `GET` | `/health/workflow` | Agent health metrics |
| `POST` | `/selfcorrect/baselines` | Trigger baseline recompute |

</details>

<details>
<summary><strong>🔗 Integrations & Webhooks</strong></summary>

| Method | Route | Description |
|---|---|---|
| `GET` | `/integration/quickbooks/auth` | Start QuickBooks OAuth flow |
| `GET` | `/integration/xero/auth` | Start Xero OAuth flow |
| `POST` | `/webhook/quickbooks` | Receive QuickBooks events |
| `POST` | `/webhook/xero` | Receive Xero events |

</details>

---

## Frontend Pages

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Risk summary, recent activity, charts |
| Alerts | `/alerts` | All fraud alerts with filters |
| Alert Detail | `/alerts/:id` | Full AI analysis + analyst actions |
| Invoices | `/invoices` | Invoice list with status and risk scores |
| Suppliers | `/suppliers` | Supplier profiles and baselines |
| Tasks | `/tasks` | Extracted tasks from transcripts |
| Audit Trail | `/audit` | Hash-chained audit log + integrity check |
| Ops Center | `/ops-center` | OCR, integrations, webhooks, security |
| Health Monitor | `/health` | Queue depth, SLA metrics, agent health |

---

## Project Structure

```
gen-safe/
├── backend/
│   ├── api/routes/           # All API route handlers
│   ├── core/                 # Config, database, auth
│   ├── services/
│   │   ├── agents/           # Orchestrator, Anomaly, Audit, CV, Multilingual, GAN…
│   │   ├── gemini_service.py
│   │   ├── document_processor.py
│   │   ├── erp_oauth_service.py
│   │   └── escalation_service.py
│   ├── scripts/              # Migration, load test, maintenance scripts
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/            # Dashboard, Alerts, Invoices, OpsCenter…
│   │   ├── components/       # Layout, RobotGuide, ThreeBackdrop
│   │   └── services/         # Axios API client
│   └── package.json
├── doc/
│   ├── BACKEND_RUNBOOK.md
│   └── PROJECT_COMPLETION_BLUEPRINT.md
├── start_backend.bat
└── start_frontend.bat
```

---

## Roadmap

![Phase 1](https://img.shields.io/badge/Phase_1-Core_Stabilization-00e5ff?style=flat-square) ✅ Context agent, verification agent, health monitor, env hardening

![Phase 2](https://img.shields.io/badge/Phase_2-Infrastructure-00e5ff?style=flat-square) ✅ PostgreSQL migration, Redis cache, S3 storage abstraction

![Phase 3](https://img.shields.io/badge/Phase_3-Agentic_Expansion-00e5ff?style=flat-square) ✅ CV agent, multilingual agent, ACP message envelope, trace chaining

![Phase 4](https://img.shields.io/badge/Phase_4-ERP_%26_Automation-00e5ff?style=flat-square) ✅ QuickBooks/Xero OAuth, SLA escalation, Slack/Teams notifications

![Phase 5](https://img.shields.io/badge/Phase_5-Compliance_%26_Scale-00e5ff?style=flat-square) ✅ Security hardening, immutable audit retention, load tests, runbook

---

<div align="center">

![Built with](https://img.shields.io/badge/Built_with-FastAPI_%2B_React_%2B_Gemini-00e5ff?style=for-the-badge)

**GenSafe B2B** · v1.0.0 · MIT License

</div>
