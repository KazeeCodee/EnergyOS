param(
  [string]$SqlDir = "C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03",
  [string]$Table = "",
  [string]$Group = "",
  [switch]$All,
  [int]$BatchSize = 5000,
  [int]$LogEvery = 50000
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogDir "railway_raw_load_$Stamp.log"

Set-Location $Root

$ArgsList = @(
  "run", "python", "pipeline\railway_load_raw.py",
  "--sql-dir", $SqlDir,
  "load",
  "--batch-size", "$BatchSize",
  "--log-every", "$LogEvery"
)

if ($Table -ne "") {
  $ArgsList += @("--tabla", $Table)
} elseif ($Group -ne "") {
  $ArgsList += @("--grupo", $Group)
} elseif ($All) {
  $ArgsList += "--all"
} else {
  $ArgsList += "--all"
}

Write-Host "Starting Railway raw load..."
Write-Host "Log file: $LogFile"
Write-Host "Command: railway $($ArgsList -join ' ')"

& railway @ArgsList 2>&1 | Tee-Object -FilePath $LogFile
