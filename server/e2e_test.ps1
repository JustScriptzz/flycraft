# E2E smoke test: server + brain + bot for N episodes (default 2), then
# prints the training log and shuts everything down.
# Run from the server folder:  powershell -ExecutionPolicy Bypass -File e2e_test.ps1 [-Episodes 2]
param([int]$Episodes = 2, [string]$ForceMine = '', [string]$SpawnDist = '')
$ErrorActionPreference = 'Stop'

$srv = Start-Process -FilePath 'java' `
  -ArgumentList '-Xmx2G', '-Xms1G', '-jar', 'server.jar', 'nogui' -PassThru
try {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    if ((Test-Path 'logs/latest.log') -and
        (Select-String -Path 'logs/latest.log' -Pattern 'Done \(' -Quiet)) { break }
  }
  $brn = Start-Process -FilePath 'python' -ArgumentList 'serve.py' `
    -WorkingDirectory '../brain' -PassThru
  Start-Sleep -Seconds 6
  Push-Location '../bot'
  try {
    $env:LOG_RCON = '1'
    if ($ForceMine -ne '') { $env:FORCE_MINE = $ForceMine }
    if ($SpawnDist -ne '') { $env:SPAWN_DIST = $SpawnDist }
    $env:DIG_DEBUG = '1'
    node bot.js --episodes $Episodes
  } finally {
    Pop-Location
  }
} finally {
  node ../bot/rcon_test.mjs 'stop'
  if ($brn -and -not $brn.HasExited) { Stop-Process -Id $brn.Id -Force }
  $srv | Wait-Process -Timeout 60 -ErrorAction SilentlyContinue
}
Write-Host '--- training.csv ---'
Get-Content '../brain/logs/training.csv'
