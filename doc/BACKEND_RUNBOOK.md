# GenSafe Backend Runbook

## Start Locally
1. `cd backend`
2. Set `GEMINI_API_KEY` in `backend/.env`
3. Create and install the backend virtual environment with `powershell -ExecutionPolicy Bypass -File backend/scripts/setup_backend.ps1`
4. Run the backend with `powershell -ExecutionPolicy Bypass -File backend/scripts/run_backend.ps1 -Reload`

## If A Package Is Missing
1. Make sure you are using the backend `.venv`
2. Re-run `backend/scripts/setup_backend.ps1`
3. Avoid mixing system Python, the Microsoft Store Python, and the backend venv

## Verify OCR
1. Set `TESSERACT_CMD` to the full `tesseract.exe` path if it is not already on `PATH`.
2. Upload a scanned PDF or image through `POST /api/v1/invoice/analyze`.
3. Check the logs for `Image OCR started`, `Image OCR completed`, `PDF OCR started`, or `PDF OCR completed`.

## Verify Workflow
1. `GET /api/v1/ops/health`
2. `GET /api/v1/ops/security`
3. `GET /api/v1/audit/integrity`

## Retention
1. Preview old audit rows with `GET /api/v1/audit/retention`
2. Archive or purge locally with `python backend/scripts/audit_maintenance.py --purge`
3. Keep `ENABLE_AUDIT_RETENTION=false` unless you intentionally want purge mode enabled

## Smoke / Load Test
1. Run `python backend/scripts/load_test.py --base-url http://127.0.0.1:8000`
2. Add `--sample-file <path>` to exercise OCR and the full invoice pipeline

## Rollback
1. Stop the backend
2. Restore the previous `backend/.env`
3. Restore the SQLite database backup or point `DATABASE_URL` back to the previous target
