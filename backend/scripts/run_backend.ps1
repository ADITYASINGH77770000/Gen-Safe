param(
  [switch]$Reload
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
  throw "Virtual environment not found. Run backend/scripts/setup_backend.ps1 first."
}

Set-Location $backendDir

$args = @("-m", "uvicorn", "main:app")
if ($Reload) {
  $args += "--reload"
}

& $venvPython @args
