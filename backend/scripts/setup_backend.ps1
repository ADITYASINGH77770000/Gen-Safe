param(
  [string]$PythonCommand = "py -3.11"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$venvDir = Join-Path $backendDir ".venv"

Write-Host "Backend directory: $backendDir"

if (-not (Test-Path $venvDir)) {
  Write-Host "Creating virtual environment in $venvDir ..."
  & py -3.11 -m venv $venvDir
}

$venvPython = Join-Path $venvDir "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  throw "Virtual environment was not created successfully at $venvDir"
}

Write-Host "Upgrading pip..."
& $venvPython -m pip install --upgrade pip

Write-Host "Installing backend dependencies..."
& $venvPython -m pip install -r (Join-Path $backendDir "requirements.txt")

Write-Host ""
Write-Host "Setup complete."
Write-Host "Run the backend with:"
Write-Host "  powershell -ExecutionPolicy Bypass -File backend/scripts/run_backend.ps1"
