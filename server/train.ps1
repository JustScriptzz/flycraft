# One-command headless training: ensures the server + brain are up
# (reuses them if already running), then trains in the foreground.
# Usage: powershell -ExecutionPolicy Bypass -File train.ps1 [-Episodes 200]
param([int]$Episodes = 200)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$pidsFile = "$root/server/.pids"

function Alive($id, $name) {
  try {
    $p = Get-Process -Id $id -ErrorAction Stop
    return $p.ProcessName -like "*$name*"
  } catch { return $false }
}

$srvPid = $null
$brnPid = $null
if (Test-Path $pidsFile) {
  $parts = (Get-Content $pidsFile).Split(' ',
    [System.StringSplitOptions]::RemoveEmptyEntries)
  if ($parts.Count -ge 1 -and (Alive $parts[0] 'java')) { $srvPid = $parts[0] }
  if ($parts.Count -ge 2 -and (Alive $parts[1] 'python')) { $brnPid = $parts[1] }
}
if (-not $srvPid) {
  Write-Host '[train] starting server...'
  $srv = Start-Process -FilePath 'java' `
    -ArgumentList '-Xmx2G', '-Xms1G', '-jar', 'server.jar', 'nogui' `
    -WorkingDirectory "$root/server" -PassThru
  $srvPid = $srv.Id
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    if ((Test-Path "$root/server/logs/latest.log") -and
        (Select-String -Path "$root/server/logs/latest.log" -Pattern 'Done \(' -Quiet)) { break }
  }
} else {
  Write-Host "[train] reusing server pid=$srvPid"
}
if (-not $brnPid) {
  Write-Host '[train] starting brain (old weights are ignored, fresh brain)...'
  $brn = Start-Process -FilePath 'python' -ArgumentList 'serve.py' `
    -WorkingDirectory "$root/brain" -PassThru `
    -RedirectStandardOutput "$root/brain/brain.log"
  $brnPid = $brn.Id
  Start-Sleep -Seconds 5
} else {
  Write-Host "[train] reusing brain pid=$brnPid"
}
"$srvPid $brnPid" | Set-Content $pidsFile

Write-Host "[train] training $Episodes episodes (episodes alternate chop/beacon)."
Write-Host '[train] watch: http://127.0.0.1:8766/dashboard.html (needs brain up)'
Write-Host '[train] Ctrl+C stops the bot; server+brain stay up for next time.'
Push-Location "$root/bot"
try {
  node bot.js --episodes $Episodes
} finally {
  Pop-Location
}
Write-Host '[train] bot done. server+brain still running — stop_all.ps1 stops everything.'
