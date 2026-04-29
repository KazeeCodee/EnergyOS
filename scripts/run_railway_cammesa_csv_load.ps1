param(
  [string]$CsvDir = "C:\Users\quime\Downloads\CAMMESA",
  [switch]$Critical,
  [switch]$All,
  [string]$Dataset = "",
  [int]$BatchSize = 2000
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogDir "railway_cammesa_csv_load_$Stamp.log"

Set-Location $Root

$ArgsList = @(
  "run", "python", "pipeline\railway_load_cammesa_csvs.py",
  "--csv-dir", $CsvDir,
  "--batch-size", "$BatchSize"
)

if ($Critical) {
  $ArgsList += "--critical"
}
if ($Dataset -ne "") {
  $ArgsList += @("--dataset", $Dataset)
}

$ArgsList += "load"

Write-Host "Starting Railway CAMMESA CSV load..."
Write-Host "Log file: $LogFile"
Write-Host "Command: railway $($ArgsList -join ' ')"
& railway @ArgsList 2>&1 | Tee-Object -FilePath $LogFile
