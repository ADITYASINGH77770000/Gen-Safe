# GenSafe B2B

GenSafe B2B is an AI-assisted invoice fraud detection and workflow operations app.

## Run locally

Backend:

```powershell
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm start
```

## What it includes

- Invoice upload and analysis
- Fraud alerts and analyst feedback
- Supplier profiles and baselines
- Task extraction from meeting transcripts
- Audit trail and integrity tools
- Ops center for health, OCR, integrations, and webhooks
- Workflow health monitor and self-correction tools
- Automated maintenance sweeps for health, escalations, baselines, and audit retention
- Audit archive and purge workflow from the Ops Center

## Convenience launchers

- `start_backend.bat`
- `start_frontend.bat`
