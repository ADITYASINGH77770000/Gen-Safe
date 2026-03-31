@echo off
setlocal
cd /d "%~dp0backend"
if exist ".venv\Scripts\python.exe" (
  .venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
) else (
  echo [WARN] .venv not found, falling back to system python.
  python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
)
