param(
  [string]$SqlDir = "C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03",
  [int]$BatchSize = 5000,
  [int]$LogEvery = 50000,
  [int]$Retries = 3,
  [switch]$OpenWindow
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogDir "railway_full_raw_load_$Stamp.log"

$Command = @(
  "Set-Location `"$Root`";",
  "railway run python pipeline\railway_full_raw_load.py",
  "--sql-dir `"$SqlDir`"",
  "--batch-size $BatchSize",
  "--log-every $LogEvery",
  "--retries $Retries",
  "2>&1 | Tee-Object -FilePath `"$LogFile`""
) -join " "

if ($OpenWindow) {
  Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $Command
  )
  Write-Host "Opened visible PowerShell window."
  Write-Host "Log file: $LogFile"
} else {
  Set-Location $Root
  Write-Host "Starting full Railway raw load..."
  Write-Host "Log file: $LogFile"
  Invoke-Expression $Command
}
