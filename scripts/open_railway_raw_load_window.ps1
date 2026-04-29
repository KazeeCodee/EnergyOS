param(
  [string]$SqlDir = "C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03",
  [string]$Table = "",
  [string]$Group = "",
  [switch]$All
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Loader = Join-Path $PSScriptRoot "start_railway_raw_load.ps1"

$ArgsList = @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$Loader`"",
  "-SqlDir", "`"$SqlDir`""
)

if ($Table -ne "") {
  $ArgsList += @("-Table", $Table)
} elseif ($Group -ne "") {
  $ArgsList += @("-Group", $Group)
} elseif ($All) {
  $ArgsList += "-All"
} else {
  $ArgsList += "-All"
}

Start-Process powershell -WorkingDirectory $Root -ArgumentList $ArgsList
